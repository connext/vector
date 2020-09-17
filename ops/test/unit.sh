#!/usr/bin/env bash
set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/../.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"

# make sure a network for this project has been created
docker swarm init 2> /dev/null || true
docker network create --attachable --driver overlay $project 2> /dev/null || true

unit=$1
cmd=$2
chain_id=$3

# If file descriptors 0-2 exist, then we're prob running via interactive shell instead of on CD/CI
if [[ -t 0 && -t 1 && -t 2 ]]
then interactive="--interactive --tty"
else echo "Running in non-interactive mode"
fi

########################################
# If we need a chain for these tests, start the evm & stop it when we're done

eth_mnemonic="candy maple cake sugar pudding cream honey rich smooth crumble sweet treat"
CHAIN_PROVIDERS="{}"
CONTRACT_ADDRESSES="{}"

if [[ -n "$chain_id" ]]
then
  port="${VECTOR_CHAIN_PORT:-`expr 8545 - 1337 + $chain_id`}"
  ethprovider_host="evm_$chain_id"
  chain_data="$root/.chaindata/$chain_id"
  mkdir -p $chain_data

  function cleanup {
    echo "Tests finished, stopping evm.."
    docker container stop $ethprovider_host 2> /dev/null || true
  }
  trap cleanup EXIT SIGINT SIGTERM

  docker run $opts \
    --detach \
    --env "CHAIN_ID=$chain_id" \
    --env "EVM=buidler" \
    --env "MNEMONIC=$eth_mnemonic" \
    --mount "type=bind,source=$chain_data,target=/data" \
    --name "$ethprovider_host" \
    --network "$project" \
    --publish "$port:8545" \
    --rm \
    --tmpfs "/tmp" \
    ${project}_ethprovider

  while [[ -z "`cat $chain_data/address-book.json | grep 'TestToken' || true`" ]]
  do
    if [[ -z `docker container ls -f name=$ethprovider_host -q` ]]
    then echo "$ethprovider_host was not able to start up successfully" && exit 1
    else sleep 1
    fi
  done
  echo "Provider for chain ${chain_id} is awake & ready to go on port ${port}!"

  CHAIN_PROVIDERS="{\"$chain_id\":\"http://$ethprovider_host:8545\"}"
  CONTRACT_ADDRESSES="`cat $chain_data/address-book.json`"
fi

docker run \
  $interactive \
  --entrypoint="bash" \
  --env="CHAIN_PROVIDERS=$CHAIN_PROVIDERS" \
  --env="CONTRACT_ADDRESSES=$CONTRACT_ADDRESSES" \
  --env="LOG_LEVEL=$LOG_LEVEL" \
  --env="NODE_ENV=$VECTOR_ENV" \
  --env="SUGAR_DADDY=$eth_mnemonic" \
  --name="${project}_test_$unit" \
  --network "$project" \
  --rm \
  --tmpfs="/tmp" \
  --volume="$root:/root" \
  ${project}_builder "/test.sh" "$unit" "$cmd"
