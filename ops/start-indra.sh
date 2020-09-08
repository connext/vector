#!/usr/bin/env bash
set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"
registry="`cat $root/package.json | grep '"registry":' | head -n 1 | cut -d '"' -f 4`"

# turn on swarm mode if it's not already on
docker swarm init 2> /dev/null || true

# make sure a network for this project has been created
docker network create --attachable --driver overlay $project 2> /dev/null || true

####################
# Load env vars

INDRA_ENV="${INDRA_ENV:-dev}"

# Load the default env
if [[ -f "${INDRA_ENV}.env" ]]
then source "${INDRA_ENV}.env"
fi

# Load instance-specific env vars & overrides
if [[ -f ".env" ]]
then source .env
fi

# log level alias can override default for easy `LOG_LEVEL=5 make start`
INDRA_LOG_LEVEL="${LOG_LEVEL:-$INDRA_LOG_LEVEL}";

########################################
## Docker registry & image version config

# prod version: if we're on a tagged commit then use the tagged semvar, otherwise use the hash
if [[ "$INDRA_ENV" == "prod" ]]
then
  git_tag="`git tag --points-at HEAD | grep "indra-" | head -n 1`"
  if [[ -n "$git_tag" ]]
  then version="`echo $git_tag | sed 's/indra-//'`"
  else version="`git rev-parse HEAD | head -c 8`"
  fi
else version="latest"
fi

# Get images that we aren't building locally
function pull_if_unavailable {
  if [[ -z "`docker image ls | grep ${1%:*} | grep ${1#*:}`" ]]
  then
    if [[ -n "`echo $1 | grep "${project}_"`" ]]
    then full_name="${registry%/}/$1"
    else full_name="$1"
    fi
    echo "Can't find image $1 locally, attempting to pull $full_name"
    docker pull $full_name
    docker tag $full_name $1
  fi
}

# Initialize new secrets (random if no value is given)
function new_secret {
  secret="$2"
  if [[ -z "$secret" ]]
  then secret=`head -c 32 /dev/urandom | xxd -plain -c 32 | tr -d '\n\r'`
  fi
  if [[ -z "`docker secret ls -f name=$1 | grep -w $1`" ]]
  then
    id=`echo "$secret" | tr -d '\n\r' | docker secret create $1 -`
    echo "Created secret called $1 with id $id"
  fi
}

echo "Using docker images ${project}_name:${version} "

####################
# Misc Config

builder_image="${project}_builder"

common="networks:
      - '$project'
    logging:
      driver: 'json-file'
      options:
          max-size: '100m'"

####################
# Proxy config

proxy_image="${project}_proxy:$version";
pull_if_unavailable "$proxy_image"

if [[ -z "$INDRA_DOMAINNAME" ]]
then
  public_url="http://localhost:3000"
  proxy_ports="ports:
      - '3000:80'
      - '4221:4221'
      - '4222:4222'"
else
  public_url="https://localhost:443"
  proxy_ports="ports:
      - '80:80'
      - '443:443'
      - '4221:4221'
      - '4222:4222'"
fi

echo "Proxy configured"

########################################
## Node config

node_port="8888"

if [[ $INDRA_ENV == "prod" ]]
then
  node_image_name="${project}_rest-api-node:$version"
  pull_if_unavailable "$node_image_name"
  node_image="image: '$node_image_name'"
else
  echo "Running dev mode"
  node_image="image: '${project}_builder'
    entrypoint: 'bash modules/rest-api-node/ops/entry.sh'
    volumes:
      - '$root:/root'
    ports:
      - '$node_port:$node_port'
      - '9229:9229'"
fi

echo "Node configured"

########################################
## Database config

database_image="${project}_database:$version";
pull_if_unavailable "$database_image"

snapshots_dir="$root/.db-snapshots"
mkdir -p $snapshots_dir

if [[ "$INDRA_ENV" == "prod" ]]
then
  database_image="image: '$database_image'"
  db_volume="database"
  db_secret="${project}_database"
  new_secret $db_secret
else
  database_image="image: '$database_image'
    ports:
      - '5432:5432'"
  db_volume="database_dev"
  db_secret="${project}_database_dev"
  new_secret "$db_secret" "$project"
fi

# database connection settings
pg_db="$project"
pg_host="database"
pg_password_file="/run/secrets/$db_secret"
pg_port="5432"
pg_user="$project"

echo "Database configured"

########################################
# Chain provider config

# If no chain providers provided, spin up local testnets & use those
if [[ -z "$INDRA_CHAIN_PROVIDERS" ]]
then
  mnemonic_secret_name="${project}_mnemonic_dev"
  echo 'No $INDRA_CHAIN_PROVIDERS provided, spinning up local testnets & using those.'
  eth_mnemonic="candy maple cake sugar pudding cream honey rich smooth crumble sweet treat"
  bash ops/save-secret.sh "$mnemonic_secret_name" "$eth_mnemonic"
  pull_if_unavailable "${project}_ethprovider:$version"
  chain_id_1=1337; chain_id_2=1338;
  bash ops/start-testnet.sh $chain_id_1 $chain_id_2
  INDRA_CHAIN_PROVIDERS="`cat $root/.chaindata/providers/${chain_id_1}-${chain_id_2}.json`"
  INDRA_CONTRACT_ADDRESSES="`cat $root/.chaindata/addresses/${chain_id_1}-${chain_id_2}.json`"

# If chain providers are provided, use those
else
  mnemonic_secret_name="${project}_mnemonic"
  echo "Using chain providers:" $INDRA_CHAIN_PROVIDERS
  # Prefer top-level address-book override otherwise default to one in contracts
  if [[ -f address-book.json ]]
  then INDRA_CONTRACT_ADDRESSES="`cat address-book.json | tr -d ' \n\r'`"
  else INDRA_CONTRACT_ADDRESSES="`cat modules/contracts/address-book.json | tr -d ' \n\r'`"
  fi
fi

INDRA_MNEMONIC_FILE="/run/secrets/$mnemonic_secret_name"
ETH_PROVIDER_URL="`echo $INDRA_CHAIN_PROVIDERS | tr -d "'" | jq '.[]' | head -n 1 | tr -d '"'`"

# TODO: filter out extra contract addresses that we don't have any chain providers for?

echo "Chain providers configured"

####################
# Launch Indra stack

echo "Launching ${project}"

rm -rf $root/docker-compose.yml $root/${project}.docker-compose.yml
cat - > $root/docker-compose.yml <<EOF
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
      INDRA_DOMAINNAME: '$INDRA_DOMAINNAME'
      INDRA_EMAIL: '$INDRA_EMAIL'
      INDRA_ETH_PROVIDER_URL: '$ETH_PROVIDER_URL'
      INDRA_MESSAGING_TCP_URL: 'nats:4222'
      INDRA_MESSAGING_WS_URL: 'nats:4221'
      INDRA_NODE_URL: 'node:$node_port'
    volumes:
      - 'certs:/etc/letsencrypt'

  node:
    $common
    $node_image
    ports:
      '$node_port:$node_port'
    environment:
      INDRA_ADMIN_TOKEN: '$INDRA_ADMIN_TOKEN'
      INDRA_CHAIN_PROVIDERS: '$INDRA_CHAIN_PROVIDERS'
      INDRA_CONTRACT_ADDRESSES: '$INDRA_CONTRACT_ADDRESSES'
      INDRA_DEFAULT_REBALANCE_PROFILE_ETH: '$INDRA_DEFAULT_REBALANCE_PROFILE_ETH'
      INDRA_DEFAULT_REBALANCE_PROFILE_TOKEN: '$INDRA_DEFAULT_REBALANCE_PROFILE_TOKEN'
      INDRA_LOG_LEVEL: '$INDRA_LOG_LEVEL'
      INDRA_MNEMONIC_FILE: '$INDRA_MNEMONIC_FILE'
      INDRA_NATS_JWT_SIGNER_PRIVATE_KEY: '$INDRA_NATS_JWT_SIGNER_PRIVATE_KEY'
      INDRA_NATS_JWT_SIGNER_PUBLIC_KEY: '$INDRA_NATS_JWT_SIGNER_PUBLIC_KEY'
      INDRA_NATS_SERVERS: 'nats://nats:$nats_port'
      INDRA_NATS_WS_ENDPOINT: 'wss://nats:$nats_ws_port'
      INDRA_PG_DATABASE: '$pg_db'
      INDRA_PG_HOST: '$pg_host'
      INDRA_PG_PASSWORD_FILE: '$pg_password_file'
      INDRA_PG_PORT: '$pg_port'
      INDRA_PG_USERNAME: '$pg_user'
      INDRA_PORT: '$node_port'
      INDRA_REDIS_URL: '$redis_url'
      NODE_ENV: '`
        if [[ "$INDRA_ENV" == "prod" ]]; then echo "production"; else echo "development"; fi
      `'
    secrets:
      - '$db_secret'
      - '$mnemonic_secret_name'

  database:
    $common
    $database_image
    environment:
      AWS_ACCESS_KEY_ID: '$INDRA_AWS_ACCESS_KEY_ID'
      AWS_SECRET_ACCESS_KEY: '$INDRA_AWS_SECRET_ACCESS_KEY'
      INDRA_ADMIN_TOKEN: '$INDRA_ADMIN_TOKEN'
      INDRA_ENV: '$INDRA_ENV'
      POSTGRES_DB: '$project'
      POSTGRES_PASSWORD_FILE: '$pg_password_file'
      POSTGRES_USER: '$project'
    secrets:
      - '$db_secret'
    volumes:
      - '$db_volume:/var/lib/postgresql/data'
      - '$snapshots_dir:/root/snapshots'

EOF

docker stack deploy -c $root/docker-compose.yml $project

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

