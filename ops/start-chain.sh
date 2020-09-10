#!/usr/bin/env bash
set -e

## This script will start a testnet chain & store that chain's data in indra/.chaindata/${chain_id}

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"
registry="`cat $root/package.json | grep '"registry":' | head -n 1 | cut -d '"' -f 4`"

# make sure a network for this project has been created
docker swarm init 2> /dev/null || true
docker network create --attachable --driver overlay $project 2> /dev/null || true

chain_id="${1:-1337}"

port="${INDRA_CHAIN_PORT:-`expr 8545 - 1337 + $chain_id`}"
tag="${INDRA_TAG:-$chain_id}"
mnemonic="${INDRA_MNEMONIC:-candy maple cake sugar pudding cream honey rich smooth crumble sweet treat}"
engine="${INDRA_EVM:-`if [[ "$chain_id" == "1337" ]]; then echo "ganache"; else echo "buidler"; fi`}"
logLevel="${INDRA_CHAIN_LOG_LEVEL:0}"

ethprovider_host="testnet_$tag"

if [[ -n `docker container ls | grep ${ethprovider_host}` ]]
then echo "A container called $ethprovider_host already exists" && exit
fi

chain_data="$root/.chaindata/$chain_id"
mkdir -p $chain_data

# prod version: if we're on a tagged commit then use the tagged semvar, otherwise use the hash
if [[ "$INDRA_ENV" == "prod" ]]
then
  git_tag="`git tag --points-at HEAD | grep "indra-" | head -n 1`"
  if [[ -n "$git_tag" ]]
  then version="`echo $git_tag | sed 's/indra-//'`"
  else version="`git rev-parse HEAD | head -c 8`"
  fi
  image="${project}_ethprovider:$version"

else
  image="${project}_builder"
  arg="modules/contracts/ops/entry.sh"
  opts="--entrypoint bash --mount type=bind,source=$root,target=/root"
fi

echo "Running ${INDRA_ENV:-dev}-mode image for testnet ${chain_id}: ${image}"

docker run $opts \
  --detach \
  --env "CHAIN_ID=$chain_id" \
  --env "ENGINE=$engine" \
  --env "MNEMONIC=$mnemonic" \
  --mount "type=bind,source=$chain_data,target=/data" \
  --name "$ethprovider_host" \
  --network "$project" \
  --publish "$port:8545" \
  --rm \
  --tmpfs "/tmpfs" \
  $image $arg

if [[ "$logLevel" -gt "0" ]]
then docker container logs --follow $ethprovider_host &
fi

while ! curl -s http://localhost:$port > /dev/null
do
  if [[ -z `docker container ls -f name=$ethprovider_host -q` ]]
  then echo "$ethprovider_host was not able to start up successfully" && exit 1
  else sleep 1
  fi
done

while [[ -z "`docker exec $ethprovider_host cat /data/address-book.json | grep '"Token":' || true`" ]]
do
  if [[ -z `docker container ls -f name=$ethprovider_host -q` ]]
  then echo "$ethprovider_host was not able to start up successfully" && exit 1
  else sleep 1
  fi
done

echo "Provider for chain ${chain_id} is awake & ready to go on port ${port}!"
