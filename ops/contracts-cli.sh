#!/bin/bash
set -e

root=$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )
project=$(grep -m 1 '"name":' "$root/package.json" | cut -d '"' -f 4)

# make sure a network for this project has been created
docker swarm init 2> /dev/null || true
docker network create --attachable --driver overlay "$project" 2> /dev/null || true

args=("$@");
if [[ "${#@}" == "0" ]]
then args=(--help);
fi

ethprovider_image="${project}_ethprovider:latest";
bash "$root/ops/pull-images.sh" "$ethprovider_image" > /dev/null

prettyfn="./node_modules/.bin/pino-pretty"
if [[ -x "$prettyfn" ]]
then prettify=("$prettyfn" "-f" "--ignore" "level,pid,hostname,time")
else prettify=()
fi

docker run \
  --entrypoint=hardhat \
  --env="API_KEY=${API_KEY}" \
  --env="ETH_PROVIDER_URL=${ETH_PROVIDER_URL}" \
  --env="MNEMONIC=${MNEMONIC}" \
  --interactive \
  --name="${project}_contract_cli" \
  --network="${project}" \
  --rm \
  --tmpfs="/tmp" \
  --tty \
  --volume="$root:/root" \
  --workdir="/root/modules/contracts" \
  "$ethprovider_image" "${args[@]}" | "${prettify[@]}"
