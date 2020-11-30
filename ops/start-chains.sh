#!/usr/bin/env bash
set -e

stack="chains"
root=$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )
project=$(grep -m 1 '"name":' "$root/package.json" | cut -d '"' -f 4)

# make sure a network for this project has been created
docker swarm init 2> /dev/null || true
docker network create --attachable --driver overlay "$project" 2> /dev/null || true

if grep -qs "$stack" <<<"$(docker stack ls --format '{{.Name}}')"
then echo "A $stack stack is already running" && exit 0
fi

####################
# Config

mnemonic="candy maple cake sugar pudding cream honey rich smooth crumble sweet treat"
chain_id_1="1337"
chain_id_2="1338"
echo
echo "Preparing to launch $stack stack w config:"
echo " - mnemonic=$mnemonic"
echo " - chain_id_1=$chain_id_1"
echo " - chain_id_2=$chain_id_2"

evm_port_1="8545"
evm_port_2="8546"
echo "${stack} will be exposed on *:$evm_port_1 and *:$evm_port_2"

chain_data="$root/.chaindata"
rm -rf "$chain_data"

chain_data_1="$chain_data/$chain_id_1"
chain_data_2="$chain_data/$chain_id_2"
mkdir -p "$chain_data_1" "$chain_data_2"

chain_addresses_1="$chain_data_1/chain-addresses.json"
chain_addresses_2="$chain_data_2/chain-addresses.json"

evm_image_name="${project}_ethprovider:latest";
bash "$root/ops/pull-images.sh" "$evm_image_name" > /dev/null

evm_image="image: '$evm_image_name'
    networks:
      - '$project'
    logging:
      driver: 'json-file'
      options:
          max-size: '100m'
    tmpfs: /tmp"

####################
# Launch

docker_compose=$root/.${stack}.docker-compose.yml
rm -f "$docker_compose"
cat - > "$docker_compose" <<EOF
version: '3.4'

networks:
  $project:
    external: true

services:

  'evm_$chain_id_1':
    $evm_image
    environment:
      MNEMONIC: '$mnemonic'
      CHAIN_ID: '$chain_id_1'
    ports:
      - '$evm_port_1:8545'
    volumes:
      - '$chain_data_1:/data'

  'evm_$chain_id_2':
    $evm_image
    environment:
      MNEMONIC: '$mnemonic'
      CHAIN_ID: '$chain_id_2'
    ports:
      - '$evm_port_2:8545'
    volumes:
      - '$chain_data_2:/data'

EOF

docker stack deploy -c "$docker_compose" "$stack"
echo "The $stack stack has been deployed, waiting for it to wake up.."

timeout=$(( $(date +%s) + 300 ))
while 
  ! grep -qs "transferRegistryAddress" "$chain_addresses_1" ||\
  ! grep -qs "transferRegistryAddress" "$chain_addresses_2"
do
  if [[ "$(date +%s)" -gt "$timeout" ]]
  then echo "Timed out waiting for $stack stack to wake up" && exit 1
  else sleep 1
  fi
done

# Save multi-chain providers & addresses

echo '{
  "'$chain_id_1'":"http://evm_'$chain_id_1':8545",
  "'$chain_id_2'":"http://evm_'$chain_id_2':8545"
}' > "$chain_data/chain-providers.json"

cat "$chain_data_1/address-book.json" "$chain_data_2/address-book.json" \
  | jq -s '.[0] + .[1]' \
  > "$chain_data/address-book.json"

cat "$chain_addresses_1" "$chain_addresses_2" \
  | jq -s '.[0] + .[1]' \
  > "$chain_data/chain-addresses.json"

echo "Good Morning!"
