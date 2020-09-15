#!/bin/bash
set -e

echo "Contract migration entrypoint activated"

if [[ -d "modules/contracts" ]]
then cd modules/contracts
fi

address_book="${ADDRESS_BOOK:-/data/address-book.json}"

eth_provider="${ETH_PROVIDER:-http://172.17.0.1:8545}"

mnemonic="${MNEMONIC:-candy maple cake sugar pudding cream honey rich smooth crumble sweet treat}"

mkdir -p $data_dir /data /tmpfs
touch $address_book

echo "Deploying contracts.."
node dist/src.ts/cli.js migrate \
  --address-book "$address_book" \
  --eth-provider "$eth_provider" \
  --mnemonic "$mnemonic"
