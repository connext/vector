#!/usr/bin/env bash
set -e

root=$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )
project=$(grep -m 1 '"name":' "$root/package.json" | cut -d '"' -f 4)

# make sure a network for this project has been created
docker swarm init 2> /dev/null || true
docker network create --attachable --driver overlay "$project" 2> /dev/null || true

if grep -qs "${project}_node\>" <<<"$(docker container ls --filter 'status=running' --format '{{.ID}} {{.Names}}')"
then echo "A vector node is already running" && exit 0;
fi

####################
# Load config

if [[ ! -f "$root/node.config.json" ]]
then cp "$root/ops/config/node.default.json" "$root/node.config.json"
fi

config=$(cat "$root/ops/config/node.default.json" "$root/node.config.json" | jq -s '.[0] + .[1]')

function getConfig {
  value=$(echo "$config" | jq ".$1" | tr -d '"')
  if [[ "$value" == "null" ]]
  then echo ""
  else echo "$value"
  fi
}

messaging_url=$(getConfig messagingUrl)
production=$(getConfig production)
public_port=$(getConfig port)
mnemonic=$(getConfig mnemonic)

chain_providers=$(echo "$config" | jq '.chainProviders' | tr -d '\n\r ')
default_providers=$(jq '.chainProviders' "$root/ops/config/node.default.json" | tr -d '\n\r ')
if [[ "$chain_providers" == "$default_providers" ]]
then use_local_evms=true
else use_local_evms=false
fi

echo "Preparing to launch node (prod=$production)"

####################
# Misc Config

if [[ "$production" == "true" ]]
then
  # If we're on the prod branch then use the release semvar, otherwise use the commit hash
  if [[ "$(git rev-parse --abbrev-ref HEAD)" == "prod" || "${GITHUB_REF##*/}" == "prod" ]]
  then version=$(grep -m 1 '"version":' package.json | cut -d '"' -f 4)
  else version=$(git rev-parse HEAD | head -c 8)
  fi
else version="latest"
fi

########################################
# Global services / chain provider config

# If no messaging url or custom ethproviders are given, spin up a messaging stack
if [[ -z "$messaging_url" || "$use_local_evms" == "true" ]]
then bash "$root/ops/start-messaging.sh"
fi

# If no custom ethproviders are given, configure mnemonic/addresses from local evms
if [[ "$use_local_evms" == "true" ]]
then
  eth_mnemonic="${mnemonic:-candy maple cake sugar pudding cream honey rich smooth crumble sweet treat}"
  chain_addresses=$(cat "$root/.chaindata/chain-addresses.json")
  config=$(echo "$config" '{"chainAddresses":'"$chain_addresses"'}' | jq -s '.[0] + .[1]')

else
  echo "Connecting to external services: messaging=$messaging_url | chain_providers=$chain_providers"
  if [[ -n "$mnemonic" ]]
  then
    eth_mnemonic="$mnemonic"
  else
    echo "No mnemonic provided for external ethprovider"
    exit 1
  fi
fi

########################################
## Node config

node_internal_port="8000"
node_public_port="${public_port:-8001}"
public_url="http://127.0.0.1:$node_public_port/ping"
echo "node will be exposed on *:$node_public_port"

if [[ "$production" == "true" ]]
then
  node_image_name="${project}_node:$version"
  mount_root=""
  entrypoint=""
  arg=""
else
  node_image_name="${project}_builder:$version"
  mount_root="--volume=$root:/root"
  entrypoint="--entrypoint=bash"
  arg="modules/server-node/ops/entry.sh"
fi

node_image_name="${project}_node:$version"
bash "$root/ops/pull-images.sh" "$node_image_name" > /dev/null

########################################
## Sqlite config

# Hardhat ethprovider can't persist data between restarts
# If we're using local evms, the node shouldn't perist data either
if [[ "$use_local_evms" == "true" ]]
then
  internal_db_file="/tmp/store.sqlite"
  mount_db=""
else
  local_db_file="$root/.node.sqlite"
  internal_db_file="/data/store.sqlite"
  touch "$local_db_file"
  mount_db="--volume=$local_db_file:$internal_db_file"
fi

####################
# Launch node

# If file descriptors 0-2 exist, then we're prob running via interactive shell instead of on CD/CI
if [[ -t 0 && -t 1 && -t 2 ]]
then interactive=(--interactive --tty)
else echo "Running in non-interactive mode"
fi

# shellcheck disable=SC2086
docker run $entrypoint $mount_db $mount_root \
  "${interactive[@]}" \
  --detach \
  --env="VECTOR_CONFIG=$(echo "$config" | tr -d '\n\r')" \
  --env="VECTOR_DATABASE_URL=sqlite://$internal_db_file" \
  --env="VECTOR_MNEMONIC=$eth_mnemonic" \
  --env="VECTOR_PROD=$production" \
  --name="${project}_node" \
  --network="$project" \
  --publish="$node_public_port:$node_internal_port" \
  --rm \
  --tmpfs="/tmp" \
  "$node_image_name" "$arg"

echo "The node has been deployed, waiting for $public_url to start responding.."
timeout=$(( $(date +%s) + 60 ))
while true
do
  res=$(curl -k -m 5 -s "$public_url" || true)
  if [[ -z "$res" ]]
  then
    if [[ "$(date +%s)" -gt "$timeout" ]]
    then echo "Timed out waiting for $public_url to respond.." && exit
    else sleep 2
    fi
  else echo "Good Morning!" && exit;
  fi
done
