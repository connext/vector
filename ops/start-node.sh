#!/usr/bin/env bash
set -e

stack="node"

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

config=$(cat "$root/ops/config/$stack.default.json" "$root/$stack.config.json" | jq -s '.[0] + .[1]')

function getConfig {
  value=$(echo "$config" | jq ".$1" | tr -d '"')
  if [[ "$value" == "null" ]]
  then echo ""
  else echo "$value"
  fi
}

messaging_url=$(getConfig messagingUrl)
domain_name=$(getConfig domainName)
production=$(getConfig production)
public_port=$(getConfig port)
mnemonic=$(getConfig mnemonic)

chain_providers=$(echo "$config" | jq '.chainProviders' | tr -d '\n\r ')
default_providers=$(jq '.chainProviders' "$root/ops/config/node.default.json" | tr -d '\n\r ')
if [[ "$chain_providers" == "$default_providers" ]]
then use_local_evms=true
else use_local_evms=false
fi

echo "Preparing to launch $stack stack (prod=$production)"

####################
# Misc Config

# prod version: if we're on a tagged commit then use the tagged semvar, otherwise use the hash
if [[ "$production" == "true" ]]
then
  if [[ -n "$(git tag --points-at HEAD | grep "vector-" | head -n 1)" ]]
  then version=$(grep -m 1 '"version":' package.json | cut -d '"' -f 4)
  else version=$(git rev-parse HEAD | head -c 8)
  fi
else version="latest"
fi

builder_image="${project}_builder:$version";
bash "$root/ops/pull-images.sh" "$builder_image" > /dev/null

common="networks:
      - '$project'
    logging:
      driver: 'json-file'
      options:
          max-size: '10m'"

########################################
# Global services / chain provider config

# If no messaging url or custom ethproviders are given, spin up a global stack
if [[ -z "$messaging_url" || "$use_local_evms" == "true" ]]
then bash "$root/ops/start-global.sh"
fi

# If no custom ethproviders are given, configure mnemonic/addresses from local evms
if [[ "$use_local_evms" == "true" ]]
then
  mnemonic_secret=""
  eth_mnemonic="${mnemonic:-candy maple cake sugar pudding cream honey rich smooth crumble sweet treat}"
  eth_mnemonic_file=""
  chain_addresses=$(cat "$root/.chaindata/chain-addresses.json")
  config=$(echo "$config" '{"chainAddresses":'"$chain_addresses"'}' | jq -s '.[0] + .[1]')

else
  echo "Connecting to external services: messaging=$messaging_url | chain_providers=$chain_providers"
  if [[ -n "$mnemonic" ]]
  then
    mnemonic_secret=""
    eth_mnemonic="$mnemonic"
    eth_mnemonic_file=""
  else
    mnemonic_secret="${project}_${stack}_mnemonic"
    eth_mnemonic=""
    eth_mnemonic_file="/run/secrets/$mnemonic_secret"
    if ! grep "$mnemonic_secret" <<<"$(docker secret ls --format '{{.Name}}')"
    then bash "$root/ops/save-secret.sh" "$mnemonic_secret"
    fi
  fi
fi

########################################
## Node config

node_internal_port="8000"
node_dev_port="8001"
if [[ $production == "true" ]]
then
  node_image_name="${project}_node"
  bash "$root/ops/pull-images.sh" "$version" "$node_image_name" > /dev/null
  node_image="image: '$node_image_name:$version'"
else
  node_image="image: '${project}_builder'
    entrypoint: 'bash modules/server-node/ops/entry.sh'
    volumes:
      - '$root:/root'
      - 'database:/database'
    ports:
      - '$node_dev_port:$node_internal_port'"
  echo "$stack.node configured to be exposed on *:$node_dev_port"
fi

# Add whichever secrets we're using to the node's service config
if [[ -n "$mnemonic_secret" ]]
then
  node_image="$node_image
    secrets:
      - '$mnemonic_secret'"
fi

####################
# Proxy config

proxy_image="${project}_${stack}_proxy:$version";
bash "$root/ops/pull-images.sh" "$proxy_image" > /dev/null

if [[ -n "$domain_name" ]]
then
  public_url="https://127.0.0.1:443"
  proxy_ports="ports:
      - '80:80'
      - '443:443'"
  echo "$stack.proxy will be exposed on *:80 and *:443"

else
  public_port=${public_port:-3002}
  public_url="http://127.0.0.1:$public_port"
  proxy_ports="ports:
      - '$public_port:80'"
  echo "$stack.proxy will be exposed on *:$public_port"
fi

####################
# Launch stack

# Add secrets to the stack config
stack_secrets=""
if [[ -n "$mnemonic_secret" ]]
then 
stack_secrets="$stack_secrets
  $mnemonic_secret:
    external: true"
fi

docker_compose=$root/.$stack.docker-compose.yml
rm -f "$docker_compose"
cat - > "$docker_compose" <<EOF
version: '3.4'

networks:
  $project:
    external: true

$stack_secrets

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
      VECTOR_NODE_URL: 'node:$node_internal_port'
    volumes:
      - 'certs:/etc/letsencrypt'

  node:
    $common
    $node_image
    environment:
      VECTOR_CONFIG: '$(echo "$config" | tr -d '\n\r')'
      VECTOR_PROD: '$production'
      VECTOR_MNEMONIC: '$eth_mnemonic'
      VECTOR_MNEMONIC_FILE: '$eth_mnemonic_file'
      VECTOR_SQLITE_FILE: '/database/store.db'
EOF

docker stack deploy -c "$docker_compose" "$stack"

echo "The $stack stack has been deployed, waiting for the $public_url to start responding.."
timeout=$(( $(date +%s) + 60 ))
while true
do
  res=$(curl -k -m 5 -s "$public_url" || true)
  if [[ -z "$res" || "$res" == "Waiting for proxy to wake up" ]]
  then
    if [[ "$(date +%s)" -gt "$timeout" ]]
    then echo "Timed out waiting for $public_url to respond.." && exit
    else sleep 2
    fi
  else echo "Good Morning!" && exit;
  fi
done
