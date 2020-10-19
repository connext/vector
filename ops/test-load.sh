#!/usr/bin/env bash
set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project=$(grep -m 1 '"name":' "$root/package.json" | cut -d '"' -f 4)

# make sure a network for this project has been created
docker swarm init 2> /dev/null || true
docker network create --attachable --driver overlay "$project" 2> /dev/null || true

test_type="${1:-cyclical}"
num_agents="${2:-5}"

if [[ "$test_type" == "cyclical" ]]
then
  test_cmd="npm run load-test-cyclical"
elif [[ "$test_type" == "concurrency" ]]
then
  test_cmd="npm run load-test-concurrency"
else
  echo "Unknown test type!"
  exit 1
fi
echo "Running $test_type test with $num_agents agents"

# If file descriptors 0-2 exist, then we're prob running via interactive shell instead of on CD/CI
if [[ -t 0 && -t 1 && -t 2 ]]
then interactive=(--interactive --tty)
else echo "Running in non-interactive mode"
fi

########################################
## Launch test runner

common=(
  ${interactive[@]}
  "--env=NODE_TLS_REJECT_UNAUTHORIZED=0"
  "--env=VECTOR_ADMIN_TOKEN=$VECTOR_ADMIN_TOKEN"
  "--env=VECTOR_AUTH_URL=http://auth:5040"
  "--env=VECTOR_CAROL_URL=http://carol:8000"
  "--env=VECTOR_CHAIN_ADDRESSES=$(tr -d ' \n' < "$root/.chaindata/chain-addresses.json")"
  "--env=VECTOR_CHAIN_PROVIDERS=$(tr -d ' \n' < "$root/.chaindata/chain-providers.json")"
  "--env=VECTOR_DAVE_URL=http://dave:8000"
  "--env=VECTOR_LOG_LEVEL=${LOG_LEVEL:-error}"
  "--env=VECTOR_NATS_URL=nats://nats:4222"
  "--env=VECTOR_NUM_AGENTS=${num_agents}"
  "--env=VECTOR_PROD=${VECTOR_PROD}"
  "--env=VECTOR_ROGER_URL=http://roger:8000"
  "--env=VECTOR_ROUTER_URL=http://router:8009"
  "--name=${project}_load_test_runner"
  "--network=$project"
  "--rm"
  "--tmpfs=/tmp"
)

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
  echo "Executing $test_cmd w image $image"
  docker run "${common[@]}" "$image" "$test_cmd"

else
  echo "Executing $test_cmd w image ${project}_builder"
  docker run \
    "${common[@]}" \
    --entrypoint=bash \
    --volume="$root:/root" \
    "${project}_builder" -c "cd modules/test-runner && $test_cmd"
fi
