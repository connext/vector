#!/usr/bin/env bash
set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project=$(grep -m 1 '"name":' "$root/package.json" | cut -d '"' -f 4)

# make sure a network for this project has been created
docker swarm init 2> /dev/null || true
docker network create --attachable --driver overlay "$project" 2> /dev/null || true

stack="${1:-node}"
cmd="${2:-test}"

bash "$root/ops/start-$stack.sh"

# If file descriptors 0-2 exist, then we're prob running via interactive shell instead of on CD/CI
if [[ -t 0 && -t 1 && -t 2 ]]
then interactive="--interactive --tty"
else echo "Running in non-interactive mode"
fi

########################################
## Launch test runner
tester_name=${project}_${stack}_test_runner
common="$interactive \
  --env=NODE_TLS_REJECT_UNAUTHORIZED=0 \
  --env=VECTOR_ADMIN_TOKEN=$VECTOR_ADMIN_TOKEN \
  --env=VECTOR_ALICE_URL=http://alice:8000 \
  --env=VECTOR_MESSAGING_URL=http://messaging \
  --env=VECTOR_BOB_URL=http://bob:8000 \
  --env=VECTOR_CAROL_URL=http://carol:8000 \
  --env=VECTOR_CHAIN_PROVIDERS=$(tr -d ' \n' < "$root/.chaindata/chain-providers.json") \
  --env=VECTOR_CHAIN_ADDRESSES=$(tr -d ' \n' < "$root/.chaindata/chain-addresses.json") \
  --env=VECTOR_DAVE_URL=http://dave:8000 \
  --env=VECTOR_PROD=${VECTOR_PROD} \
  --env=VECTOR_LOG_LEVEL=${LOG_LEVEL:-error} \
  --env=VECTOR_NODE_URL=http://node:8000 \
  --env=VECTOR_ROGER_URL=http://roger:8000 \
  --env=VECTOR_ROUTER_URL=http://router:8000 \
  --env=VECTOR_TESTER_NAME=$tester_name \
  --name=$tester_name \
  --network=$project \
  --rm \
  --tmpfs /tmp"

# prod version: if we're on a tagged commit then use the tagged semvar, otherwise use the hash
if [[ "$VECTOR_PROD" == "true" ]]
then
  git_tag="$(git tag --points-at HEAD | grep "vector-" | head -n 1)"
  if [[ -z "$version" ]]
  then
    if [[ -n "$git_tag" ]]
    then version="${git_tag#vector-}"
    else version="$(git rev-parse HEAD | head -c 8)"
    fi
  fi
  image=${project}_test_runner:$version
  echo "Executing $cmd w image $image"
  docker run "$common" "$image" "$cmd" "$stack"

else
  echo "Executing $cmd w image ${project}_builder"
  docker run \
    "$common" \
    --entrypoint=bash \
    --volume="$root:/root" \
    "${project}_builder" -c "bash modules/test-runner/ops/entry.sh $cmd $stack"
fi
