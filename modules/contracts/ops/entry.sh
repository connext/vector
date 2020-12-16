#!/bin/bash
set -e

echo "Ethereum testnet entrypoint activated!"

if [[ -d "modules/contracts" ]]
then cd modules/contracts || exit 1
fi

export ADDRESS_BOOK="${ADDRESS_BOOK:-/data/address-book.json}"
export CHAIN_ID="${CHAIN_ID:-1337}"
export MNEMONIC="${MNEMONIC:-candy maple cake sugar pudding cream honey rich smooth crumble sweet treat}"

mkdir -p /data /tmp
touch "$ADDRESS_BOOK"

# rm this early so we can use it's presence to indicate when migrations finish
chain_addresses="$(dirname "$ADDRESS_BOOK")/chain-addresses.json"
rm -f "$chain_addresses"

## Start hardhat testnet

echo "Starting hardhat node.."
hardhat node --hostname 0.0.0.0 --port 8545 --no-deploy --as-network localhost > /tmp/hardhat.log &
pid=$!
echo "Waiting for testnet to wake up.."
wait-for -q -t 60 localhost:8545 2>&1 | sed '/nc: bad address/d'
echo "Good morning!"

mkdir -p deployments
hardhat deploy --network localhost --no-compile --export-all "$ADDRESS_BOOK" | pino-pretty --colorize --translateTime --ignore pid,level,hostname,module

# jq docs: https://stedolan.github.io/jq/manual/v1.5/#Builtinoperatorsandfunctions
jq '
  .["'"$CHAIN_ID"'"].localhost.contracts
    | map_values(.address)
    | to_entries
    | map(.key = "\(.key)Address")
    | map(.key |= (capture("(?<a>^[A-Z])(?<b>.*$)"; "g") | "\(.a | ascii_downcase)\(.b)"))
    | from_entries
    | { "'"$CHAIN_ID"'": {channelFactoryAddress,testTokenAddress,transferRegistryAddress,hashlockTransferAddress} }
' "$ADDRESS_BOOK" > "$chain_addresses"

echo "Ethprovider started & deployed vector successfully, waiting for kill signal"
function goodbye {
  echo "Received kill signal, goodbye"
  kill $pid
  exit
}
trap goodbye SIGTERM SIGINT
wait $pid
