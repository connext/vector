#!/bin/bash
set -e

project="indra"
service=${project}_database
service_id="`docker service ps -q $service | head -n 1`"
id="`docker inspect --format '{{.Status.ContainerStatus.ContainerID}}' $service_id`"

if [[ -z "`docker service ps -q $service`" ]]
then echo "Error: expected to see $service running" && exit 1
fi

docker exec $id bash backup.sh
