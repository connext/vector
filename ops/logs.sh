#!/bin/bash
set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"

target=$1
shift

service_id="`docker service ls --format '{{.ID}} {{.Name}}' |\
  grep "$target" |\
  head -n 1 |\
  cut -d " " -f 1
`"

if [[ -n "$service_id" ]]
then
  docker service ps --no-trunc $service_id
  sleep 0.5
  exec docker service logs --follow --raw --tail 100 $service_id $@
fi

container_id="`docker container ls --filter 'status=running' --format '{{.ID}} {{.Names}}' |\
  cut -d "." -f 1 |\
  grep "$target" |\
  sort |\
  head -n 1 |\
  cut -d " " -f 1
`"

if [[ -n "$container_id" ]]
then exec docker container logs --tail 100 --follow $container_id $@
else echo "No service or running container names match: $target"
fi
