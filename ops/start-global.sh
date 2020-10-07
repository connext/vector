#!/usr/bin/env bash
set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"
registry="`cat $root/package.json | grep '"registry":' | head -n 1 | cut -d '"' -f 4`"

# make sure a network for this project has been created
docker swarm init 2> /dev/null || true
docker network create --attachable --driver overlay $project 2> /dev/null || true

stack="global"

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
# Auth config

auth_port="5040"
echo "$stack.auth configured to be exposed on *:$auth_port"

admin_token="${VECTOR_ADMIN_TOKEN:-cxt1234}"

if [[ $VECTOR_ENV == "prod" ]]
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
# Nats config

nats_image="provide/nats-server:indra";
bash $root/ops/pull-images.sh "$nats_image" > /dev/null

nats_port="4222"

# Generate custom, secure JWT signing keys if we don't have any yet
if [[ -z "$VECTOR_NATS_JWT_SIGNER_PRIVATE_KEY" ]]
then
  echo "WARNING: Generating new nats jwt signing keys & saving them in .env"
  tmp="$root/.tmp"; mkdir -p $tmp
  keyFile=$tmp/id_rsa
  ssh-keygen -t rsa -b 4096 -m PEM -f $keyFile -N "" > /dev/null
  prvKey="`cat $keyFile | tr -d '\n\r'`"
  pubKey="`ssh-keygen -f $keyFile.pub -e -m PKCS8 | tr -d '\n\r'`"
  touch .env
  sed -i '/VECTOR_NATS_JWT_SIGNER_/d' .env
  echo "export VECTOR_NATS_JWT_SIGNER_PUBLIC_KEY=\"$pubKey\"" >> .env
  echo "export VECTOR_NATS_JWT_SIGNER_PRIVATE_KEY=\"$prvKey\"" >> .env
  export VECTOR_NATS_JWT_SIGNER_PUBLIC_KEY="$pubKey"
  export VECTOR_NATS_JWT_SIGNER_PRIVATE_KEY="$prvKey"
  rm $keyFile $keyFile.pub
fi

# Ensure keys have proper newlines inserted (bc newlines are stripped from GitHub secrets)
export VECTOR_NATS_JWT_SIGNER_PRIVATE_KEY=`
  echo $VECTOR_NATS_JWT_SIGNER_PRIVATE_KEY | tr -d '\n\r' |\
  sed 's/-----BEGIN RSA PRIVATE KEY-----/\\\n-----BEGIN RSA PRIVATE KEY-----\\\n/' |\
  sed 's/-----END RSA PRIVATE KEY-----/\\\n-----END RSA PRIVATE KEY-----\\\n/'`
export VECTOR_NATS_JWT_SIGNER_PUBLIC_KEY=`
  echo $VECTOR_NATS_JWT_SIGNER_PUBLIC_KEY | tr -d '\n\r' |\
  sed 's/-----BEGIN PUBLIC KEY-----/\\\n-----BEGIN PUBLIC KEY-----\\\n/' | \
  sed 's/-----END PUBLIC KEY-----/\\\n-----END PUBLIC KEY-----\\\n/'`

####################
# Eth Provider config

chain_id_1="1337"
chain_id_2="1338"

evm_port_1="8545"
evm_port_2="8546"
echo "$stack.evms are configured to be exposed on *:$evm_port_1 and *:$evm_port_2"

chain_data="$root/.chaindata"
chain_data_1="$chain_data/$chain_id_1"
chain_data_2="$chain_data/$chain_id_2"
mkdir -p $chain_data_1 $chain_data_2

address_book="$chain_data/address-book.json"
address_book_1="$chain_data_1/address-book.json"
address_book_2="$chain_data_2/address-book.json"
rm -rf $address_book $address_book_1 $address_book_2

chain_addresses="$chain_data/chain-addresses.json"
chain_addresses_1="$chain_data_1/chain-addresses.json"
chain_addresses_2="$chain_data_2/chain-addresses.json"
rm -rf $chain_addresses $chain_addresses_1 $chain_addresses_2

mnemonic="${VECTOR_MNEMONIC:-candy maple cake sugar pudding cream honey rich smooth crumble sweet treat}"

evm_image_name="${project}_ethprovider:$version";
evm_image="image: '$evm_image_name'
    tmpfs: /tmp"
bash $root/ops/pull-images.sh "$evm_image_name" > /dev/null

####################
# Launch stack

docker_compose=$root/.${stack}.docker-compose.yml
rm -f $docker_compose
cat - > $docker_compose <<EOF
version: '3.4'

networks:
  $project:
    external: true

volumes:
  certs:

services:

  auth:
    $common
    $auth_image
    environment:
      VECTOR_NATS_JWT_SIGNER_PRIVATE_KEY: '$VECTOR_NATS_JWT_SIGNER_PRIVATE_KEY'
      VECTOR_NATS_JWT_SIGNER_PUBLIC_KEY: '$VECTOR_NATS_JWT_SIGNER_PUBLIC_KEY'
      VECTOR_NATS_URL: 'nats://nats:$nats_port'
      VECTOR_ADMIN_TOKEN: '$admin_token'
      VECTOR_PORT: '$auth_port'
      VECTOR_ENV: '$VECTOR_ENV'
    ports:
      - '$auth_port:$auth_port'

  nats:
    $common
    image: '$nats_image'
    deploy:
      mode: global
    command: '-D -V'
    environment:
      JWT_SIGNER_PUBLIC_KEY: '$VECTOR_NATS_JWT_SIGNER_PUBLIC_KEY'
    ports:
      - '4222:4222'
      - '4221:4221'

  redis:
    $common
    image: '$redis_image'
    deploy:
      mode: global
    ports:
      - '6379:6379'

  evm_$chain_id_1:
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
      - '$chain_data_2:/data'

EOF

docker stack deploy -c $docker_compose $stack
echo "The $stack stack has been deployed."
public_auth_url="http://127.0.0.1:5040"

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

echo "Waiting for evms to wake up.."
while true
do
  if [[ ! -f "$chain_addresses_1" || ! -f "$chain_addresses_2" ]]
  then
    if [[ "`date +%s`" -gt "$timeout" ]]
    then abort
    else sleep 1
    fi
  else
    break
  fi
done

cat $address_book_1 $address_book_2 | jq -s '.[0] * .[1]' > $address_book
cat $chain_addresses_1 $chain_addresses_2 | jq -s '.[0] * .[1]' > $chain_addresses
echo '{"'$chain_id_1'":"http://evm_'$chain_id_1':8545","'$chain_id_2'":"http://evm_'$chain_id_2':8545"}' > $chain_data/chain-providers.json

echo "Good Morning!"
