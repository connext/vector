#!/usr/bin/env bash
set -e

stack="node"
root=$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )
project=$(grep -m 1 '"name":' "$root/package.json" | cut -d '"' -f 4)

docker swarm init 2> /dev/null || true
docker network create --attachable --driver overlay "$project" 2> /dev/null || true

if grep -qs "$stack" <<<"$(docker stack ls --format '{{.Name}}')"
then echo "A $stack stack is already running" && exit 0;
fi

####################
# Load config

if [[ ! -f "$root/node.config.json" ]]
then cp "$root/ops/config/node.default.json" "$root/node.config.json"
fi

config=$(cat "$root/ops/config/node.default.json" "$root/node.config.json" | jq -s '.[0] + .[1]')

function getConfig {
  value=$(echo "$config" | jq ".$1" | tr -d '"')
  if [[ "$value" == "null" ]]
  then echo ""
  else echo "$value"
  fi
}

admin_token=$(getConfig adminToken)
aws_access_id=$(getConfig awsAccessId)
aws_access_key=$(getConfig awsAccessKey)
database_url=$(getConfig databaseUrl)
messaging_url=$(getConfig messagingUrl)
mnemonic=$(getConfig mnemonic)
production=$(getConfig production)
public_port=$(getConfig port)

chain_providers=$(echo "$config" | jq '.chainProviders' | tr -d '\n\r ')
default_providers=$(jq '.chainProviders' "$root/ops/config/node.default.json" | tr -d '\n\r ')
if [[ "$chain_providers" == "$default_providers" ]]
then use_local_evms=true
else use_local_evms=false
fi

if [[ "$production" == "true" ]]
then
  # If we're on the prod branch then use the release semvar, otherwise use the commit hash
  if [[ "$(git rev-parse --abbrev-ref HEAD)" == "prod" || "${GITHUB_REF##*/}" == "prod" ]]
  then version=$(grep -m 1 '"version":' package.json | cut -d '"' -f 4)
  else version=$(git rev-parse HEAD | head -c 8)
  fi
else version="latest"
fi

common="networks:
      - '$project'
    logging:
      driver: 'json-file'
      options:
          max-size: '10m'"

####################
# Start up dependencies

if [[ "$use_local_evms" == "true" ]]
then bash "$root/ops/start-chains.sh"
fi
if [[ -z "$messaging_url" ]]
then bash "$root/ops/start-messaging.sh"
fi

echo
echo "Preparing to launch $stack w config:"
echo " - chain_providers=$chain_providers"
echo " - messaging_url=$messaging_url"
echo " - production=$production"
echo " - public_port=$public_port"
echo " - version=$version"

########################################
# Chain config

# If no custom ethproviders are given, configure mnemonic/addresses from local evms
if [[ "$use_local_evms" == "true" ]]
then
  mnemonic_secret=""
  eth_mnemonic="${mnemonic:-candy maple cake sugar pudding cream honey rich smooth crumble sweet treat}"
  eth_mnemonic_file=""
  config=$(
    echo "$config" '{"chainAddresses":'"$(cat "$root/.chaindata/chain-addresses.json")"'}' \
    | jq -s '.[0] + .[1]'
  )

else
  echo "Connecting to external services: messaging=$messaging_url | chain_providers=$chain_providers"
  if [[ -n "$mnemonic" ]]
  then
    mnemonic_secret=""
    eth_mnemonic="$mnemonic"
    eth_mnemonic_file=""
  else
    mnemonic_secret="${project}_${stack}_mnemonic"
    eth_mnemonic=""
    eth_mnemonic_file="/run/secrets/$mnemonic_secret"
    if ! grep "$mnemonic_secret" <<<"$(docker secret ls --format '{{.Name}}')"
    then bash "$root/ops/save-secret.sh" "$mnemonic_secret"
    fi
  fi
fi

########################################
## Database config

db_driver="${DATABASE_DRIVER:-sqlite}"

##### sqlite
if [[ "$db_driver" == "sqlite" ]]
then
  # Hardhat ethprovider can't persist data between restarts
  # If we're using local evms, the node shouldn't perist data either
  if [[ "$use_local_evms" == "true" ]]
  then
    internal_db_file="/tmp/store.sqlite"
    mount_db=""
  else
    local_db_file="$root/.node.sqlite"
    internal_db_file="/data/store.sqlite"
    touch "$local_db_file"
    mount_db="--volume=$local_db_file:$internal_db_file"
  fi
  # Override database url
  database_url="sqlite://$internal_db_file"
  # No database service needed
  database_service=""

##### postgres
elif [[ "$db_driver" == "postgres" ]]
then
  database_image="${project}_database:$version";
  bash "$root/ops/pull-images.sh" "$database_image" > /dev/null

  # database connection settings
  pg_db="$project"
  pg_user="$project"
  pg_dev_port="5435"
  pg_host="database"
  pg_port="5432"

  if [[ "$production" == "true" ]]
  then
    # Use a secret to store the database password
    db_secret="${project}_${stack}_database"
    if ! grep -qs "$db_secret" <<<"$(docker secret ls --format '{{.Name}}')"
    then bash "$root/ops/save-secret.sh" "$db_secret" "$(head -c 32 /dev/urandom | xxd -plain -c 32)"
    fi
    pg_password=""
    pg_password_file="/run/secrets/$db_secret"
    snapshots_dir="$root/.db-snapshots"
    mkdir -p "$snapshots_dir"
    database_image="image: '$database_image'
    volumes:
      - 'database:/var/lib/postgresql/data'
      - '$snapshots_dir:/root/snapshots'
    secrets:
      - '$db_secret'"

  else
    # Pass in a dummy password via env vars
    db_secret=""
    pg_password="$project"
    pg_password_file=""
    database_image="image: '$database_image'
    ports:
      - '$pg_dev_port:$pg_port'"

    echo "${stack}_database will be exposed on *:$pg_dev_port"
  fi

  # Set database service
  database_service="database:
    $common
    $database_image
    environment:
      AWS_ACCESS_KEY_ID: '$aws_access_id'
      AWS_SECRET_ACCESS_KEY: '$aws_access_key'
      POSTGRES_DB: '$project'
      POSTGRES_PASSWORD: '$pg_password'
      POSTGRES_PASSWORD_FILE: '$pg_password_file'
      POSTGRES_USER: '$project'
      VECTOR_ADMIN_TOKEN: '$admin_token'
      VECTOR_PROD: '$production'
  "
else
  echo "Invalid driver: $db_driver" && exit 1
fi


########################################
## Node config

node_internal_port="8000"
node_public_port="${public_port:-8001}"
public_url="http://127.0.0.1:$node_public_port/ping"
echo "node will be exposed on *:$node_public_port"

if [[ "$production" == "true" ]]
then
  node_image_name="${project}_node:$version"
  node_image="image: '$node_image_name'
    ports:
      - '$node_public_port:$node_internal_port'"
else
  node_image_name="${project}_builder:$version";
  node_image="image: '$node_image_name'
    entrypoint: 'bash modules/server-node/ops/entry.sh'
    volumes:
      - '$root:/root'
    ports:
      - '$node_public_port:$node_internal_port'"
fi

node_env="environment:
      VECTOR_CONFIG: '$(echo "$config" | tr -d '\n\r')'"

bash "$root/ops/pull-images.sh" "$node_image_name" > /dev/null

# Add whichever secrets we're using to the node's service config
if [[ -n "$db_secret" || -n "$mnemonic_secret" ]]
then
  node_image="$node_image
    secrets:"
  if [[ -n "$db_secret" ]]
  then node_image="$node_image
      - '$db_secret'"
  fi
  if [[ -n "$mnemonic_secret" ]]
  then node_image="$node_image
      - '$mnemonic_secret'"
  fi
fi

####################
# Launch node

# Add secrets to the stack config
stack_secrets=""
if [[ -n "$db_secret" || -n "$mnemonic_secret" ]]
then
  stack_secrets="secrets:"
  if [[ -n "$db_secret" ]]
  then stack_secrets="$stack_secrets
  $db_secret:
    external: true"
  fi
  if [[ -n "$mnemonic_secret" ]]
  then stack_secrets="$stack_secrets
  $mnemonic_secret:
    external: true"
  fi
fi

# If file descriptors 0-2 exist, then we're prob running via interactive shell instead of on CD/CI
if [[ -t 0 && -t 1 && -t 2 ]]
then interactive=(--interactive --tty)
else echo "Running in non-interactive mode"
fi



docker_compose=$root/.$stack.docker-compose.yml
rm -f "$docker_compose"
cat - > "$docker_compose" <<EOF
version: '3.4'

networks:
  $project:
    external: true

$stack_secrets

volumes:
  certs:
  database:

services:

  node:
    $common
    $node_image
    $node_env
      VECTOR_PROD: '$production'
      VECTOR_MNEMONIC: '$eth_mnemonic'
      VECTOR_MNEMONIC_FILE: '$eth_mnemonic_file'
      VECTOR_DATABASE_URL: '$database_url'
      VECTOR_PG_DATABASE: '$pg_db'
      VECTOR_PG_HOST: '$pg_host'
      VECTOR_PG_PASSWORD: '$pg_password'
      VECTOR_PG_PASSWORD_FILE: '$pg_password_file'
      VECTOR_PG_PORT: '$pg_port'
      VECTOR_PG_USERNAME: '$pg_user'

  $database_service

EOF

docker stack deploy -c "$docker_compose" "$stack"

echo "The node has been deployed, waiting for $public_url to start responding.."
timeout=$(( $(date +%s) + 300 ))
while true
do
  res=$(curl -k -m 5 -s "$public_url" || true)
  if [[ -z "$res" ]]
  then
    if [[ "$(date +%s)" -gt "$timeout" ]]
    then echo "Timed out waiting for $public_url to respond.." && exit
    else sleep 2
    fi
  else echo "Good Morning!" && exit;
  fi
done
