#!/usr/bin/env bash
set -e

stack="messaging"
root=$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )
project=$(grep -m 1 '"name":' "$root/package.json" | cut -d '"' -f 4)

# make sure a network for this project has been created
docker swarm init 2> /dev/null || true
docker network create --attachable --driver overlay "$project" 2> /dev/null || true

if grep -qs "$stack" <<<"$(docker stack ls --format '{{.Name}}')"
then echo "A $stack stack is already running" && exit 0
fi

####################
# Load config

if [[ ! -f "$root/${stack}.config.json" ]]
then cp "$root/ops/config/${stack}.default.json" "$root/${stack}.config.json"
fi

config=$(
  cat "$root/$stack.config.json" | jq -s '.[0] + .[1]'
)

function getConfig {
  value=$(echo "$config" | jq ".$1" | tr -d '"')
  if [[ "$value" == "null" ]]
  then echo ""
  else echo "$value"
  fi
}

admin_token=$(getConfig adminToken)
domain_name=$(getConfig domainName)
production=$(getConfig production)
public_port=$(getConfig port)

if [[ "$production" == "true" ]]
then
  # If we're on the prod branch then use the release semvar, otherwise use the commit hash
  if [[ "$(git rev-parse --abbrev-ref HEAD)" == "prod" || "${GITHUB_REF##*/}" == "prod" ]]
  then version=$(grep -m 1 '"version":' package.json | cut -d '"' -f 4)
  else version=$(git rev-parse HEAD | head -c 8)
  fi
else version="latest"
fi

common="networks:
      - '$project'
    logging:
      driver: 'json-file'
      options:
          max-size: '100m'"

echo
echo "Preparing to launch $stack stack w config:"
echo " - admin_token=$admin_token"
echo " - domain_name=$domain_name"
echo " - production=$production"
echo " - public_port=$public_port"
echo " - version=$version"

####################
# Nats config

nats_image="${project}_nats:$version";
bash "$root/ops/pull-images.sh" "$nats_image" > /dev/null

jwt_private_key_secret="${project}_jwt_private_key"
jwt_public_key_secret="${project}_jwt_public_key"

# Generate custom, secure JWT signing keys if we don't have any yet
if ! grep "$jwt_private_key_secret" <<<"$(docker secret ls --format '{{.Name}}')"
then
  echo "Generating new nats jwt signing keys & saving them in docker secrets"
  tmp="$root/.tmp"
  rm -rf "$tmp"
  mkdir -p "$tmp"
  keyFile="$tmp/id_rsa"
  pubFile="$tmp/id_rsa.pub"
  ssh-keygen -t rsa -b 4096 -m PEM -f "$keyFile" -N ""
  mv "$pubFile" "$pubFile.tmp"
  ssh-keygen -f "$pubFile.tmp" -e -m PKCS8 > "$pubFile"
  docker secret create "$jwt_private_key_secret" "$keyFile"
  docker secret create "$jwt_public_key_secret" "$pubFile"
fi

####################
# Auth config

auth_port="5040"

if [[ "$production" == "true" ]]
then
  auth_image_name="${project}_auth:$version";
  bash "$root/ops/pull-images.sh" "$auth_image_name" > /dev/null
  auth_image="image: '$auth_image_name'"

else
  auth_image_name="${project}_builder:latest";
  bash "$root/ops/pull-images.sh" "$auth_image_name" > /dev/null
  auth_image="image: '$auth_image_name'
    entrypoint: 'bash modules/auth/ops/entry.sh'
    ports:
      - '$auth_port:$auth_port'
    volumes:
      - '$root:/app'"
  echo "${stack}_auth will be exposed on *:$auth_port"
fi

####################
# Proxy config

proxy_image="${project}_${stack}_proxy:$version";
bash "$root/ops/pull-images.sh" "$proxy_image" > /dev/null

if [[ -n "$domain_name" ]]
then
  public_url="https://$domain_name/ping"
  proxy_ports="ports:
      - '80:80'
      - '443:443'"
  echo "${stack}_proxy will be exposed on *:80 and *:443"

else
  public_port=${public_port:-3001}
  public_url="http://127.0.0.1:$public_port/ping"
  proxy_ports="ports:
      - '$public_port:80'"
  echo "${stack}_proxy will be exposed on *:$public_port"
fi

####################
# Launch stack

docker_compose=$root/.${stack}.docker-compose.yml
rm -f "$docker_compose"
cat - > "$docker_compose" <<EOF
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

  messaging:
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
      VECTOR_JWT_SIGNER_PUBLIC_KEY_FILE: '/run/secrets/$jwt_public_key_secret'
      VECTOR_JWT_SIGNER_PRIVATE_KEY_FILE: '/run/secrets/$jwt_private_key_secret'
      VECTOR_NATS_URL: 'nats://nats:4222'
      VECTOR_ADMIN_TOKEN: '$admin_token'
      VECTOR_PORT: '$auth_port'
      VECTOR_PROD: '$production'
    secrets:
      - '$jwt_private_key_secret'
      - '$jwt_public_key_secret'

  nats:
    $common
    image: '$nats_image'
    environment:
      JWT_SIGNER_PUBLIC_KEY_FILE: '/run/secrets/$jwt_public_key_secret'
    secrets:
      - '$jwt_public_key_secret'
    ports:
      - '4222:4222'
      - '4221:4221'

EOF

docker stack deploy -c "$docker_compose" "$stack"
echo "The $stack stack has been deployed, waiting for $public_url to wake up.."

timeout=$(( $(date +%s) + 300 ))
while [[ "$(curl -k -m 5 -s "$public_url" || true)" != "pong"* ]]
do
  if [[ "$(date +%s)" -gt "$timeout" ]]
  then
    echo "====="
    docker service ls
    echo "====="
    docker container ls -a
    echo "====="
    docker service ps messaging_auth || true
    docker service logs --tail 50 --raw messaging_auth || true
    echo "====="
    curl "$public_url" || true
    echo "====="
    echo "Timed out waiting for $stack stack to wake up."
    exit 1
  else sleep 1
  fi
done
echo "Good Morning!"
