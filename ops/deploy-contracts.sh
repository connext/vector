#!/bin/bash
set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"

args="${@:---help}"

docker run \
  --entrypoint=node \
  --interactive \
  --name="${project}_contract_deployer" \
  --network="${project}" \
  --rm \
  --tmpfs="/tmp" \
  --tty \
  --volume="$root/address-book.json:/data/address-book.json" \
  ${project}_ethprovider:latest dist/cli.js migrate --address-book=/data/address-book.json "$args"
