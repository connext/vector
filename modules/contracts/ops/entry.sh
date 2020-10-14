#!/bin/bash
set -e

echo "Ethereum testnet entrypoint activated!"

if [[ -d "modules/contracts" ]]
then cd modules/contracts
fi

address_book="${ADDRESS_BOOK:-/data/address-book.json}"
data_dir="${DATA_DIR:-/tmp}"
chain_id="${CHAIN_ID:-1337}"
mnemonic="${MNEMONIC:-candy maple cake sugar pudding cream honey rich smooth crumble sweet treat}"
evm="${EVM:-`if [[ "$chain_id" == "1337" ]]; then echo "ganache"; else echo "buidler"; fi`}"

chain_addresses="`dirname $address_book`/chain-addresses.json"

cwd="`pwd`"
mkdir -p $data_dir /data /tmp
touch $address_book
rm -f $chain_addresses

if [[ "$evm" == "buidler" ]]
then
  echo "Using buidler EVM"  
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
        gasPrice: 100000000000,
      },
    },
  }' > /tmp/buidler.config.js
  launch="$cwd/node_modules/.bin/buidler node --config /tmp/buidler.config.js --hostname 0.0.0.0 --port 8545 "
  cd /tmp # bc we need to run buidler node in same dir as buidler.config.js

elif [[ "$evm" == "ganache" ]]
then
  echo "Using ganache EVM"  
  launch=$cwd'/node_modules/.bin/ganache-cli \
    --db='$data_dir' \
    --defaultBalanceEther=2000000000 \
    --gasPrice=100000000000 \
    --mnemonic="'"$mnemonic"'" \
    --networkId='$chain_id' \
    --host 0.0.0.0 \
    --port=8545 '
  expose=""
else
  echo 'Expected $EVM to be either "ganache" or "buidler"'
  exit 1
fi

echo "Starting isolated testnet to migrate contracts.."
eval "$launch > /tmp/evm.log &"
pid=$!

wait-for -q -t 60 localhost:8545

# Because stupid ganache hardcoded it's chainId, prefer this env var over ethProvider.getNetwork()
export REAL_CHAIN_ID=$chain_id

echo "Deploying contracts.."
node $cwd/dist/cli.js migrate --address-book "$address_book" --mnemonic "$mnemonic"

node $cwd/dist/cli.js new-token --address-book "$address_book" --mnemonic "$mnemonic"

# jq docs: https://stedolan.github.io/jq/manual/v1.5/#Builtinoperatorsandfunctions
function fromAddressBook {
  jq '
    map_values(
      map_values(.address) |
      to_entries |
      map(.key = "\(.key)Address") |
      map(.key |= (capture("(?<a>^[A-Z])(?<b>.*$)"; "g") | "\(.a | ascii_downcase)\(.b)")) |
      from_entries
    )
  ';
}

cat $address_book | fromAddressBook > $chain_addresses

wait $pid
