#!/bin/bash
set -e

if [[ -d "modules/server-node" ]]
then cd modules/server-node
fi

########################################
# Convert secrets to env vars

if [[ -z "$VECTOR_PG_PASSWORD" && -n "$VECTOR_PG_PASSWORD_FILE" ]]
then export VECTOR_PG_PASSWORD="`cat $VECTOR_PG_PASSWORD_FILE`"
fi

if [[ -z "$VECTOR_MNEMONIC" && -n "$VECTOR_MNEMONIC_FILE" ]]
then export VECTOR_MNEMONIC="`cat $VECTOR_MNEMONIC_FILE`"
fi

# TODO: if no *_PG_* env vars provided, spin up an sqlite instance locally & use that?

export VECTOR_DATABASE_URL="postgresql://$VECTOR_PG_USERNAME:$VECTOR_PG_PASSWORD@${VECTOR_PG_HOST}:$VECTOR_PG_PORT/$VECTOR_PG_DATABASE"

# Wait for db to wake up
wait-for -t 60 "$VECTOR_PG_HOST:$VECTOR_PG_PORT" > /dev/null

########################################
# Launch Node

if [[ "$VECTOR_ENV" == "prod" ]]
then

  # TODO: do we really want to do this in prod?
  echo "Running database migrations"
  ./node_modules/.bin/prisma migrate up --experimental &

  echo "Starting node in prod-mode"
  export NODE_ENV=production
  exec node --no-deprecation dist/bundle.js

else

  # TODO: how do we expose prisma studio on all interfaces (ie 0.0.0.0) instead of just localhost?
  echo "Starting prisma studio in the background"
  ./node_modules/.bin/prisma studio --experimental &
  sleep 3 # give prisma a sec to start up & log it's endpoint

  echo "Running database migrations"
  ./node_modules/.bin/prisma migrate up --experimental &

  echo "Starting node in dev-mode"
  exec  ./node_modules/.bin/nodemon \
    --delay 1 \
    --exitcrash \
    --ignore *.test.ts \
    --ignore *.spec.ts \
    --ignore *.swp \
    --legacy-watch \
    --polling-interval 1000 \
    --watch src \
    --exec ts-node \
    ./src/index.ts \
    | ./node_modules/.bin/pino-pretty

fi
