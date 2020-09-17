#!/bin/bash
set -e

if [[ -d "modules/auth" ]]
then cd modules/auth
fi

node_bin="`pwd`/node_modules/.bin"
nodemon="$node_bin/nodemon"
pino="$node_bin/pino-pretty"

if [[ "$VECTOR_ENV" == "dev" ]]
then
  echo "Starting node in dev-mode"
  exec $nodemon \
    --delay 1 \
    --exitcrash \
    --ignore *.test.ts \
    --ignore *.spec.ts \
    --ignore *.swp \
    --legacy-watch \
    --polling-interval 1000 \
    --watch src \
    --exec ts-node \
    ./src/index.ts | $pino

else
  echo "Starting node in prod-mode"
  exec node --no-deprecation dist/bundle.js
fi

