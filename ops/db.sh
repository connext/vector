#!/usr/bin/env bash
set -e

root=$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )
project=$(grep '"name":' "$root/package.json" | head -n 1 | cut -d '"' -f 4)

username=$project
database=$project
service=${project}_database
service_id=$(docker service ps -q "$service" | head -n 1)

if [[ -n "$service_id" ]]
then
  container_id=$(docker inspect --format '{{.Status.ContainerStatus.ContainerID}}' "$service_id")
else
  container_id=$(
    docker container ls --filter 'status=running' --format '{{.ID}} {{.Names}}' |\
    cut -d "." -f 1 |\
    grep "_database" |\
    sort |\
    head -n 1 |\
    cut -d " " -f 1
  )
fi

if [[ -z "$1" ]]
then docker exec -it "$container_id" bash -c "psql $database --username=$username"
else docker exec -it "$container_id" bash -c "psql $database --username=$username --command=\"$1\""
fi
