#!/bin/bash

if [[ -d "modules/contracts" ]]
then cd modules/contracts
fi

cmd="${1:-test}"

if [[ "$NODE_ENV" == "production" ]]
then opts="--forbid-only"
else opts="--bail"
fi

if [[ "${cmd##*-}" == "test" ]]
then
  echo "Starting contracts tester"
  exec npx buidler test

elif [[ "${cmd##*-}" == "watch" ]]
then
  echo "Starting contracts watcher"

  prev_checksum=""
  while true
  do
    checksum="`find contracts src -type f -not -name "*.swp" -exec sha256sum {} \; | sha256sum`"
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
      checksum="`find contracts src -type f -not -name "*.swp" -exec sha256sum {} \; | sha256sum`"
      npx buidler test
      prev_checksum=$checksum

    # If no changes, do nothing
    else sleep 2
    fi
  done
else
  echo "idk what to do with commend $cmd"
fi
