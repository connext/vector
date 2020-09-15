#!/bin/bash
set -e

if [[ -d "modules/auth" ]]
then cd modules/auth
fi

########################################
# Launch Auth

if [[ "$NODE_ENV" == "development" ]]
then
  echo "Starting node in dev-mode"
  exec ./node_modules/.bin/nodemon \
    --delay 1 \
    --exitcrash \
    --ignore *.test.ts \
    --ignore *.spec.ts \
    --ignore *.swp \
    --legacy-watch \
    --polling-interval 1000 \
    --watch src \
    --exec ts-node \
    ./src/index.ts | ./node_modules/.bin/pino-pretty
else
  echo "Starting node in prod-mode"
  exec node --no-deprecation dist/bundle.js
fi

