#!/usr/bin/env bash
set -e

stack="duet"
root=$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )
project=$(grep -m 1 '"name":' "$root/package.json" | cut -d '"' -f 4)

# make sure a network for this project has been created
docker swarm init 2> /dev/null || true
docker network create --attachable --driver overlay "$project" 2> /dev/null || true

if grep -qs "$stack" <<<"$(docker stack ls --format '{{.Name}}')"
then echo "A $stack stack is already running" && exit 0;
fi

####################
## Load Config

if [[ ! -f "$root/node.config.json" ]]
then cp "$root/ops/config/node.default.json" "$root/node.config.json"
fi
if [[ ! -f "$root/router.config.json" ]]
then cp "$root/ops/config/router.default.json" "$root/router.config.json"
fi

config=$(
  cat "$root/ops/config/node.default.json" "$root/ops/config/router.default.json" \
  | cat - "$root/node.config.json" "$root/router.config.json" \
  | jq -s '.[0] + .[1] + .[2] + .[3]'
)

function getConfig {
  value=$(echo "$config" | jq ".$1" | tr -d '"')
  if [[ "$value" == "null" ]]
  then echo ""
  else echo "$value"
  fi
}

messaging_url=$(getConfig messagingUrl)

chain_providers=$(echo "$config" | jq '.chainProviders' | tr -d '\n\r ')
default_providers=$(jq '.chainProviders' "$root/ops/config/node.default.json" | tr -d '\n\r ')

common="networks:
      - '$project'
    logging:
      driver: 'json-file'
      options:
          max-size: '100m'"

####################
## Start dependency stacks

if [[ "$chain_providers" == "$default_providers" ]]
then
  bash "$root/ops/start-chains.sh"
  config=$(
    echo "$config" '{"chainAddresses":'"$(cat "$root/.chaindata/chain-addresses.json")"'}' \
    | jq -s '.[0] + .[1]'
  )
fi

if [[ -z "$messaging_url" ]]
then bash "$root/ops/start-messaging.sh"
fi

echo
echo "Preparing to launch $stack stack"

########################################
## Node config

internal_node_port="8000"
internal_prisma_port="5555"

alice_port="8003"
alice_prisma="5553"
alice_mnemonic="avoid post vessel voyage trigger real side ribbon pattern neither essence shine"
echo "$stack.alice will be exposed on *:$alice_port"

bob_port="8004"
bob_prisma="5554"
bob_mnemonic="negative stamp rule dizzy embark worth ill popular hip ready truth abandon"
echo "$stack.bob will be exposed on *:$bob_port"

public_url="http://localhost:$alice_port"

node_image="image: '${project}_builder'
    entrypoint: 'bash modules/server-node/ops/entry.sh'
    volumes:
      - '$root:/app'
    tmpfs: /tmp"

node_env="environment:
      VECTOR_CONFIG: '$config'"

####################
# Launch stack

docker_compose=$root/.${stack}.docker-compose.yml
rm -f "$docker_compose"
cat - > "$docker_compose" <<EOF
version: '3.4'

networks:
  $project:
    external: true

services:

  alice:
    $common
    $node_image
    $node_env
      VECTOR_MNEMONIC: '$alice_mnemonic'
    ports:
      - '$alice_port:$internal_node_port'
      - '$alice_prisma:$internal_prisma_port'

  bob:
    $common
    $node_image
    $node_env
      VECTOR_MNEMONIC: '$bob_mnemonic'
    ports:
      - '$bob_port:$internal_node_port'
      - '$bob_prisma:$internal_prisma_port'

EOF

docker stack deploy -c "$docker_compose" "$stack"

echo "The $stack stack has been deployed, waiting for $public_url to start responding.."
timeout=$(( $(date +%s) + 300 ))
while true
do
  res=$(curl -k -m 5 -s $public_url || true)
  if [[ -z "$res" || "$res" == "Waiting for proxy to wake up" ]]
  then
    if [[ "$(date +%s)" -gt "$timeout" ]]
    then echo "Timed out waiting for proxy to respond.." && exit
    else sleep 2
    fi
  else echo "Good Morning!" && exit;
  fi
done
