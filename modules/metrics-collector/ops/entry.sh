#!/bin/bash
set -eE

if [[ -d "modules/metrics-collector" ]]
then cd modules/metrics-collector || exit 1
fi

########################################
# Launch it

if [[ "$VECTOR_PROD" == "true" ]]
then
  echo "Starting node in prod-mode"
  export NODE_ENV=production
  node --no-deprecation dist/bundle.js &

else
  echo "Starting node in dev-mode"
  nodemon \
    --delay 1 \
    --exitcrash \
    --ignore ./**/*.test.ts \
    --ignore ./**/*.spec.ts \
    --ignore ./**/*.swp \
    --legacy-watch \
    --polling-interval 1000 \
    --watch src \
    --exec ts-node \
    ./src/index.ts | pino-pretty &
fi

# Wait around & respond to signals
function goodbye {
  echo "Received kill signal, goodbye"
  exit
}
trap goodbye SIGTERM SIGINT
wait
