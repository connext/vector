#!/usr/bin/env bash
set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"

chain_id_1="${1:-1337}"
chain_id_2="${2:-1338}"

mnemonic="${VECTOR_MNEMONIC:-candy maple cake sugar pudding cream honey rich smooth crumble sweet treat}"

########################################
# Configure or launch Ethereum testnets

chain_host_1="testnet_$chain_id_1"
chain_host_2="testnet_$chain_id_2"

chain_url_1="http://$chain_host_1:8545"
chain_url_2="http://$chain_host_2:8545"

chain_providers='{"'$chain_id_1'":"'$chain_url_1'","'$chain_id_2'":"'$chain_url_2'"}'

echo "Starting $chain_host_1 & $chain_host_2.."
export VECTOR_MNEMONIC=$mnemonic

# NOTE: Start script for buidler testnet will return before it's actually ready to go.
# Run buidlerevm first so that it can finish while we're waiting for ganache to get set up
bash ops/start-chain.sh $chain_id_2

bash ops/start-chain.sh $chain_id_1

# Pull the tmp address books out of each chain provider & merge them into one
address_book_1=`docker exec $chain_host_1 cat /data/address-book.json`
address_book_2=`docker exec $chain_host_2 cat /data/address-book.json`
contract_addresses=`echo $address_book_1 $address_book_2 | jq -s '.[0] * .[1]'`

# Save chain data somewhere easily accessible
mkdir -p $root/.chaindata/providers $root/.chaindata/addresses
echo $chain_providers > $root/.chaindata/providers/${chain_id_1}-${chain_id_2}.json
echo $contract_addresses > $root/.chaindata/addresses/${chain_id_1}-${chain_id_2}.json
