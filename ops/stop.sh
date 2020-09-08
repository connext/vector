#!/usr/bin/env bash

# turn on swarm mode if it's not already on
docker swarm init 2> /dev/null || true

# make sure a network for this project has been created
docker network create --attachable --driver overlay $project 2> /dev/null || true

target=$1 # one of: indra, daicard, all
shift

function stop_stack {
  stack_name=$1
  docker stack rm $stack_name
  echo "Waiting for the $stack_name stack to shutdown.."
  while [[ -n "`docker container ls -q --filter label=com.docker.stack.namespace=$stack_name`" ]]
  do sleep 3 # wait until there are no more containers in this stack
  done
  while [[ -n "`docker network ls -q --filter label=com.docker.stack.namespace=$stack_name`" ]]
  do sleep 3 # wait until the stack's network has been removed
  done
  echo "Goodnight $stack_name!"
}

stack_name="`docker stack ls --format '{{.Name}}' | grep "$target"`"
if [[ -n "$stack_name" ]]
then
  echo "Stopping stack $stack_name"
  stop_stack $stack_name
  exit
fi

service_id="`docker service ls --format '{{.ID}} {{.Name}}' |\
  grep "_$target" |\
  head -n 1 |\
  cut -d " " -f 1
`"

# If a service matches, restart it instead of stopping
if [[ -n "$service_id" ]]
then
  echo "Restarting service $service_id"
  docker service scale $service_id=0
  docker service scale $service_id=1
  exit
fi

container_ids="`docker container ls --filter 'status=running' --format '{{.ID}} {{.Names}}' |\
  cut -d "." -f 1 |\
  grep "$target" |\
  sort |\
  cut -d " " -f 1
`"

if [[ -n "$container_ids" ]]
then
  for container_id in $container_ids
  do
    echo "Stopping container $container_id"
    docker container stop $container_id > /dev/null
  done
else echo "No stack, service or running container names match: $target"
fi
