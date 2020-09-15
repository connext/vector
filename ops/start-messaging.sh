#!/usr/bin/env bash
set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"
registry="`cat $root/package.json | grep '"registry":' | head -n 1 | cut -d '"' -f 4`"
tmp="$root/.tmp"; mkdir -p $tmp

# turn on swarm mode if it's not already on
docker swarm init 2> /dev/null || true

# make sure a network for this project has been created
docker network create --attachable --driver overlay $project 2> /dev/null || true

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

echo "Using docker images ${project}_name:${version} "

####################
# Misc Config

builder_image="${project}_builder"

redis_image="redis:5-alpine";
bash ops/pull-images.sh $redis_image

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

auth_image="${project}_auth:$version";
bash ops/pull-images.sh "$auth_image"

auth_port="8080"

####################
# Proxy config

proxy_image="${project}_proxy:$version";
bash ops/pull-images.sh "$proxy_image"

if [[ -z "$VECTOR_DOMAINNAME" ]]
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

####################
# Nats config

nats_image="provide/nats-server:indra";
bash ops/pull-images.sh "$nats_image"

nats_port="4222"
nats_ws_port="4221"

# Generate custom, secure JWT signing keys if we don't have any yet
if [[ -z "$VECTOR_NATS_JWT_SIGNER_PRIVATE_KEY" ]]
then
  echo "WARNING: Generating new nats jwt signing keys & saving them in .env"
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

echo "Nats configured"

####################
# Launch stack

echo "Launching ${project}"

rm -rf $root/docker-compose.yml $root/${project}.docker-compose.yml
cat - > $root/docker-compose.yml <<EOF
version: '3.4'

networks:
  $project:
    external: true

volumes:
  certs:

services:

  proxy:
    $common
    $proxy_ports
    image: '$proxy_image'
    environment:
      VECTOR_DOMAINNAME: '$VECTOR_DOMAINNAME'
      VECTOR_EMAIL: '$VECTOR_EMAIL'
      VECTOR_AUTH_URL: 'auth:8080'
      VECTOR_MESSAGING_TCP_URL: 'nats:4222'
      VECTOR_MESSAGING_WS_URL: 'nats:4221'
    volumes:
      - 'certs:/etc/letsencrypt'

  auth:
    $common
    image: '$auth_image'
    environment:
      VECTOR_NATS_JWT_SIGNER_PRIVATE_KEY: '$VECTOR_NATS_JWT_SIGNER_PRIVATE_KEY'
      VECTOR_NATS_JWT_SIGNER_PUBLIC_KEY: '$VECTOR_NATS_JWT_SIGNER_PUBLIC_KEY'
      VECTOR_NATS_SERVERS: 'nats://nats:$nats_port'
      VECTOR_ADMIN_TOKEN: '$VECTOR_ADMIN_TOKEN'
      VECTOR_PORT: '$auth_port'
      NODE_ENV: '`
        if [[ "$VECTOR_ENV" == "prod" ]]; then echo "production"; else echo "development"; fi
      `'

  nats:
    $common
    image: '$nats_image'
    command: '-D -V'
    environment:
      JWT_SIGNER_PUBLIC_KEY: '$VECTOR_NATS_JWT_SIGNER_PUBLIC_KEY'

  redis:
    $common
    image: '$redis_image'

EOF

docker stack deploy -c $root/docker-compose.yml messaging

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

