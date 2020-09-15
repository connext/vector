#!/bin/bash

unit=$1
cmd="${2:-test}"

if [[ -d "modules/$unit" ]]
then cd "modules/$unit"
fi

test_cmd="`cat package.json | jq '.scripts.test' | tr -d '\n\r"' | cut -d " " -f 1`"

if [[ "$test_cmd" == *mocha* ]]
then
  if [[ "$NODE_ENV" == prod* ]]
  then opts="--forbid-only"
  else opts="--bail"
  fi
fi

if [[ "${cmd##*-}" == "test" ]]
then
  echo "Starting $unit tester"
  exec npm run test -- $opts

elif [[ "${cmd##*-}" == "watch" ]]
then
  echo "Starting $unit watcher"

  src=""
  for dir in src src.ts src.sol
  do
    if [[ -d "$dir" ]]
    then src+="$dir "
    fi
  done
  echo "Watching src folders: $src"

  prev_checksum=""
  while true
  do
    checksum="`find $src -type f -not -name "*.swp" -exec sha256sum {} \; | sha256sum`"
    if [[ "$checksum" != "$prev_checksum" ]]
    then
      echo
      echo "Changes detected!"

      test_pids="`ps | grep "$test_cmd" | grep -v "grep" | awk '{print $1}' | tr '\n\r' ' '`"
      if [[ -n "$test_pids" ]]
      then
        echo "Stopping all ${test_cmd} processes w pids: ${test_pids}"
        for pid in $test_pids
        do kill $pid 2> /dev/null
        done
      fi

      sleep 2
      echo "Re-running tests..."
      checksum="`find $src -type f -not -name "*.swp" -exec sha256sum {} \; | sha256sum`"
      npm run test -- $opts &
      prev_checksum=$checksum

    # If no changes, do nothing
    else sleep 2
    fi
  done
else
  echo "idk what to do with commend $cmd"
fi
