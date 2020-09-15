#!/usr/bin/env bash
set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/../.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"

unit=$1
cmd=$2
chain_id=$3

# If file descriptors 0-2 exist, then we're prob running via interactive shell instead of on CD/CI
if [[ -t 0 && -t 1 && -t 2 ]]
then interactive="--interactive --tty"
else echo "Running in non-interactive mode"
fi

########################################
# If we need a chain these tests, start the testnet & stop it when we're done

eth_mnemonic="candy maple cake sugar pudding cream honey rich smooth crumble sweet treat"
CHAIN_PROVIDERS="{}"
CONTRACT_ADDRESSES="{}"

if [[ -n "$chain_id" ]]
then
  ethprovider_host="testnet_$chain_id"
  bash ops/start-chain.sh $chain_id
  CHAIN_PROVIDERS="{\"$chain_id\":\"http://172.17.0.1:`expr 8545 - 1337 + $chain_id`\"}"
  CONTRACT_ADDRESSES="`cat $root/.chaindata/${chain_id}/address-book.json`"

  function cleanup {
    echo "Tests finished, stopping testnet.."
    docker container stop $ethprovider_host 2> /dev/null || true
  }
  trap cleanup EXIT SIGINT SIGTERM
fi

exec docker run \
  $interactive \
  --entrypoint="bash" \
  --env="CHAIN_PROVIDERS=$CHAIN_PROVIDERS" \
  --env="CONTRACT_ADDRESSES=$CONTRACT_ADDRESSES" \
  --env="LOG_LEVEL=$LOG_LEVEL" \
  --env="NODE_ENV=$VECTOR_ENV" \
  --env="SUGAR_DADDY=$eth_mnemonic" \
  --name="${project}_test_$unit" \
  --rm \
  --volume="$root:/root" \
  ${project}_builder "/test.sh" "$unit" "$cmd"
