#!/usr/bin/env bash
set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"
registry="`cat $root/package.json | grep '"registry":' | head -n 1 | cut -d '"' -f 4`"

# make sure a network for this project has been created
docker swarm init 2> /dev/null || true
docker network create --attachable --driver overlay $project 2> /dev/null || true

cmd="${1:-test}"

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

########################################
## Docker registry & image version config

version="latest"

####################
# Misc Config

redis_image="redis:5-alpine";
bash $root/ops/pull-images.sh $redis_image > /dev/null

# to access from other containers
redis_url="redis://redis:6379"

common="networks:
      - '$project'
    logging:
      driver: 'json-file'
      options:
          max-size: '100m'"

########################################
## Database config

database_image="${project}_database:$version"
bash $root/ops/pull-images.sh $database_image > /dev/null

pg_port="5432"
nats_port="4222"

########################################
# Global services / chain provider config

alice_mnemonic="avoid post vessel voyage trigger real side ribbon pattern neither essence shine"
bob_mnemonic="negative stamp rule dizzy embark worth ill popular hip ready truth abandon"
sugardaddy_mnemonic="candy maple cake sugar pudding cream honey rich smooth crumble sweet treat"

auth_url="http://auth:5040"
bash $root/ops/start-global.sh

VECTOR_CHAIN_PROVIDERS="`cat $root/.chaindata/chain-providers.json`"
VECTOR_CONTRACT_ADDRESSES="`cat $root/.chaindata/address-book.json`"
VECTOR_MNEMONIC_FILE="/run/secrets/${project}_mnemonic_dev"

########################################
# Launch stack

function cleanup {
  echo "Tests finished, stopping database.."
  docker container stop $postgres_host 2> /dev/null || true
}
trap cleanup EXIT SIGINT SIGTERM

postgres_host="${project}_database"
echo "Starting $postgres_host.."
  docker run \
    --detach \
    --env="POSTGRES_DB=$project" \
    --env="POSTGRES_PASSWORD=$project" \
    --env="POSTGRES_USER=$project" \
    --name="$postgres_host" \
    --network="$project" \
    --rm \
    --tmpfs="/var/lib/postgresql/data" \
    postgres:12-alpine

echo "postgresql://$project:$project@${project}_database:$pg_port/$project"
docker run \
  $interactive \
  --entrypoint="bash" \
  --env="VECTOR_ADMIN_TOKEN=$VECTOR_ADMIN_TOKEN" \
  --env="VECTOR_AUTH_URL=$auth_url" \
  --env="VECTOR_CHAIN_PROVIDERS=$VECTOR_CHAIN_PROVIDERS" \
  --env="VECTOR_CONTRACT_ADDRESSES=$VECTOR_CONTRACT_ADDRESSES" \
  --env="VECTOR_ENV=$VECTOR_ENV" \
  --env="VECTOR_LOG_LEVEL=$VECTOR_LOG_LEVEL" \
  --env="VECTOR_NATS_URL=nats://nats:$nats_port" \
  --env="VECTOR_DATABASE_URL=postgresql://$project:$project@${project}_database:$pg_port/$project" \
  --env="VECTOR_MNEMONIC=$alice_mnemonic" \
  --env="VECTOR_REDIS_URL=$redis_url" \
  --env="VECTOR_SUGAR_DADDY=$sugardaddy_mnemonic" \
  --name="${project}_test_$unit" \
  --network "$project" \
  --rm \
  --tmpfs="/tmp" \
  --volume="$root:/root" \
  ${project}_builder "/test.sh" "server-node" "$cmd"
