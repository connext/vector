#!/usr/bin/env bash
set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"
registry="`cat $root/package.json | grep '"registry":' | head -n 1 | cut -d '"' -f 4`"

stack="node"

# turn on swarm mode if it's not already on
docker swarm init 2> /dev/null || true

# make sure a network for this project has been created
docker network create --attachable --driver overlay $project 2> /dev/null || true

if [[ -n "`docker stack ls --format '{{.Name}}' | grep "$project"`" ]]
then echo "A $project stack is already running" && exit 0;
fi

####################
# Load env vars

VECTOR_ENV="${VECTOR_ENV:-dev}"

# Load the default env
if [[ -f "${VECTOR_ENV}.env" ]]
then source "${VECTOR_ENV}.env"
fi

# Load instance-specific env vars & overrides
if [[ -f ".env" ]]
then source .env
fi

# log level alias can override default for easy `LOG_LEVEL=5 make start`
VECTOR_LOG_LEVEL="${LOG_LEVEL:-$VECTOR_LOG_LEVEL}";

####################
# Misc Config

# prod version: if we're on a tagged commit then use the tagged semvar, otherwise use the hash
if [[ "$VECTOR_ENV" == "prod" ]]
then
  git_tag="`git tag --points-at HEAD | grep "vector-" | head -n 1`"
  if [[ -n "$git_tag" ]]
  then version="`echo $git_tag | sed 's/vector-//'`"
  else version="`git rev-parse HEAD | head -c 8`"
  fi
else version="latest"
fi

echo "Using docker images ${project}_name:${version} "

builder_image_name="${project}_builder";
builder_image="$builder_image_name:$version";
bash ops/pull-images.sh $version $builder_image_name

redis_image="redis:5-alpine";
bash ops/pull-images.sh "$redis_image"

# to access from other containers
redis_url="redis://redis:6379"

common="networks:
      - '$project'
    logging:
      driver: 'json-file'
      options:
          max-size: '100m'"

####################
# Proxy config

proxy_image_name="${project}_proxy";
proxy_image="$proxy_image_name:$version";
bash ops/pull-images.sh $version $proxy_image_name

if [[ -z "$VECTOR_DOMAINNAME" ]]
then
  public_url="http://localhost:3000"
  proxy_ports="ports:
      - '3000:80'"
else
  public_url="https://localhost:443"
  proxy_ports="ports:
      - '80:80'
      - '443:443'"
fi

echo "Proxy configured"

########################################
## Database config

database_image_name="${project}_database";
database_image="$database_image_name:$version"
bash ops/pull-images.sh $version $database_image_name

snapshots_dir="$root/.db-snapshots"
mkdir -p $snapshots_dir

if [[ "$VECTOR_ENV" == "prod" ]]
then
  database_image="image: '$database_image'"
  db_volume="database"
  db_secret="${project}_database"
  bash ops/save-secret.sh $db_secret "`head -c 32 /dev/urandom | xxd -plain -c 32`"
else
  database_image="image: '$database_image'
    ports:
      - '5432:5432'"
  db_volume="database_dev"
  db_secret="${project}_database_dev"
  bash ops/save-secret.sh "$db_secret" "$project"
fi

# database connection settings
pg_db="$project"
pg_host="database"
pg_password_file="/run/secrets/$db_secret"
pg_port="5432"
pg_user="$project"

echo "Database configured"

########################################
# Global services config
# If no global service urls provided, spin up local ones & use those

if [[ -z "$VECTOR_AUTH_URL" ]]
then
  auth_port="5040"
  auth_url="http://auth:$auth_port"
  bash ops/start-global.sh
else
  auth_url="$VECTOR_AUTH_URL"
fi


########################################
# Chain provider config
# If no chain providers provided, spin up local testnets & use those

if [[ -z "$VECTOR_CHAIN_PROVIDERS" ]]
then
  mnemonic_secret_name="${project}_mnemonic_dev"
  echo 'No $VECTOR_CHAIN_PROVIDERS provided, spinning up local testnets & using those.'
  eth_mnemonic="candy maple cake sugar pudding cream honey rich smooth crumble sweet treat"
  bash ops/save-secret.sh "$mnemonic_secret_name" "$eth_mnemonic"
  bash ops/pull-images.sh $version "${project}_ethprovider"
  chain_id_1=1337; chain_id_2=1338;
  bash ops/start-testnet.sh $chain_id_1 $chain_id_2
  VECTOR_CHAIN_PROVIDERS="`cat $root/.chaindata/providers/${chain_id_1}-${chain_id_2}.json`"
  VECTOR_CONTRACT_ADDRESSES="`cat $root/.chaindata/addresses/${chain_id_1}-${chain_id_2}.json`"

# If chain providers are provided, use those
else
  mnemonic_secret_name="${project}_mnemonic"
  echo "Using chain providers:" $VECTOR_CHAIN_PROVIDERS
  # Prefer top-level address-book override otherwise default to one in contracts
  if [[ -f address-book.json ]]
  then VECTOR_CONTRACT_ADDRESSES="`cat address-book.json | tr -d ' \n\r'`"
  else VECTOR_CONTRACT_ADDRESSES="`cat modules/contracts/address-book.json | tr -d ' \n\r'`"
  fi
fi

VECTOR_MNEMONIC_FILE="/run/secrets/$mnemonic_secret_name"
ETH_PROVIDER_URL="`echo $VECTOR_CHAIN_PROVIDERS | tr -d "'" | jq '.[]' | head -n 1 | tr -d '"'`"

echo "Chain providers configured"

########################################
## Node config

node_port="8888"

if [[ $VECTOR_ENV == "prod" ]]
then
  node_image_name="${project}_node"
  bash ops/pull-images.sh $version $node_image_name
  node_image="image: '$node_image_name:$version'"
else
  echo "Running dev mode"
  node_image="image: '${project}_builder'
    entrypoint: 'bash modules/server-node/ops/entry.sh'
    volumes:
      - '$root:/root'
    ports:
      - '$node_port:$node_port'
      - '9229:9229'"
fi

echo "Node configured"

####################
# Launch Indra stack

echo "Launching ${project}"

rm -rf $root/docker-compose.yml $root/$stack.docker-compose.yml
cat - > $root/$stack.docker-compose.yml <<EOF
version: '3.4'

networks:
  $project:
    external: true

secrets:
  $db_secret:
    external: true
  $mnemonic_secret_name:
    external: true

volumes:
  certs:
  $db_volume:

services:

  proxy:
    $common
    $proxy_ports
    image: '$proxy_image'
    environment:
      VECTOR_DOMAINNAME: '$VECTOR_DOMAINNAME'
      VECTOR_EMAIL: '$VECTOR_EMAIL'
      VECTOR_ETH_PROVIDER_URL: '$ETH_PROVIDER_URL'
      VECTOR_MESSAGING_TCP_URL: 'nats:4222'
      VECTOR_MESSAGING_WS_URL: 'nats:4221'
      VECTOR_NODE_URL: 'node:$node_port'
    volumes:
      - 'certs:/etc/letsencrypt'

  core:
    $common
    $node_image
    ports:
      - '$node_port:$node_port'
    environment:
      VECTOR_ADMIN_TOKEN: '$VECTOR_ADMIN_TOKEN'
      VECTOR_AUTH_URL: 'http://auth:$auth_port'
      VECTOR_CHAIN_PROVIDERS: '$VECTOR_CHAIN_PROVIDERS'
      VECTOR_CONTRACT_ADDRESSES: '$VECTOR_CONTRACT_ADDRESSES'
      VECTOR_LOG_LEVEL: '$VECTOR_LOG_LEVEL'
      VECTOR_MNEMONIC_FILE: '$VECTOR_MNEMONIC_FILE'
      VECTOR_NATS_SERVERS: 'nats://nats:$nats_port'
      VECTOR_PG_DATABASE: '$pg_db'
      VECTOR_PG_HOST: '$pg_host'
      VECTOR_PG_PASSWORD_FILE: '$pg_password_file'
      VECTOR_PG_PORT: '$pg_port'
      VECTOR_PG_USERNAME: '$pg_user'
      VECTOR_PORT: '$node_port'
      VECTOR_REDIS_URL: '$redis_url'
      NODE_ENV: '`
        if [[ "$VECTOR_ENV" == "prod" ]]; then echo "production"; else echo "development"; fi
      `'
    secrets:
      - '$db_secret'
      - '$mnemonic_secret_name'

  database:
    $common
    $database_image
    environment:
      AWS_ACCESS_KEY_ID: '$VECTOR_AWS_ACCESS_KEY_ID'
      AWS_SECRET_ACCESS_KEY: '$VECTOR_AWS_SECRET_ACCESS_KEY'
      VECTOR_ADMIN_TOKEN: '$VECTOR_ADMIN_TOKEN'
      VECTOR_ENV: '$VECTOR_ENV'
      POSTGRES_DB: '$project'
      POSTGRES_PASSWORD_FILE: '$pg_password_file'
      POSTGRES_USER: '$project'
    secrets:
      - '$db_secret'
    volumes:
      - '$db_volume:/var/lib/postgresql/data'
      - '$snapshots_dir:/root/snapshots'

EOF

docker stack deploy -c $root/$stack.docker-compose.yml $project

echo "The $project stack has been deployed, waiting for the proxy to start responding.."
timeout=$(expr `date +%s` + 60)
while true
do
  res="`curl -k -m 5 -s $public_url || true`"
  if [[ -z "$res" || "$res" == "Waiting for proxy to wake up" ]]
  then
    if [[ "`date +%s`" -gt "$timeout" ]]
    then echo "Timed out waiting for proxy to respond.." && exit
    else sleep 2
    fi
  else echo "Good Morning!" && exit;
  fi
done

