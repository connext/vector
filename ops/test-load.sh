#!/usr/bin/env bash
set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"

# make sure a network for this project has been created
docker swarm init 2> /dev/null || true
docker network create --attachable --driver overlay $project 2> /dev/null || true

num_agents="${1:-5}"

sugar_daddy="candy maple cake sugar pudding cream honey rich smooth crumble sweet treat"

########################################
## Launch test runner

common="$interactive $stack_env \
  --env=NODE_TLS_REJECT_UNAUTHORIZED=0 \
  --env=VECTOR_ADMIN_TOKEN=$VECTOR_ADMIN_TOKEN \
  --env=VECTOR_AUTH_URL=http://auth:5040 \
  --env=VECTOR_CAROL_URL=http://carol:8000 \
  --env=VECTOR_CHAIN_PROVIDERS=`cat $root/.chaindata/chain-providers.json | tr -d ' \n'` \
  --env=VECTOR_CHAIN_ADDRESSES=`cat $root/.chaindata/chain-addresses.json | tr -d ' \n'` \
  --env=VECTOR_DAVE_URL=http://dave:8000 \
  --env=VECTOR_ENV=${ENV:-dev} \
  --env=VECTOR_LOG_LEVEL=${LOG_LEVEL:-error} \
  --env=VECTOR_NATS_URL=nats://nats:4222 \
  --env=VECTOR_NUM_AGENTS=${num_agents}
  --env=VECTOR_ROGER_URL=http://roger:8000 \
  --env=VECTOR_ROUTER_URL=http://router:8009 \
  --name=${project}${stack}_test_runner \
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
  docker run $common $image $cmd $stack

else
  echo "Executing $cmd w image ${project}_builder"
  docker run \
    $common \
    --entrypoint=bash \
    --volume="$root:/root" \
    ${project}_builder -c "cd modules/test-runner && npm run load-test"
fi
