#!/usr/bin/env bash
set -eu

stack="global"

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"
registry="`cat $root/package.json | grep '"registry":' | head -n 1 | cut -d '"' -f 4`"

# make sure a network for this project has been created
docker swarm init 2> /dev/null || true
docker network create --attachable --driver overlay $project 2> /dev/null || true

if [[ -n "`docker stack ls --format '{{.Name}}' | grep "$stack"`" ]]
then echo "A $stack stack is already running" && exit;
else echo; echo "Preparing to launch $stack stack"
fi

####################
# Load config

default_config="`cat $root/config-node.json $root/config-router.json | jq -s '.[0] + .[1]'`"
config="`cat $root/config-prod.json`"

function getDefault { echo "$default_config" | jq ".$1" | tr -d '"'; }
function getConfig { echo "$config" | jq ".$1" | tr -d '"'; }

admin_token="`getConfig adminToken`"
public_port="`getConfig port`"
domain_name="`getConfig domainName`"
production="`getConfig production`"

if [[ -z "$public_port" || "$public_port" == "null" ]]
then public_port=3002
fi

if [[ "$production" == "true" ]]
then VECTOR_ENV="prod"
else VECTOR_ENV="dev"
fi

########################################
## Docker registry & image version config

# prod version: if we're on a tagged commit then use the tagged semvar, otherwise use the hash
if [[ "$production" == "true" ]]
then
  if [[ -n "`git tag --points-at HEAD | grep "vector-" | head -n 1`" ]]
  then version="`cat package.json | grep '"version":' | head -n 1 | cut -d '"' -f 4`"
  else version="`git rev-parse HEAD | head -c 8`"
  fi
else version="latest"
fi

####################
# Misc Config

builder_image="${project}_builder"

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

####################
# Nats config

nats_image="${project}_nats:$version";
bash $root/ops/pull-images.sh "$nats_image" > /dev/null

jwt_private_key_secret="${project}_jwt_private_key"
jwt_public_key_secret="${project}_jwt_public_key"

# Generate custom, secure JWT signing keys if we don't have any yet
#if [[ -z "`docker secret ls --format '{{.Name}}' | grep "$jwt_private_key_secret"`" ]]
#then

docker secret rm $jwt_private_key_secret
docker secret rm $jwt_public_key_secret

echo "WARNING: Generating new nats jwt signing keys & saving them in .env"
tmp="$root/.tmp"
rm -rf $tmp
mkdir -p $tmp
keyFile=$tmp/id_rsa
pubFile=$tmp/id_rsa.pub
ssh-keygen -t rsa -b 4096 -m PEM -f $keyFile -N "" > /dev/null
mv $pubFile $pubFile.tmp
ssh-keygen -f $pubFile.tmp -e -m PKCS8 | tr -d '\n\r' > $pubFile

docker secret create $jwt_private_key_secret $keyFile
docker secret create $jwt_public_key_secret $pubFile

#fi

####################
# Auth config

auth_port="5040"
echo "$stack.auth configured to be exposed on *:$auth_port"

if [[ "$production" == "true" ]]
then
  auth_image_name="${project}_auth:$version";
  auth_image="image: '$auth_image_name'"
  bash $root/ops/pull-images.sh "$auth_image_name" > /dev/null
else
  auth_image_name="${project}_builder:latest";
  bash $root/ops/pull-images.sh "$auth_image_name" > /dev/null
  auth_image="image: '$auth_image_name'
    entrypoint: 'bash modules/auth/ops/entry.sh'
    volumes:
      - '$root:/root'"
fi

####################
# Eth Provider config

if [[ "$production" != "true" ]]
then
  mnemonic="candy maple cake sugar pudding cream honey rich smooth crumble sweet treat"

  chain_id_1="1337"
  chain_id_2="1338"

  evm_port_1="8545"
  evm_port_2="8546"
  echo "$stack.evms are configured to be exposed on *:$evm_port_1 and *:$evm_port_2"

  chain_data="$root/.chaindata"
  rm -rf $chain_data
  chain_data_1="$chain_data/$chain_id_1"
  chain_data_2="$chain_data/$chain_id_2"
  mkdir -p $chain_data_1 $chain_data_2

  evm_image_name="${project}_ethprovider:$version";
  evm_image="image: '$evm_image_name'
    tmpfs: /tmp"
  bash $root/ops/pull-images.sh "$evm_image_name" > /dev/null

  evm_services="evm_$chain_id_1:
    $common
    $evm_image
    environment:
      MNEMONIC: '$mnemonic'
      CHAIN_ID: '$chain_id_1'
    ports:
      - '$evm_port_1:8545'
    volumes:
      - '$chain_data_1:/data'

  evm_$chain_id_2:
    $common
    $evm_image
    environment:
      MNEMONIC: '$mnemonic'
      CHAIN_ID: '$chain_id_2'
    ports:
      - '$evm_port_2:8545'
    volumes:
      - '$chain_data_2:/data'"
else
  evm_services=""
fi

####################
# Proxy config

proxy_image="${project}_global_proxy:$version";
bash $root/ops/pull-images.sh $proxy_image > /dev/null

if [[ -z "$domain_name" && -n "$public_port" ]]
then
  public_url="http://127.0.0.1:$public_port"
  proxy_ports="ports:
      - '$public_port:80'"
  echo "$stack.proxy will be exposed on *:$public_port"
elif [[ -n "$domain_name" && -z "$public_port" ]]
then
  public_url="https://127.0.0.1:443"
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

docker_compose=$root/.${stack}.docker-compose.yml
rm -f $docker_compose
cat - > $docker_compose <<EOF
version: '3.4'

secrets:
  $jwt_public_key_secret:
    external: true
  $jwt_private_key_secret:
    external: true

networks:
  $project:
    external: true

volumes:
  certs:

services:

  proxy:
    $common
    image: '$proxy_image'
    $proxy_ports
    environment:
      VECTOR_DOMAINNAME: '$domain_name'
      VECTOR_AUTH_URL: 'auth:$auth_port'
      VECTOR_NATS_HOST: 'nats'
    volumes:
      - 'certs:/etc/letsencrypt'

  auth:
    $common
    $auth_image
    environment:
      VECTOR_NATS_JWT_SIGNER_PUBLIC_KEY: '`cat $keyFile.pub`'
      VECTOR_NATS_JWT_SIGNER_PRIVATE_KEY: '`cat $keyFile`'
      #VECTOR_NATS_JWT_SIGNER_PUBLIC_KEY_FILE: '/run/secrets/$jwt_public_key_secret'
      #VECTOR_NATS_JWT_SIGNER_PRIVATE_KEY_FILE: '/run/secrets/$jwt_private_key_secret'
      VECTOR_NATS_URL: 'nats://nats:4222'
      VECTOR_ADMIN_TOKEN: '$admin_token'
      VECTOR_PORT: '$auth_port'
      VECTOR_ENV: '$VECTOR_ENV'
    ports:
      - '$auth_port:$auth_port'
    secrets:
      - '$jwt_private_key_secret'
      - '$jwt_public_key_secret'

  nats:
    $common
    image: '$nats_image'
    environment:
      JWT_SIGNER_PUBLIC_KEY: '`cat $keyFile.pub`'
      #JWT_SIGNER_PUBLIC_KEY_FILE: '/run/secrets/$jwt_public_key_secret'
    secrets:
      - '$jwt_public_key_secret'
    ports:
      - '4222:4222'
      - '4221:4221'

  redis:
    $common
    image: '$redis_image'

  $evm_services

EOF

docker stack deploy -c $docker_compose $stack
echo "The $stack stack has been deployed."
public_auth_url="http://127.0.0.1:5040/ping"

function abort {
  echo "====="
  docker service ls
  echo "====="
  docker container ls -a
  echo "====="
  docker service ps global_auth || true
  docker service logs --tail 50 --raw global_auth || true
  echo "====="
  curl $public_auth_url || true
  echo "====="
  echo "Timed out waiting for $stack stack to wake up, see above for diagnostic info."
  exit 1
}

timeout=$(expr `date +%s` + 60)
echo "Waiting for $public_auth_url to wake up.."
while true
do
  res="`curl -k -m 5 -s $public_auth_url || true`"
  if [[ -z "$res" ]]
  then
    if [[ "`date +%s`" -gt "$timeout" ]]
    then abort
    else sleep 1
    fi
  else
    break
  fi
done

if [[ "$production" != "true" ]]
then
  chain_addresses_1="$chain_data_1/chain-addresses.json"
  chain_addresses_2="$chain_data_2/chain-addresses.json"

  echo "Waiting for evms to wake up.."
  while [[ ! -f "$chain_addresses_1" || ! -f "$chain_addresses_2" ]]
  do
    if [[ "`date +%s`" -gt "$timeout" ]]
    then abort
    else sleep 1
    fi
  done

  echo '{
    "'$chain_id_1'":"http://evm_'$chain_id_1':8545",
    "'$chain_id_2'":"http://evm_'$chain_id_2':8545"
  }' > $chain_data/chain-providers.json

  cat $chain_data_1/address-book.json $chain_data_2/address-book.json \
    | jq -s '.[0] * .[1]' \
    > $chain_data/address-book.json

  cat $chain_addresses_1 $chain_addresses_2 \
    | jq -s '.[0] * .[1]' \
    > $chain_data/chain-addresses.json
fi

echo "Good Morning!"
