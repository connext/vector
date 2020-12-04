#!/bin/bash
set -e

if [[ -d "modules/router" ]]
then cd modules/router || exit 1
fi

########################################
# Convert secrets to env vars

if [[ -z "$VECTOR_PG_PASSWORD" && -n "$VECTOR_PG_PASSWORD_FILE" ]]
then
  VECTOR_PG_PASSWORD="$(cat "$VECTOR_PG_PASSWORD_FILE")"
  export VECTOR_PG_PASSWORD
fi


########################################
# Config database url

if [[ -n $VECTOR_DATABASE_URL ]]
then
  echo "Using provided database url env var"
  if [[ "$VECTOR_DATABASE_URL" == sqlite://* ]]
  then touch "${VECTOR_DATABASE_URL#sqlite://}"
  fi

elif [[ -n $VECTOR_PG_HOST ]]
then
  echo "Using configured Postgres store at $VECTOR_PG_HOST"
  export VECTOR_DATABASE_URL="postgresql://$VECTOR_PG_USERNAME:$VECTOR_PG_PASSWORD@${VECTOR_PG_HOST}:$VECTOR_PG_PORT/$VECTOR_PG_DATABASE"

else
  sqlite_file=${VECTOR_SQLITE_FILE:-/tmp/store.sqlite}
  echo "Using SQLite store at $sqlite_file"
  touch "$sqlite_file"
  export VECTOR_DATABASE_URL="sqlite://$sqlite_file"
fi
echo "VECTOR_DATABASE_URL: $VECTOR_DATABASE_URL"

########################################
# Wait for dependencies to wake up

db="$VECTOR_PG_HOST:$VECTOR_PG_PORT"
echo "Waiting for database at $db"
wait-for -q -t 60 "$db" 2>&1 | sed '/nc: bad address/d'

echo "Pinging node at $VECTOR_NODE_URL"
while [[ -z "$(curl -k -m 5 -s "$VECTOR_NODE_URL/ping" || true)" ]]
do sleep 1
done

########################################
# Launch it

if [[ "$VECTOR_PROD" == "true" ]]
then
  echo "Starting router in prod-mode"
  export NODE_ENV=production
  node --no-deprecation dist/bundle.js | pino-pretty &

else
  echo "Starting router in dev-mode"
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
