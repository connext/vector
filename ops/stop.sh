#!/usr/bin/env bash

# turn on swarm mode if it's not already on
docker swarm init 2> /dev/null || true

# make sure a network for this project has been created
docker network create --attachable --driver overlay $project 2> /dev/null || true

target=$1
shift

# If a stack matches, stop it & wait for child servies to all exit
stack_name="`docker stack ls --format '{{.Name}}' | grep "$target"`"
if [[ -n "$stack_name" ]]
then
  echo
  echo "Stopping stack $stack_name"
  docker stack rm $stack_name
  echo "Waiting for the $stack_name stack to completely shutdown.."
  while [[ -n "`docker container ls -q --filter label=com.docker.stack.namespace=$stack_name`" ]]
  do sleep 2 # wait until there are no more containers in this stack
  done
  while [[ -n "`docker network ls -q --filter label=com.docker.stack.namespace=$stack_name`" ]]
  do sleep 2 # wait until the stack's network has been removed
  done
  echo "Goodnight $stack_name!"
  exit
fi

# If any container names match, stop all of them
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
  exit
fi

echo "No stack, service or running container names match: $target"
