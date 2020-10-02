#!/usr/bin/env bash
set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"
registry="`cat $root/package.json | grep '"registry":' | head -n 1 | cut -d '"' -f 4`"

# make sure a network for this project has been created
docker swarm init 2> /dev/null || true
docker network create --attachable --driver overlay $project 2> /dev/null || true

stack="duet"

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

alice_mnemonic="avoid post vessel voyage trigger real side ribbon pattern neither essence shine"
bob_mnemonic="negative stamp rule dizzy embark worth ill popular hip ready truth abandon"
sugardaddy_mnemonic="candy maple cake sugar pudding cream honey rich smooth crumble sweet treat"

auth_url="http://auth:5040"
bash $root/ops/start-global.sh
echo "global services have started up, resuming $stack startup"

VECTOR_CHAIN_PROVIDERS="`cat $root/.chaindata/chain-providers.json`"
VECTOR_CONTRACT_ADDRESSES="`cat $root/.chaindata/address-book.json`"

########################################
## Node config

vector_config="`cat $root/config.json | tr -d '\n\r'`"

node_port="8000"
prisma_studio_port="5555"
nats_port="4222"

alice_port="8002"
alice_prisma_port="5557"
alice_database="database_a"
echo "$stack.alice will be exposed on *:$alice_port (prisma on *:$alice_prisma_port)"

bob_port="8003"
bob_prisma_port="5558"
bob_database="database_b"
echo "$stack.bob will be exposed on *:$bob_port (prisma on *:$bob_prisma_port)"

public_url="http://localhost:$alice_port"

VECTOR_ADMIN_TOKEN="${VECTOR_ADMIN_TOKEN:-cxt1234}";

node_image="image: '${project}_builder'
    entrypoint: 'bash modules/server-node/ops/entry.sh'
    volumes:
      - '$root:/root'"

node_env="environment:
      VECTOR_ADMIN_TOKEN: '$VECTOR_ADMIN_TOKEN'
      VECTOR_AUTH_URL: '$auth_url'
      VECTOR_CHAIN_PROVIDERS: '$VECTOR_CHAIN_PROVIDERS'
      VECTOR_CONFIG: '$vector_config'
      VECTOR_CONTRACT_ADDRESSES: '$VECTOR_CONTRACT_ADDRESSES'
      VECTOR_ENV: '$VECTOR_ENV'
      VECTOR_LOG_LEVEL: '$VECTOR_LOG_LEVEL'
      VECTOR_NATS_URL: 'nats://nats:$nats_port'
      VECTOR_PG_DATABASE: '$project'
      VECTOR_PG_PASSWORD: '$project'
      VECTOR_PG_PORT: '$pg_port'
      VECTOR_PG_USERNAME: '$project'
      VECTOR_PORT: '$node_port'
      VECTOR_REDIS_URL: '$redis_url'
      VECTOR_SUGAR_DADDY: '$sugardaddy_mnemonic'"

####################
# Launch stack

docker_compose=$root/.${stack}.docker-compose.yml
rm -f $docker_compose
cat - > $docker_compose <<EOF
version: '3.4'

networks:
  $project:
    external: true

services:

  alice:
    $common
    $node_image
    $node_env
      VECTOR_PG_HOST: '$alice_database'
      VECTOR_MNEMONIC: '$alice_mnemonic'
    ports:
      - '$alice_port:$node_port'
      - '$alice_prisma_port:$prisma_studio_port'

  bob:
    $common
    $node_image
    $node_env
      VECTOR_PG_HOST: '$bob_database'
      VECTOR_MNEMONIC: '$bob_mnemonic'
    ports:
      - '$bob_port:$node_port'
      - '$bob_prisma_port:$prisma_studio_port'

  $alice_database:
    $common
    image: '$database_image'
    $database_env

  $bob_database:
    $common
    image: '$database_image'
    $database_env

EOF

docker stack deploy -c $docker_compose $stack

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

