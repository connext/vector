#!/bin/bash

if [[ -d "modules/test-runner" ]]
then cd modules/test-runner
fi

cmd="${1:-test}"

# Set defaults in src/util/env instead of here
export VECTOR_ADMIN_TOKEN="$VECTOR_ADMIN_TOKEN"
export VECTOR_CHAIN_PROVIDERS="$VECTOR_CHAIN_PROVIDERS"
export VECTOR_CLIENT_LOG_LEVEL="$VECTOR_CLIENT_LOG_LEVEL"
export VECTOR_LOG_LEVEL="$VECTOR_LOG_LEVEL"
export VECTOR_CONTRACT_ADDRESSES="$VECTOR_CONTRACT_ADDRESSES"
export VECTOR_NATS_URL="$VECTOR_NATS_URL"
export VECTOR_NODE_URL="$VECTOR_NODE_URL"

export NODE_ENV="${NODE_ENV:-development}"

########################################
# Wait for dependencies to wake up

function wait_for {
  name=$1
  target=$2
  tmp=${target#*://} # remove protocol
  host=${tmp%%/*} # remove path if present
  if [[ ! "$host" =~ .*:[0-9]{1,5} ]] # no port provided
  then
    echo "$host has no port, trying to add one.."
    if [[ "${target%://*}" == "http" ]]
    then host="$host:80"
    elif [[ "${target%://*}" == "https" ]]
    then host="$host:443"
    else echo "Error: missing port for host $host derived from target $target" && exit 1
    fi
  fi
  echo "Waiting for $name at $target ($host) to wake up..."
  wait-for -t 60 $host 2> /dev/null
}

wait_for "node" "$VECTOR_NODE_URL"
wait_for "nats" "$VECTOR_NATS_URL"

########################################
# Launch tests

bundle=dist/tests.bundle.js

if [[ "$NODE_ENV" == "production" ]]
then opts="--forbid-only"
else opts="--bail"
fi

if [[ "$cmd" == "watch" ]]
then
  echo "Starting test-watcher"

  prev_checksum=""
  while true
  do
    checksum="`find src -type f -not -name "*.swp" -exec sha256sum {} \; | sha256sum`"
    if [[ "$checksum" != "$prev_checksum" ]]
    then
      echo
      echo "Changes detected!"

      mocha_pids="`ps | grep [m]ocha | awk '{print $1}'`"
      if [[ -n "$mocha_pids" ]]
      then
        echo "Stopping previous test run.."
        for pid in $mocha_pids
        do kill $pid 2> /dev/null
        done
      fi

      echo "Re-running tests..."
      ts-mocha $opts --slow 1000 --timeout 180000 --check-leaks --exit src/index.ts &
      prev_checksum=$checksum

    # If no changes, do nothing
    else sleep 2
    fi
  done

else

  if [[ ! -f "$bundle" ]]
  then webpack --config ops/webpack.config.js
  fi

  echo "Starting test-runner"
  mocha $opts --slow 1000 --timeout 180000 --check-leaks --exit $bundle
fi
