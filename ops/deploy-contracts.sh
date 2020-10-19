#!/bin/bash
set -e

root=$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )
project=$(grep -m 1 '"name":' "$root/package.json" | cut -d '"' -f 4)

args="${*:---help}"

ethprovider_image="${project}_ethprovider:latest";
bash "$root/ops/pull-images.sh" "$ethprovider_image" > /dev/null

docker run \
  --entrypoint=node \
  --interactive \
  --name="${project}_contract_deployer" \
  --network="${project}" \
  --rm \
  --tmpfs="/tmp" \
  --tty \
  --volume="$root/address-book.json:/data/address-book.json" \
  "$ethprovider_image" dist/cli.js migrate --address-book=/data/address-book.json "$args"
