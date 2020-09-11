#!/usr/bin/env bash
set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/../.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"

cmd="${1:-test}"
shift || true # $1 is the command to npm run. Extra options, if any, come after

########################################
# Start testnet & stop it when we're done

chain_id="1341"

eth_mnemonic="candy maple cake sugar pudding cream honey rich smooth crumble sweet treat"
ethprovider_host="testnet_$chain_id"
ethprovider_port=`expr 8545 - 1337 + $chain_id`

# Kill the dependency containers when this script exits
function cleanup {
  echo "Tests finished, stopping testnet.."
  docker container stop $ethprovider_host 2> /dev/null || true
}
trap cleanup EXIT SIGINT SIGTERM

echo "Starting $ethprovider_host.."
export INDRA_MNEMONIC=$eth_mnemonic
bash ops/start-chain.sh $chain_id

########################################
# Launch tests

# If file descriptors 0-2 exist, then we're prob running via interactive shell instead of on CD/CI
if [[ -t 0 && -t 1 && -t 2 ]]
then interactive="--interactive --tty"
else echo "Running in non-interactive mode"
fi

docker run \
  $interactive \
  --entrypoint="bash" \
  --env="PROVIDER_URL=http://172.17.0.1:$ethprovider_port" \
  --env="LOG_LEVEL=$LOG_LEVEL" \
  --env="SUGAR_DADDY=$eth_mnemonic" \
  --name="${project}_engine_tester" \
  --rm \
  --volume="$root:/root" \
  ${project}_builder -c 'cd modules/engine && npm run '"$cmd"' -- '"$@"
