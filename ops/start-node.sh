#!/usr/bin/env bash
set -e

# make sure a network for this project has been created
docker swarm init 2> /dev/null || true
docker network create --attachable --driver overlay $project 2> /dev/null || true

stack="node"

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"
registry="`cat $root/package.json | grep '"registry":' | head -n 1 | cut -d '"' -f 4`"

####################
# Load config

if [[ -n "`docker stack ls --format '{{.Name}}' | grep "$stack"`" ]]
then echo "A $stack stack is already running" && exit;
else echo; echo "Preparing to launch $stack stack"
fi

if [[ -f .env ]]
then source .env
fi
VECTOR_ENV="${VECTOR_ENV:-dev}"

# jq docs: https://stedolan.github.io/jq/manual/v1.5/#Builtinoperatorsandfunctions
function echoJson { jq '.'; }
function mergeJson { jq -s '.[0] + .[1]'; }
function fromAddressBook { jq 'map_values(map_values(.address))'; }

default_config="`cat $root/default-config.json`" # | tr -d '\n\r'`"
function getDefault { echo "$default_config" | jq ".$1" | tr -d '"'; }

override_config="`cat $root/config.json`" # | tr -d '\n\r'`"
config="`echo $default_config $override_config | mergeJson`"
function getConfig { echo "$config" | jq ".$1" | tr -d '"'; }

admin_token="`getConfig adminToken`"
domain_name="`getConfig domainName`"
auth_url="`getConfig authUrl`"
public_port="`getConfig port`"
chain_providers="`getConfig chainProviders`"

####################
# Misc Config

# prod version: if we're on a tagged commit then use the tagged semvar, otherwise use the hash
if [[ "$VECTOR_ENV" == "prod" ]]
then
  if [[ -n "`git tag --points-at HEAD | grep "vector-" | head -n 1`" ]]
  then version="`cat package.json | grep '"version":' | head -n 1 | cut -d '"' -f 4`"
  else version="`git rev-parse HEAD | head -c 8`"
  fi
else version="latest"
fi

builder_image="${project}_builder:$version";
bash $root/ops/pull-images.sh $builder_image > /dev/null

common="networks:
      - '$project'
    logging:
      driver: 'json-file'
      options:
          max-size: '10m'"

########################################
# Global services / chain provider config
# If no global service urls provided, spin up local ones & use those


if [[ \
  "$auth_url" == "`getDefault authUrl`" || \
  "$chain_providers" == "`getDefault chainProviders`" \
  ]]
then
  echo "Connecting to local global services"
  bash $root/ops/start-global.sh
  eth_mnemonic="candy maple cake sugar pudding cream honey rich smooth crumble sweet treat"
  chain_addresses="`cat $root/.chaindata/address-book.json | fromAddressBook`"
  config="`echo "$config" '{"chainAddresses":'$chain_addresses'}' | mergeJson`"

else
  echo "Connecting to external global services: auth=$auth_url | "
  mnemonic_secret="${project}_mnemonic"
  eth_mnemonic_file="/run/secrets/$mnemonic_secret"
  mnemonic_secret_entry="$db_secret:
    external: true"
  if [[ -z "`docker secret ls --format '{{.Name}}' | grep "$mnemonic_secret"`" ]]
  then bash $root/ops/save-secret.sh $db_secret
  fi
fi

########################################
## Database config

database_image="${project}_database:$version";
bash $root/ops/pull-images.sh $database_image > /dev/null

# database connection settings
pg_db="$project"
pg_user="$project"

snapshots_dir="$root/.db-snapshots"
mkdir -p $snapshots_dir

if [[ "$VECTOR_ENV" == "prod" ]]
then
  database_image="image: '$database_image'
    volumes:
      - 'database:/var/lib/postgresql/data'
      - '$snapshots_dir:/root/snapshots'"
  db_secret="${project}_database"
  pg_password_file="/run/secrets/$db_secret"
  db_secret_entry="$db_secret:
    external: true"
  if [[ -z "`docker secret ls --format '{{.Name}}' | grep "$mnemonic_secret"`" ]]
  then
    bash $root/ops/save-secret.sh $db_secret "`head -c 32 /dev/urandom | xxd -plain -c 32`"
  fi

else
  database_image="image: '$database_image'
    ports:
      - '5433:5432'"
  pg_password="$project"
  echo "$stack.database will be exposed on *:5433"
fi

########################################
## Node config

node_port="8001"

if [[ $VECTOR_ENV == "prod" ]]
then
  node_image_name="${project}_node"
  bash $root/ops/pull-images.sh $version $node_image_name > /dev/null
  node_image="image: '$node_image_name:$version'"
else
  node_image="image: '${project}_builder'
    entrypoint: 'bash modules/server-node/ops/entry.sh'
    volumes:
      - '$root:/root'
    ports:
      - '$node_port:$node_port'"
  echo "$stack.node will be exposed on *:$node_port"
fi

####################
# Proxy config

proxy_image="${project}_node_proxy:$version";
bash $root/ops/pull-images.sh $proxy_image > /dev/null

if [[ -z "$domain_name" && -n "$public_port" ]]
then
  public_url="http://127.0.0.1:$public_port"
  proxy_ports="ports:
      - '$public_port:80'"
  echo "$stack.proxy will be exposed on *:$public_port"
elif [[ -n "$domain_name" && -z "$public_port" ]]
then
  public_url="https://localhost:443"
  proxy_ports="ports:
      - '80:80'
      - '443:443'"
  echo "$stack.proxy will be exposed on *:80 and *:443"
else
  echo "Either a domain name or a public port must be provided but not both."
  echo " - If a public port is provided then the stack will use http on the given port"
  echo " - If a domain name is provided then https is activated on port *:443"
  exit 1
fi

####################
# Launch stack

docker_compose=$root/.$stack.docker-compose.yml
rm -f $docker_compose
cat - > $docker_compose <<EOF
version: '3.4'

networks:
  $project:
    external: true

secrets:
  $db_secret_entry
  $mnemonic_secret_entry

volumes:
  certs:
  database:

services:

  proxy:
    $common
    image: '$proxy_image'
    $proxy_ports
    environment:
      VECTOR_DOMAINNAME: '$domain_name'
      VECTOR_NODE_URL: 'node:$node_port'
    volumes:
      - 'certs:/etc/letsencrypt'

  node:
    $common
    $node_image
    ports:
      - '$node_port:$node_port'
    environment:
      VECTOR_CONFIG: '$config'
      VECTOR_MNEMONIC: '$eth_mnemonic'
      VECTOR_MNEMONIC_FILE: '$eth_mnemonic_file'
      VECTOR_PG_DATABASE: '$pg_db'
      VECTOR_PG_HOST: 'database'
      VECTOR_PG_PASSWORD: '$pg_password'
      VECTOR_PG_PASSWORD_FILE: '$pg_password_file'
      VECTOR_PG_PORT: '5432'
      VECTOR_PG_USERNAME: '$pg_user'
      VECTOR_PORT: '$node_port'
      VECTOR_ENV: '$VECTOR_ENV'
    secrets:
      - '$db_secret'
      - '$mnemonic_secret'

  database:
    $common
    $database_image
    environment:
      AWS_ACCESS_KEY_ID: '$VECTOR_AWS_ACCESS_KEY_ID'
      AWS_SECRET_ACCESS_KEY: '$VECTOR_AWS_SECRET_ACCESS_KEY'
      VECTOR_ADMIN_TOKEN: '$admin_token'
      VECTOR_ENV: '$VECTOR_ENV'
      POSTGRES_DB: '$pg_db'
      POSTGRES_PASSWORD: '$pg_password'
      POSTGRES_PASSWORD_FILE: '$pg_password_file'
      POSTGRES_USER: '$pg_user'
    secrets:
      - '$db_secret'

EOF

docker stack deploy -c $docker_compose $stack

echo "The $stack stack has been deployed, waiting for the proxy to start responding.."
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

