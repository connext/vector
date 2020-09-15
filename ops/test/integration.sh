#!/usr/bin/env bash
set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/../.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"

# make sure a network for this project has been created
docker swarm init 2> /dev/null || true
docker network create --attachable --driver overlay $project 2> /dev/null || true

version="$1"
cmd="${2:-test}"

# If file descriptors 0-2 exist, then we're prob running via interactive shell instead of on CD/CI
if [[ -t 0 && -t 1 && -t 2 ]]
then interactive="--interactive --tty"
else echo "Running in non-interactive mode"
fi

source $root/dev.env

########################################
## Retrieve testnet env vars

chain_id_1=1337; chain_id_2=1338

providers_file="$root/.chaindata/providers/${chain_id_1}-${chain_id_2}.json"
addresses_file="$root/.chaindata/addresses/${chain_id_1}-${chain_id_2}.json"
if [[ ! -f "$providers_file" ]]
then echo "File ${providers_file} does not exist, make sure the testnet chains are running" && exit 1
elif [[ ! -f "$addresses_file" ]]
then echo "File ${addresses_file} does not exist, make sure the testnet chains are running" && exit 1
fi
chain_providers="`cat $providers_file`"
contract_addresses="`cat $addresses_file | jq . -c`"

########################################
## Launch test runner

common="$interactive \
  --env=INDRA_ADMIN_TOKEN=$INDRA_ADMIN_TOKEN \
  --env=INDRA_CHAIN_PROVIDERS=$chain_providers \
  --env=INDRA_TEST_LOG_LEVEL=${TEST_LOG_LEVEL:-$LOG_LEVEL} \
  --env=INDRA_CLIENT_LOG_LEVEL=${CLIENT_LOG_LEVEL:-$LOG_LEVEL} \
  --env=INDRA_CONTRACT_ADDRESSES=$contract_addresses \
  --env=INDRA_NATS_URL=nats://proxy:4222 \
  --env=INDRA_NODE_URL=http://proxy:80 \
  --env=NODE_TLS_REJECT_UNAUTHORIZED=0 \
  --name=${project}_test_runner \
  --network=$project \
  --rm \
  --tmpfs /tmpfs"

# prod version: if we're on a tagged commit then use the tagged semvar, otherwise use the hash
if [[ "$INDRA_ENV" == "prod" ]]
then
  git_tag="`git tag --points-at HEAD | grep "indra-" | head -n 1`"
  if [[ -z "$version" ]]
  then
    if [[ -n "$git_tag" ]]
    then version="`echo $git_tag | sed 's/indra-//'`"
    else version="`git rev-parse HEAD | head -c 8`"
    fi
  fi
  image=${project}_test_runner:$version
  echo "Executing $cmd w image $image"
  exec docker run --env=NODE_ENV=production $common $image $cmd

else
  echo "Executing $cmd w image ${project}_builder"
  exec docker run \
    $common \
    --entrypoint=bash \
    --volume="$root:/root" \
    ${project}_builder -c "cd modules/test-runner && bash ops/entry.sh $cmd"
fi
