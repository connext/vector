#!/bin/bash
set -e

echo "Ethereum testnet entrypoint activated!"

if [[ -d "modules/contracts" ]]
then cd modules/contracts
fi

address_book="${ADDRESS_BOOK:-/data/address-book.json}"
data_dir="${DATA_DIR:-/tmpfs}"
chain_id="${CHAIN_ID:-1337}"
mnemonic="${MNEMONIC:-candy maple cake sugar pudding cream honey rich smooth crumble sweet treat}"
engine="${ENGINE:-`if [[ "$chain_id" == "1337" ]]; then echo "ganache"; else echo "buidler"; fi`}"

cwd="`pwd`"
mkdir -p $data_dir /data /tmpfs
touch $address_book

# TODO: the gasLimit shouldn't need to be 1000x higher than mainnet but cf tests fail otherwise..

if [[ "$engine" == "buidler" ]]
then
  echo "Using buidler EVM engine"  
  echo 'module.exports = {
    defaultNetwork: "buidlerevm",
    networks: {
      buidlerevm: {
        chainId: '$chain_id',
        loggingEnabled: false,
        accounts: [{
          privateKey: "0xc87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3",
          balance: "1000000000000000000000000000"
        }],
        blockGasLimit: 9000000000,
        gasPrice: 1000000000,
      },
    },
  }' > /tmpfs/buidler.config.js
  launch="$cwd/node_modules/.bin/buidler node --config /tmpfs/buidler.config.js --hostname 0.0.0.0 --port 8545 "
  cd /tmpfs # bc we need to run buidler node in same dir as buidler.config.js

elif [[ "$engine" == "ganache" ]]
then
  echo "Using ganache EVM engine"  
  launch=$cwd'/node_modules/.bin/ganache-cli \
    --db='$data_dir' \
    --defaultBalanceEther=2000000000 \
    --gasLimit=9000000000 \
    --gasPrice=1000000000 \
    --mnemonic="'"$mnemonic"'" \
    --networkId='$chain_id' \
    --port=8545 '
  expose="--host 0.0.0.0"
else
  echo 'Expected $ENGINE to be either "ganache" or "buidler"'
  exit 1
fi

echo "Starting isolated testnet to migrate contracts.."
eval "$launch > /dev/null &"
pid=$!

wait-for localhost:8545

# Because stupid ganache hardcoded it's chainId, prefer this env var over ethProvider.getNetwork()
export REAL_CHAIN_ID=$chain_id

echo "Deploying contracts.."
node $cwd/dist/cli.js migrate --address-book "$address_book" --mnemonic "$mnemonic"

echo "Deploying testnet token.."
node $cwd/dist/cli.js new-token --address-book "$address_book" --mnemonic "$mnemonic"

# Buidler does not persist chain data: it will start with a fresh chain every time
# Ganache persists chain data so we can restart it & this time we'll expose it to the outside world
if [[ "$engine" == "ganache" ]]
then
  kill $pid
  echo "Starting publically available testnet.."
  eval "$launch $expose > /tmpfs/ganache.log"
else
  wait $pid
fi
