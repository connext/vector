#!/usr/bin/env bash
set -e

root=$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )
project=$(grep -m 1 '"name":' "$root/package.json" | cut -d '"' -f 4)

# make sure a network for this project has been created
docker swarm init 2> /dev/null || true
docker network create --attachable --driver overlay "$project" 2> /dev/null || true

# If file descriptors 0-2 exist, then we're prob running via interactive shell instead of on CD/CI
if [[ -t 0 && -t 1 && -t 2 ]]
then interactive=(--interactive --tty)
else echo "Running in non-interactive mode"
fi

evm="${1:-hardhat}"
chain_providers="${2}"
cmd="npx hardhat test --network $evm"

########################################
# If we need a chain for these tests, start the evm & stop it when we're done

eth_mnemonic="${3:-candy maple cake sugar pudding cream honey rich smooth crumble sweet treat}"

# Build necessary packages
make contracts

# TODO: should just start chains here as well
if [[ "$evm" == "hardhat" ]]
then echo "Use 'make test-contracts' for local chains" && exit 1
else echo "Running tests against remote node"
fi

docker run \
  "${interactive[@]}" \
  --entrypoint="bash" \
  --env="LOG_LEVEL=$LOG_LEVEL" \
  --env="SUGAR_DADDY=$eth_mnemonic" \
  --env="CHAIN_PROVIDERS=$chain_providers" \
  --name="${project}_test_${evm}" \
  --network "$project" \
  --rm \
  --tmpfs="/tmp" \
  --volume="$root:/root" \
  "${project}_builder" -c "cd ./modules/contracts && $cmd"
