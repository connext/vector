#!/usr/bin/env bash
set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"

# make sure a network for this project has been created
docker swarm init 2> /dev/null || true
docker network create --attachable --driver overlay $project 2> /dev/null || true

stack="${1:-node}"
cmd="${2:-test}"

bash $root/ops/start-$stack.sh

# If file descriptors 0-2 exist, then we're prob running via interactive shell instead of on CD/CI
if [[ -t 0 && -t 1 && -t 2 ]]
then interactive="--interactive --tty"
else echo "Running in non-interactive mode"
fi

source $root/dev.env

########################################
## Launch test runner

if [[ "$stack" == "duet" ]]
then stack_env=" \
  --env=VECTOR_ALICE_URL=http://alice:8000 \
  --env=VECTOR_BOB_URL=http://bob:8000"
fi

common="$interactive $stack_env \
  --env=NODE_TLS_REJECT_UNAUTHORIZED=0 \
  --env=VECTOR_ADMIN_TOKEN=$VECTOR_ADMIN_TOKEN \
  --env=VECTOR_ALICE_URL=nats://alice:8000 \
  --env=VECTOR_AUTH_URL=nats://auth:5040 \
  --env=VECTOR_BOB_URL=nats://bob:8000 \
  --env=VECTOR_CHAIN_PROVIDERS=`cat $root/.chaindata/chain-providers.json | tr -d ' \n'` \
  --env=VECTOR_CONTRACT_ADDRESSES=`cat $root/.chaindata/address-book.json | tr -d ' \n'` \
  --env=VECTOR_ENV=${ENV:-dev} \
  --env=VECTOR_LOG_LEVEL=${LOG_LEVEL:-0} \
  --env=VECTOR_NATS_URL=nats://nats:4222 \
  --env=VECTOR_NODE_URL=http://node:8000 \
  --name=${project}_test_runner \
  --network=$project \
  --rm \
  --tmpfs /tmp"

# prod version: if we're on a tagged commit then use the tagged semvar, otherwise use the hash
if [[ "$VECTOR_ENV" == "prod" ]]
then
  git_tag="`git tag --points-at HEAD | grep "vector-" | head -n 1`"
  if [[ -z "$version" ]]
  then
    if [[ -n "$git_tag" ]]
    then version="`echo $git_tag | sed 's/vector-//'`"
    else version="`git rev-parse HEAD | head -c 8`"
    fi
  fi
  image=${project}_test_runner:$version
  echo "Executing $cmd w image $image"
  exec docker run $common $image $cmd $stack

else
  echo "Executing $cmd w image ${project}_builder"
  exec docker run \
    $common \
    --entrypoint=bash \
    --volume="$root:/root" \
    ${project}_builder -c "bash modules/test-runner/ops/entry.sh $cmd $stack"
fi
