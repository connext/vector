#!/bin/bash
set -e

echo "Ethereum testnet entrypoint activated!"

if [[ -d "modules/contracts" ]]
then cd modules/contracts
fi

ADDRESS_BOOK="${ADDRESS_BOOK:-/data/address-book.json}"
export CHAIN_ID="${CHAIN_ID:-1337}"
export MNEMONIC="${MNEMONIC:-candy maple cake sugar pudding cream honey rich smooth crumble sweet treat}"

cwd="$(pwd)"
mkdir -p /data /tmp
touch "$ADDRESS_BOOK"

chain_addresses="$(dirname "$ADDRESS_BOOK")/chain-addresses.json"
rm -f "$chain_addresses"

config_file="/tmp/hardhat.config.js"
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

launch="hardhat node --config $config_file --hostname 0.0.0.0 --port 8545"

echo "Starting testnet to migrate contracts.."
eval "$launch > /tmp/evm.log &"
pid=$!

echo "Waiting for local testnet to wake up.."
wait-for -q -t 60 localhost:8545 2>&1 | sed '/nc: bad address/d'

echo "Migrating contracts.."
node "$cwd/dist/cli.js" migrate --address-book "$ADDRESS_BOOK" --mnemonic "$MNEMONIC" | pino-pretty --colorize --translateTime --ignore pid,level,hostname

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

fromAddressBook < "$ADDRESS_BOOK" > "$chain_addresses"

wait $pid
