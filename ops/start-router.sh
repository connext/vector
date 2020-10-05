#!/usr/bin/env bash
set -e

stack="router"

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"
registry="`cat $root/package.json | grep '"registry":' | head -n 1 | cut -d '"' -f 4`"

# make sure a network for this project has been created
docker swarm init 2> /dev/null || true
docker network create --attachable --driver overlay $project 2> /dev/null || true

####################
# Load config

if [[ -n "`docker stack ls --format '{{.Name}}' | grep "$stack"`" ]]
then echo "A $stack stack is already running" && exit 0;
else echo; echo "Preparing to launch $stack stack"
fi

# jq docs: https://stedolan.github.io/jq/manual/v1.5/#Builtinoperatorsandfunctions
function mergeJson { jq -s '.[0] + .[1]'; }
function fromAddressBook {
  jq '
    map_values(
      map_values(.address) |
      to_entries |
      map(.key = "\(.key)Address") |
      map(.key |= (capture("(?<a>^[A-Z])(?<b>.*$)"; "g") | "\(.a | ascii_downcase)\(.b)")) |
      from_entries
    )
  ';
}

default_config="`cat $root/config-router.json`" # | tr -d '\n\r'`"
prod_config="`cat $root/config-prod.json`" # | tr -d '\n\r'`"
config="`echo $default_config $prod_config | mergeJson`"

function getDefault { echo "$default_config" | jq ".$1" | tr -d '"'; }
function getConfig { echo "$config" | jq ".$1" | tr -d '"'; }

admin_token="`getConfig adminToken`"
auth_url="`getConfig authUrl`"
chain_providers="`getConfig chainProviders`"
domain_name="`getConfig domainName`"
production="`getConfig production`"
public_port="`getConfig port`"

if [[ "$production" == "true" ]]
then VECTOR_ENV="prod"
else VECTOR_ENV="dev"
fi

####################
# Misc Config

# prod version: if we're on a tagged commit then use the tagged semvar, otherwise use the hash
if [[ "$production" == "true" ]]
then
  if [[ -n "`git tag --points-at HEAD | grep "vector-" | head -n 1`" ]]
  then version="`cat package.json | grep '"version":' | head -n 1 | cut -d '"' -f 4`"
  else version="`git rev-parse HEAD | head -c 8`"
  fi
else version="latest"
fi

builder_image="${project}_builder:$version";
bash $root/ops/pull-images.sh $builder_image > /dev/null

redis_image="redis:5-alpine";
bash $root/ops/pull-images.sh "$redis_image" > /dev/null

common="networks:
      - '$project'
    logging:
      driver: 'json-file'
      options:
          max-size: '100m'"

########################################
# Global services / chain provider config
# If no global service urls provided, spin up local ones & use those
# If no chain providers provided, spin up local testnets & use those

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
  echo "Connecting to external global services: auth=$auth_url | chain_providers=$chain_providers"
  mnemonic_secret="${project}_${stack}_mnemonic"
  eth_mnemonic_file="/run/secrets/$mnemonic_secret"
  mnemonic_secret_entry="$mnemonic_secret:
    external: true"
  mnemonic_secret_service_entry="- '$mnemonic_secret'"
  if [[ -z "`docker secret ls --format '{{.Name}}' | grep "$mnemonic_secret"`" ]]
  then bash $root/ops/save-secret.sh $mnemonic_secret
  fi
fi

####################
# Proxy config

proxy_image_name="${project}_router_proxy";
proxy_image="$proxy_image_name:$version";
bash $root/ops/pull-images.sh $version $proxy_image_name > /dev/null

if [[ -z "$VECTOR_DOMAINNAME" ]]
then
  public_url="http://localhost:3000"
  proxy_ports="ports:
      - '3000:80'"
  echo "$stack.proxy will be exposed on *:3000"
else
  public_url="https://localhost:443"
  proxy_ports="ports:
      - '80:80'
      - '443:443'"
  echo "$stack.proxy will be exposed on *:80 and *:443"
fi

########################################
## Database config

database_image_name="${project}_database";
database_image="$database_image_name:$version"
bash $root/ops/pull-images.sh $version $database_image_name > /dev/null

snapshots_dir="$root/.db-snapshots"
mkdir -p $snapshots_dir

if [[ "$VECTOR_ENV" == "prod" ]]
then
  database_image="image: '$database_image'
    volumes:
      - 'database:/var/lib/postgresql/data'
      - '$snapshots_dir:/root/snapshots'"
  db_secret="${project}_database"
  bash $root/ops/save-secret.sh $db_secret "`head -c 32 /dev/urandom | xxd -plain -c 32`" > /dev/null
else
  database_image="image: '$database_image'
    ports:
      - '5432:5432'"
  echo "$stack.database will be exposed on *:5432"
  db_secret="${project}_database_dev"
  bash $root/ops/save-secret.sh "$db_secret" "$project" > /dev/null
fi

# database connection settings
pg_db="$project"
pg_host="database"
pg_password_file="/run/secrets/$db_secret"
pg_port="5432"
pg_user="$project"

########################################
## Node config

vector_config="`cat $root/config.json | tr -d '\n\r'`"

node_port="8000"
prisma_port="5555"

if [[ $VECTOR_ENV == "prod" ]]
then
  node_image_name="${project}_node"
  bash $root/ops/pull-images.sh $version $node_image_name > /dev/null
  node_image="image: '$node_image_name:$version'"
  echo "$stack.node configured to be exposed on *:$node_port"
else
  node_image="image: '${project}_builder'
    entrypoint: 'bash modules/server-node/ops/entry.sh'
    volumes:
      - '$root:/root'
    ports:
      - '$node_port:$node_port'
      - '$prisma_port:$prisma_port'"
  echo "$stack.node configured to be exposed on *:$node_port (prisma on *:$prisma_port)"
fi


########################################
## Router config

router_port="8008"
echo "$stack.router configured to be exposed on *:$router_port"

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
# Launch Indra stack

docker_compose=$root/.$stack.docker-compose.yml
rm -f $docker_compose
cat - > $docker_compose <<EOF
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
  database:

services:

  proxy:
    $common
    $proxy_ports
    image: '$proxy_image'
    environment:
      VECTOR_DOMAINNAME: '$VECTOR_DOMAINNAME'
      VECTOR_EMAIL: '$VECTOR_EMAIL'
      VECTOR_NODE_URL: 'node:$node_port'
    volumes:
      - 'certs:/etc/letsencrypt'

  node:
    $common
    $node_image
    ports:
      - '$node_port:$node_port'
    environment:
      VECTOR_AUTH_URL: '$auth_url'
      VECTOR_CHAIN_PROVIDERS: '$VECTOR_CHAIN_PROVIDERS'
      VECTOR_CONFIG: '$vector_config'
      VECTOR_MNEMONIC_FILE: '$VECTOR_MNEMONIC_FILE'
      VECTOR_PG_DATABASE: '$pg_db'
      VECTOR_PG_HOST: '$pg_host'
      VECTOR_PG_PASSWORD_FILE: '$pg_password_file'
      VECTOR_PG_PORT: '$pg_port'
      VECTOR_PG_USERNAME: '$pg_user'
      VECTOR_ENV: '$VECTOR_ENV'
    secrets:
      - '$db_secret'
      - '$mnemonic_secret_name'

  router:
    $common
    $router_image
    ports:
      - '$router_port:$router_port'
    environment:
      VECTOR_CONFIG: '$vector_config'
      VECTOR_NODE_URL: 'http://node:$node_port'
      VECTOR_PG_DATABASE: '$pg_db'
      VECTOR_PG_HOST: '$pg_host'
      VECTOR_PG_PASSWORD_FILE: '$pg_password_file'
      VECTOR_PG_PORT: '$pg_port'
      VECTOR_PG_USERNAME: '$pg_user'
      VECTOR_PORT: '$router_port'
      VECTOR_ENV: '$VECTOR_ENV'
    secrets:
      - '$db_secret'

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

