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

docker run \
  --entrypoint=hardhat \
  --interactive \
  --name="${project}_contract_cli" \
  --network="${project}" \
  --rm \
  --tmpfs="/tmp" \
  --tty \
  --volume="$root/address-book.json:/data/address-book.json" \
  "$ethprovider_image" migrate "${args[@]}"
