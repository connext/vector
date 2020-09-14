#!/bin/bash
set -e

if [[ -d "modules/isomorphic-node" ]]
then cd modules/isomorphic-node
fi

########################################
# Convert secrets to env vars

if [[ -z "$VECTOR_PG_PASSWORD" && -n "$VECTOR_PG_PASSWORD_FILE" ]]
then export VECTOR_PG_PASSWORD="`cat $VECTOR_PG_PASSWORD_FILE`"
fi

if [[ -z "$VECTOR_MNEMONIC" && -n "$VECTOR_MNEMONIC_FILE" ]]
then export VECTOR_MNEMONIC="`cat $VECTOR_MNEMONIC_FILE`"
fi

########################################
# Wait for indra stack dependencies

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

wait_for "database" "$VECTOR_PG_HOST:$VECTOR_PG_PORT"

########################################
# Launch Node

if [[ "$NODE_ENV" == "development" ]]
then
  echo "Starting indra node in dev-mode"
  exec ./node_modules/.bin/nodemon \
    --delay 1 \
    --exitcrash \
    --ignore *.test.ts \
    --ignore *.swp \
    --legacy-watch \
    --polling-interval 1000 \
    --watch src \
    --exec ts-node \
    ./src/main.ts
else
  echo "Starting indra node in prod-mode"
  exec node --no-deprecation dist/bundle.js
fi

