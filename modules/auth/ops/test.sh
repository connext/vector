#!/bin/bash

if [[ -d "modules/server-node" ]]
then cd modules/server-node
fi

cmd="${1:-test}"

if [[ "$NODE_ENV" == "production" ]]
then opts="--forbid-only"
else opts="--bail"
fi

if [[ "$cmd" == "watch" ]]
then
  echo "Starting node watcher"

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

      sleep 2
      echo "Re-running tests..."
      checksum="`find src -type f -not -name "*.swp" -exec sha256sum {} \; | sha256sum`"
      ts-mocha --bail --check-leaks --exit --timeout 60000 'src/**/*.spec.ts' &
      prev_checksum=$checksum

    # If no changes, do nothing
    else sleep 2
    fi
  done

else

  echo "Starting server-node tester"
  exec ts-mocha $opts --bail --check-leaks --exit --timeout 60000 'src/**/*.spec.ts'
fi
