#!/bin/bash
set -e

echo "Ethereum testnet entrypoint activated!"

## Setup env

if [[ -d "modules/contracts" ]]
then cd modules/contracts || exit 1
fi

export ADDRESS_BOOK="${ADDRESS_BOOK:-/data/address-book.json}"
export CHAIN_ID="${CHAIN_ID:-1337}"
export MNEMONIC="${MNEMONIC:-candy maple cake sugar pudding cream honey rich smooth crumble sweet treat}"

mkdir -p /data /tmp
touch "$ADDRESS_BOOK"

config_file="/tmp/hardhat.config.js"
chain_addresses="$(dirname "$ADDRESS_BOOK")/chain-addresses.json"

# rm this early so we can use it's presence to indicate when migrations finish
rm -f "$chain_addresses"

## Start hardhat testnet

echo "Starting testnet with chain id $CHAIN_ID"
echo 'module.exports = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      chainId: '"$CHAIN_ID"',
      loggingEnabled: false,
      accounts: {
        mnemonic: "'"$MNEMONIC"'",
        accountsBalance: "0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      },
      gasPrice: 100000000000,
    },
  },
}' > "$config_file"
hardhat node --hostname 0.0.0.0 --port 8545 | pino-pretty --colorize --translateTime --ignore pid,level,hostname &
pid=$!
echo "Waiting for testnet to wake up.."
wait-for -q -t 60 localhost:8545 2>&1 | sed '/nc: bad address/d'
echo "Good morning!"

## Run contract migrations
## Nvmd, this should happen automatically thanks to the hardhat-deploy plugin
#echo "Migrating contracts.."
#hardhat deploy | pino-pretty --colorize --translateTime --ignore pid,level,hostname

## Expose the address book in a more accessible format

# jq docs: https://stedolan.github.io/jq/manual/v1.5/#Builtinoperatorsandfunctions
jq '
  map_values(
    map_values(.address) |
   to_entries |
    map(.key = "\(.key)Address") |
    map(.key |= (capture("(?<a>^[A-Z])(?<b>.*$)"; "g") | "\(.a | ascii_downcase)\(.b)")) |
    from_entries
 )
' < "$ADDRESS_BOOK" > "$chain_addresses"

## exit iff our evm exits

# Wait around & respond to signals
function goodbye {
  echo "Received kill signal, goodbye"
  exit
}
trap goodbye SIGTERM SIGINT
wait $pid
