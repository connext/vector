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
# Misc Config

if [[ "$VECTOR_ENV" == "prod" ]]
then
  echo "The $stack stack should only be used for testing. Aborting because \$VECTOR_ENV=prod"
  exit 1
fi
VECTOR_ENV=dev

version="latest"

# log level alias can override default for easy `LOG_LEVEL=5 make start`
VECTOR_LOG_LEVEL="${LOG_LEVEL:-$VECTOR_LOG_LEVEL}";

# to access from other containers
redis_url="redis://redis:6379"

common="networks:
      - '$project'
    logging:
      driver: 'json-file'
      options:
          max-size: '100m'"

########################################
# Global services / chain provider config

sugardaddy_mnemonic="candy maple cake sugar pudding cream honey rich smooth crumble sweet treat"

auth_url="http://auth:5040"
bash $root/ops/start-global.sh

VECTOR_CHAIN_PROVIDERS="`cat $root/.chaindata/chain-providers.json`"
VECTOR_CONTRACT_ADDRESSES="`cat $root/.chaindata/address-book.json`"

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
## Node config

internal_node_port="8000"
internal_prisma_port="5555"
nats_port="4222"

carol_node_port="8004"
carol_prisma_port="5559"
carol_database="database_c"
carol_mnemonic="owner warrior discover outer physical intact secret goose all photo napkin fall"
echo "$stack.carol will be exposed on *:$carol_node_port (prisma on *:$carol_prisma_port)"

dave_node_port="8005"
dave_prisma_port="5560"
dave_database="database_d"
dave_mnemonic="woman benefit lawn ignore glove marriage crumble roast tool area cool payment"
echo "$stack.dave will be exposed on *:$dave_node_port (prisma on *:$dave_prisma_port)"

roger_node_port="8006"
roger_prisma_port="5561"
roger_database="database_r"
roger_mnemonic="spice notable wealth rail voyage depth barely thumb skill rug panel blush"
echo "$stack.roger will be exposed on *:$roger_node_port (prisma on *:$roger_prisma_port)"

public_url="http://localhost:$roger_node_port"

VECTOR_ADMIN_TOKEN="${VECTOR_ADMIN_TOKEN:-cxt1234}";

node_image="image: '${project}_builder'
    entrypoint: 'bash modules/server-node/ops/entry.sh'
    volumes:
      - '$root:/root'"

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
      VECTOR_PORT: '$internal_node_port'
      VECTOR_REDIS_URL: '$redis_url'
      VECTOR_SUGAR_DADDY: '$sugardaddy_mnemonic'"

########################################
## Router config

router_port="8009"

router_image="image: '${project}_builder'
    entrypoint: 'bash modules/router/ops/entry.sh'
    volumes:
      - '$root:/root'
    ports:
      - '$router_port:$router_port'"
echo "$stack.router will be exposed on *:$router_port"

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
      - '$carol_node_port:$internal_node_port'
      - '$carol_prisma_port:$internal_prisma_port'

  dave:
    $common
    $node_image
    $node_env
      VECTOR_PG_HOST: '$dave_database'
      VECTOR_MNEMONIC: '$dave_mnemonic'
    ports:
      - '$dave_node_port:$internal_node_port'
      - '$dave_prisma_port:$internal_prisma_port'

  roger:
    $common
    $node_image
    $node_env
      VECTOR_PG_HOST: '$roger_database'
      VECTOR_MNEMONIC: '$roger_mnemonic'
    ports:
      - '$roger_node_port:$internal_node_port'
      - '$roger_prisma_port:$internal_prisma_port'

  router:
    $common
    $router_image
    environment:
      VECTOR_ADMIN_TOKEN: '$VECTOR_ADMIN_TOKEN'
      VECTOR_CHAIN_PROVIDERS: '$VECTOR_CHAIN_PROVIDERS'
      VECTOR_ENV: '$VECTOR_ENV'
      VECTOR_LOG_LEVEL: '$VECTOR_LOG_LEVEL'
      VECTOR_NODE_URL: 'http://roger:$internal_node_port'
      VECTOR_PG_DATABASE: '$project'
      VECTOR_PG_HOST: '$roger_database'
      VECTOR_PG_PASSWORD: '$project'
      VECTOR_PG_PORT: '$pg_port'
      VECTOR_PG_USERNAME: '$project'
      VECTOR_PORT: '$router_port'

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

