#!/usr/bin/env bash
set -e

unit="server_node"

root=$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )
project=$(grep -m 1 '"name":' "$root/package.json" | cut -d '"' -f 4)

# make sure a network for this project has been created
docker swarm init 2> /dev/null || true
docker network create --attachable --driver overlay "$project" 2> /dev/null || true

cmd="${1:-test}"

####################
# Load Config

config=$(cat "$root/ops/config/node.default.json")

# Override logLevel if env var is provided
if [[ -n "$LOG_LEVEL" ]]
then config=$(echo "$config" '{"logLevel":'"$LOG_LEVEL"'}' | jq -s '.[0] + .[1]')
fi

########################################
# Global services / chain provider config

alice_mnemonic="avoid post vessel voyage trigger real side ribbon pattern neither essence shine"

bash "$root/ops/start-global.sh"

chain_addresses=$(cat "$root/.chaindata/chain-addresses.json")
config=$(echo "$config" '{"chainAddresses":'"$chain_addresses"'}' | jq -s '.[0] + .[1]')

# If file descriptors 0-2 exist, then we're prob running via interactive shell instead of on CD/CI
if [[ -t 0 && -t 1 && -t 2 ]]
then interactive=(--interactive --tty)
else echo "Running in non-interactive mode"
fi

########################################
# Launch stack

echo "Starting server node unit tests"
docker run \
  "${interactive[@]}" \
  --entrypoint="bash" \
  --env="CI=$CI" \
  --env="VECTOR_CONFIG=$config" \
  --env="VECTOR_MNEMONIC=$alice_mnemonic" \
  --name="${project}_test_$unit" \
  --network "$project" \
  --rm \
  --tmpfs="/tmp" \
  --volume="$root:/root" \
  "${project}_builder:latest" "/test.sh" "server-node" "$cmd"
