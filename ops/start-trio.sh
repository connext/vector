#!/usr/bin/env bash
set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"
registry="`cat $root/package.json | grep '"registry":' | head -n 1 | cut -d '"' -f 4`"

# make sure a network for this project has been created
docker swarm init 2> /dev/null || true
docker network create --attachable --driver overlay $project 2> /dev/null || true

stack="trio"

if [[ -n "`docker stack ls --format '{{.Name}}' | grep "$stack"`" ]]
then echo "A $stack stack is already running" && exit 0;
else echo; echo "Preparing to launch $stack stack"
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

########################################
## Docker registry & image version config

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

database_env="environment:
      POSTGRES_DB: '$project'
      POSTGRES_PASSWORD: '$project'
      POSTGRES_USER: '$project'"

########################################
# Global services / chain provider config

carol_mnemonic="avoid post vessel voyage trigger real side ribbon pattern neither essence shine"
dave_mnemonic="negative stamp rule dizzy embark worth ill popular hip ready truth abandon"
sugardaddy_mnemonic="candy maple cake sugar pudding cream honey rich smooth crumble sweet treat"

auth_url="http://auth:5040"
bash $root/ops/start-global.sh

VECTOR_CHAIN_PROVIDERS="`cat $root/.chaindata/chain-providers.json`"
VECTOR_CONTRACT_ADDRESSES="`cat $root/.chaindata/address-book.json`"
VECTOR_MNEMONIC_FILE="/run/secrets/${project}_mnemonic_dev"

########################################
## Node config

node_port="8000"
prisma_port="5555"
nats_port="4222"

carol_port="8001"
carol_database="database_c"

dave_port="8002"
dave_database="database_d"

public_url="http://localhost:$carol_port"

VECTOR_ADMIN_TOKEN="${VECTOR_ADMIN_TOKEN:-cxt1234}";

node_env="environment:
      VECTOR_ADMIN_TOKEN: '$VECTOR_ADMIN_TOKEN'
      VECTOR_AUTH_URL: '$auth_url'
      VECTOR_CHAIN_PROVIDERS: '$VECTOR_CHAIN_PROVIDERS'
      VECTOR_CONTRACT_ADDRESSES: '$VECTOR_CONTRACT_ADDRESSES'
      VECTOR_ENV: '$VECTOR_ENV'
      VECTOR_LOG_LEVEL: '$VECTOR_LOG_LEVEL'
      VECTOR_NATS_SERVERS: 'nats://nats:$nats_port'
      VECTOR_PG_DATABASE: '$project'
      VECTOR_PG_PASSWORD: '$project'
      VECTOR_PG_PORT: '$pg_port'
      VECTOR_PG_USERNAME: '$project'
      VECTOR_PORT: '$node_port'
      VECTOR_REDIS_URL: '$redis_url'
      VECTOR_SUGAR_DADDY: '$sugardaddy_mnemonic'"

if [[ $VECTOR_ENV == "prod" ]]
then
  node_image_name="${project}_node"
  bash $root/ops/pull-images.sh $version $node_image_name > /dev/null
  node_image="image: '$node_image_name:$version'"
else
  node_image="image: '${project}_builder'
    entrypoint: 'bash modules/server-node/ops/entry.sh'
    volumes:
      - '$root:/root'"
fi

########################################
## Router config

roger_port="8002"
roger_database="database_r"

router_port="8008"

if [[ $VECTOR_ENV == "prod" ]]
then
  router_image_name="${project}_router"
  bash $root/ops/pull-images.sh $version $router_image_name > /dev/null
  router_image="image: '$router_image_name:$version'"
else
  router_image="image: '${project}_builder'
    entrypoint: 'bash modules/router/ops/entry.sh'
    volumes:
      - '$root:/root'
    ports:
      - '$router_port:$router_port'"
fi

####################
# Launch stack

rm -rf $root/${stack}.docker-compose.yml
cat - > $root/${stack}.docker-compose.yml <<EOF
version: '3.4'

networks:
  $project:
    external: true

services:

  carol:
    $common
    $node_image
    $node_env
      VECTOR_PG_HOST: '$carol_database'
      VECTOR_MNEMONIC: '$carol_mnemonic'
    ports:
      - '$carol_port:$node_port'
      - '$prisma_port:$prisma_port'

  dave:
    $common
    $node_image
    $node_env
      VECTOR_PG_HOST: '$dave_database'
      VECTOR_MNEMONIC: '$dave_mnemonic'
    ports:
      - '$dave_port:$node_port'
      - '$prisma_port:$prisma_port'

  roger:
    $common
    $node_image
    $node_env
      VECTOR_PG_HOST: '$roger_database'
      VECTOR_MNEMONIC: '$roger_mnemonic'
    ports:
      - '$roger_port:$node_port'
      - '$prisma_port:$prisma_port'

  router:
    $common
    $router_image
    ports:
      - '$router_port:$router_port'
    environment:
      VECTOR_NODE_URL: 'http://node:$node_port'
      VECTOR_CHAIN_PROVIDERS: '$VECTOR_CHAIN_PROVIDERS'
      VECTOR_ADMIN_TOKEN: '$VECTOR_ADMIN_TOKEN'
      VECTOR_LOG_LEVEL: '$VECTOR_LOG_LEVEL'
      VECTOR_PG_DATABASE: '$pg_db'
      VECTOR_PG_HOST: '$pg_host'
      VECTOR_PG_PASSWORD_FILE: '$pg_password_file'
      VECTOR_PG_PORT: '$pg_port'
      VECTOR_PG_USERNAME: '$pg_user'
      VECTOR_PORT: '$router_port'
      VECTOR_ENV: '$VECTOR_ENV'
    secrets:
      - '$db_secret'

  $carol_database:
    $common
    image: '$database_image'
    $database_env

  $dave_database:
    $common
    image: '$database_image'
    $database_env

  $roger_database:
    $common
    image: '$database_image'
    $database_env

EOF

docker stack deploy -c $root/${stack}.docker-compose.yml $stack

echo "The $stack stack has been deployed, waiting for $public_url to start responding.."
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

