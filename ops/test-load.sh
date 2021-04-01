#!/usr/bin/env bash
set -e

root=$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )
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


####################
## Load Config

if [[ ! -f "$root/node.config.json" ]]
then cp "$root/ops/config/node.default.json" "$root/node.config.json"
fi
if [[ ! -f "$root/router.config.json" ]]
then cp "$root/ops/config/router.default.json" "$root/router.config.json"
fi

config=$(
  cat "$root/node.config.json" "$root/router.config.json" \
  | jq -s '.[0] + .[1] + .[2] + .[3]'
)

function getConfig {
  value=$(echo "$config" | jq ".$1" | tr -d '"')
  if [[ "$value" == "null" ]]
  then echo ""
  else echo "$value"
  fi
}

production=$(getConfig production)
chain_addresses=$(echo "$config" | jq '.chainAddresses' | tr -d '\n\r ')
chain_providers=$(echo "$config" | jq '.chainProviders' | tr -d '\n\r ')

#################
## Start Deps

# Start trio
bash "$root/ops/start-trio.sh"

########################################
## Launch test runner

tester_name=${project}_load_test_runner
common=(
  ${interactive[@]}
  "--env=NODE_TLS_REJECT_UNAUTHORIZED=0"
  "--env=VECTOR_ADMIN_TOKEN=$VECTOR_ADMIN_TOKEN"
  "--env=VECTOR_CAROL_URL=http://carol:8000"
  "--env=VECTOR_CHAIN_ADDRESSES=$chain_addresses"
  "--env=VECTOR_CHAIN_PROVIDERS=$chain_providers"
  "--env=VECTOR_DAVE_URL=http://dave:8000"
  "--env=VECTOR_LOG_LEVEL=${LOG_LEVEL:-error}"
  "--env=VECTOR_MESSAGING_URL=http://messaging"
  "--env=VECTOR_ROGER_URL=http://roger:8000"
  "--env=VECTOR_ROUTER_URL=http://router:8000"
  "--env=VECTOR_NUM_AGENTS=${num_agents}"
  "--env=VECTOR_PROD=${production}"
  "--env=VECTOR_TESTER_NAME=$tester_name"
  "--name=$tester_name"
  "--network=$project"
  "--rm"
  "--tmpfs=/tmp"
)

if [[ "$production" == "true" ]]
then
  # If we're on the prod branch then use the release semvar, otherwise use the commit hash
  if [[ "$(git rev-parse --abbrev-ref HEAD)" == "prod" || "${GITHUB_REF##*/}" == "prod" ]]
  then version=$(grep -m 1 '"version":' package.json | cut -d '"' -f 4)
  else version=$(git rev-parse HEAD | head -c 8)
  fi
  image=${project}_test_runner:$version
  echo "Executing $test_cmd w image $image"
  docker run "${common[@]}" "$image" "$test_cmd"

else
  echo "Executing $test_cmd w image ${project}_builder"
  docker run \
    "${common[@]}" \
    --entrypoint=bash \
    --volume="$root:/app" \
    "${project}_builder" -c "cd modules/test-runner && $test_cmd"
fi
