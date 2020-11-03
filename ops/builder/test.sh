#!/bin/bash

unit=$1
cmd="${2:-test}"

if [[ -d "modules/$unit" ]]
then cd "modules/$unit" || exit 1
fi

if [[ "$CI" == "true" ]]
then opts="--forbid-only"
else opts=""
fi

if [[ "${cmd##*-}" == "test" ]]
then
  set -o pipefail
  echo "Starting $unit tester"
  if [[ -n "$(which pino-pretty)" ]]
  then
    if [[ "$opts" == "" ]]
      then exec npm run test | pino-pretty --colorize
      else exec npm run test -- "$opts" | pino-pretty --colorize
    fi
  else 
    if [[ "$opts" == "" ]]
      then exec npm run test
      else exec npm run test -- "$opts"
    fi
  fi

elif [[ "${cmd##*-}" == "watch" ]]
then
  echo "Starting $unit watcher"

  src=()
  for dir in src src.ts src.sol
  do
    if [[ -d "$dir" ]]
    then src+=("$dir")
    fi
  done
  echo "Watching src folders: ${src[*]}"

  prev_checksum=""
  while true
  do
    checksum="$(find "${src[@]}" -type f -not -name "*.swp" -exec sha256sum {} \; | sha256sum)"
    if [[ "$checksum" != "$prev_checksum" ]]
    then
      echo
      echo "Changes detected!"

      mocha_pids="$(pgrep "mocha" | tr '\n\r' ' ')"
      if [[ -n "$mocha_pids" ]]
      then
        echo "Stopping all mocha processes w pids: $mocha_pids"
        for pid in $mocha_pids
        do kill "$pid" 2> /dev/null
        done
      fi

      sleep 2
      echo "Re-running tests..."

      prev_checksum="$(find "${src[@]}" -type f -not -name "*.swp" -exec sha256sum {} \; | sha256sum)"
      if [[ -n "$(which pino-pretty)" ]]
        if [[ "$opts" == "" ]]
        then (npm run test | pino-pretty --colorize &)
        else (npm run test -- "$opts" | pino-pretty --colorize &)
        fi
      then (npm run test -- "$opts" | pino-pretty --colorize &)
      else 
        if [[ "$opts" == "" ]]
        then (npm run test &)
        else (npm run test -- "$opts" &)
        fi
      fi

    # If no changes, do nothing
    else sleep 2
    fi
  done
else
  echo "idk what to do with commend $cmd"
fi
