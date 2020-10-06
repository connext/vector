#!/bin/bash
set -e

if [[ -d "modules/auth" ]]
then cd modules/auth
fi

if [[ -z "$VECTOR_NATS_JWT_SIGNER_PUBLIC_KEY" && -n "$VECTOR_NATS_JWT_SIGNER_PUBLIC_KEY_FILE" ]]
then
  echo "Loading public key from file: $VECTOR_NATS_JWT_SIGNER_PUBLIC_KEY_FILE"
  export VECTOR_NATS_JWT_SIGNER_PUBLIC_KEY="`cat $VECTOR_NATS_JWT_SIGNER_PUBLIC_KEY_FILE`"
elif [[ -n "$VECTOR_NATS_JWT_SIGNER_PUBLIC_KEY" && -z "$VECTOR_NATS_JWT_SIGNER_PUBLIC_KEY_FILE" ]]
then
  echo "Using public key provided by env var"
else
  echo "public key must be provided via either a secret or an env var. Not both, not neither."
  exit 1
fi

if [[ -z "$VECTOR_NATS_JWT_SIGNER_PRIVATE_KEY" && -n "$VECTOR_NATS_JWT_SIGNER_PRIVATE_KEY_FILE" ]]
then
  echo "Loading private key from file: $VECTOR_NATS_JWT_SIGNER_PRIVATE_KEY_FILE"
  export VECTOR_NATS_JWT_SIGNER_PRIVATE_KEY="`cat $VECTOR_NATS_JWT_SIGNER_PRIVATE_KEY_FILE`"
elif [[ -n "$VECTOR_NATS_JWT_SIGNER_PRIVATE_KEY" && -z "$VECTOR_NATS_JWT_SIGNER_PRIVATE_KEY_FILE" ]]
then
  echo "Using private key provided by env var"
else
  echo "Private key must be provided via either a secret or an env var. Not both, not neither."
  exit 1
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
  export NODE_ENV=production
  exec node --no-deprecation dist/bundle.js
fi

