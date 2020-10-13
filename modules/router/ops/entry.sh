#!/bin/bash
set -e

if [[ -d "modules/router" ]]
then cd modules/router
fi

########################################
# Convert secrets to env vars

if [[ -z "$VECTOR_PG_PASSWORD" && -n "$VECTOR_PG_PASSWORD_FILE" ]]
then export VECTOR_PG_PASSWORD="`cat $VECTOR_PG_PASSWORD_FILE`"
fi

export VECTOR_DATABASE_URL="postgresql://$VECTOR_PG_USERNAME:$VECTOR_PG_PASSWORD@${VECTOR_PG_HOST}:$VECTOR_PG_PORT/$VECTOR_PG_DATABASE"

########################################
# Wait for dependencies to wake up

db="$VECTOR_PG_HOST:$VECTOR_PG_PORT"
echo "Waiting for database at $db"
wait-for -t 60 $db 2> /dev/null

echo "Pinging node at $VECTOR_NODE_URL"
while [[ -z "`curl -k -m 5 -s $VECTOR_NODE_URL/ping || true`" ]]
do sleep 1
done

########################################
# Launch it

export PATH="./node_modules/.bin:${PATH}"

if [[ "$VECTOR_ENV" == "prod" ]]
then
  echo "Starting router in prod-mode"
  export NODE_ENV=production
  exec node --no-deprecation dist/bundle.js | pino-pretty

else
  echo "Starting router in dev-mode"
  exec  nodemon \
    --delay 1 \
    --exitcrash \
    --ignore *.test.ts \
    --ignore *.spec.ts \
    --ignore *.swp \
    --legacy-watch \
    --polling-interval 1000 \
    --watch src \
    --exec ts-node \
    ./src/index.ts | pino-pretty
fi
