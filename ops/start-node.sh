#!/usr/bin/env bash
set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"
registry="`cat $root/package.json | grep '"registry":' | head -n 1 | cut -d '"' -f 4`"

# make sure a network for this project has been created
docker swarm init 2> /dev/null || true
docker network create --attachable --driver overlay $project 2> /dev/null || true

stack="node"

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

# Load private env vars & instance-specific overrides
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

builder_image_name="${project}_builder";
builder_image="$builder_image_name:$version";
bash $root/ops/pull-images.sh $version $builder_image_name > /dev/null

redis_image="redis:5-alpine";
bash $root/ops/pull-images.sh "$redis_image" > /dev/null

# to access from other containers
redis_url="redis://redis:6379"

common="networks:
      - '$project'
    logging:
      driver: 'json-file'
      options:
          max-size: '100m'"

admin_token="${VECTOR_ADMIN_TOKEN:-cxt1234}"

####################
# Proxy config

proxy_image_name="${project}_proxy";
proxy_image="$proxy_image_name:$version";
bash $root/ops/pull-images.sh $version $proxy_image_name > /dev/null

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
# Global services / chain provider config
# If no global service urls provided, spin up local ones & use those
# If no chain providers provided, spin up local testnets & use those

if [[ -z "$VECTOR_CHAIN_PROVIDERS" || -z "$VECTOR_AUTH_URL" ]]
then
  echo "\$VECTOR_AUTH_URL ($VECTOR_AUTH_URL) or \$VECTOR_CHAIN_PROVIDERS ($VECTOR_CHAIN_PROVIDERS) is missing"

  if [[ "$VECTOR_ENV" == "prod" ]]
  then
    echo "In prod mode, \$VECTOR_AUTH_URL and \$VECTOR_CHAIN_PROVIDERS must be provided."
    exit 1
  else
    echo "Starting global services"
    bash $root/ops/start-global.sh
    auth_url="http://auth:5040"
    mnemonic_secret_name="${project}_mnemonic_dev"
    eth_mnemonic="candy maple cake sugar pudding cream honey rich smooth crumble sweet treat"
    bash $root/ops/save-secret.sh "$mnemonic_secret_name" "$eth_mnemonic" > /dev/null
    VECTOR_CHAIN_PROVIDERS="`cat $root/.chaindata/chain-providers.json`"
    VECTOR_CONTRACT_ADDRESSES="`cat $root/.chaindata/address-book.json`"
  fi

else
  echo "Connecting to external global servies: $VECTOR_AUTH_URL & $VECTOR_CHAIN_PROVIDERS"
  auth_url="$VECTOR_AUTH_URL"
  mnemonic_secret_name="${project}_mnemonic"
  if [[ -z "$VECTOR_CONTRACT_ADDRESSES" ]]
  then
    if [[ -f "address-book.json" ]]
    then VECTOR_CONTRACT_ADDRESSES="`cat address-book.json | tr -d ' \n\r'`"
    elif [[ -f ".chaindata/address-book.json" ]]
    then VECTOR_CONTRACT_ADDRESSES="`cat .chaindata/address-book.json | tr -d ' \n\r'`"
    else echo "No \$VECTOR_CONTRACT_ADDRESSES provided & can't find an address-book, aborting"
    fi
  fi
fi

VECTOR_MNEMONIC_FILE="/run/secrets/$mnemonic_secret_name"

########################################
## Node config

node_port="8000"
prisma_port="5555"

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
      - '$node_port:$node_port'
      - '$prisma_port:$prisma_port'"
fi

####################
# Launch stack

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
      VECTOR_ADMIN_TOKEN: '$admin_token'
      VECTOR_AUTH_URL: '$auth_url'
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
      VECTOR_ENV: '$VECTOR_ENV'
    secrets:
      - '$db_secret'
      - '$mnemonic_secret_name'

  database:
    $common
    $database_image
    environment:
      AWS_ACCESS_KEY_ID: '$VECTOR_AWS_ACCESS_KEY_ID'
      AWS_SECRET_ACCESS_KEY: '$VECTOR_AWS_SECRET_ACCESS_KEY'
      VECTOR_ADMIN_TOKEN: '$admin_token'
      VECTOR_ENV: '$VECTOR_ENV'
      POSTGRES_DB: '$project'
      POSTGRES_PASSWORD_FILE: '$pg_password_file'
      POSTGRES_USER: '$project'
    secrets:
      - '$db_secret'

EOF

docker stack deploy -c $root/$stack.docker-compose.yml $stack

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

