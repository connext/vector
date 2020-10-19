#!/bin/bash
set -e

if [[ -d "modules/auth" ]]
then cd modules/auth || exit 1
fi

########################################
# Convert secrets to env vars

if [[ -n "$VECTOR_JWT_SIGNER_PUBLIC_KEY" ]]
then echo "Using public key provided by env var"
elif [[ -n "$VECTOR_JWT_SIGNER_PUBLIC_KEY_FILE" ]]
then VECTOR_JWT_SIGNER_PUBLIC_KEY="$(cat "$VECTOR_JWT_SIGNER_PUBLIC_KEY_FILE")"
else echo "public key must be provided via either a secret or an env var." && exit 1
fi

if [[ -n "$VECTOR_JWT_SIGNER_PRIVATE_KEY" ]]
then echo "Using private key provided by env var"
elif [[ -n "$VECTOR_JWT_SIGNER_PRIVATE_KEY_FILE" ]]
then VECTOR_JWT_SIGNER_PRIVATE_KEY="$(cat "$VECTOR_JWT_SIGNER_PRIVATE_KEY_FILE")"
else echo "private key must be provided via either a secret or an env var." && exit 1
fi

# Ensure keys have proper newlines inserted (bc newlines are stripped from env vars)
VECTOR_JWT_SIGNER_PRIVATE_KEY=$(
  echo "$VECTOR_JWT_SIGNER_PRIVATE_KEY" |\
    tr -d '\n\r' |\
    sed 's/-----BEGIN RSA PRIVATE KEY-----/\n-----BEGIN RSA PRIVATE KEY-----\n/' |\
    sed 's/-----END RSA PRIVATE KEY-----/\n-----END RSA PRIVATE KEY-----\n/'
)

VECTOR_JWT_SIGNER_PUBLIC_KEY=$(
  echo "$VECTOR_JWT_SIGNER_PUBLIC_KEY" |\
    tr -d '\n\r' |\
    sed 's/-----BEGIN PUBLIC KEY-----/\n-----BEGIN PUBLIC KEY-----\n/' | \
    sed 's/-----END PUBLIC KEY-----/\n-----END PUBLIC KEY-----\n/'
)

export VECTOR_JWT_SIGNER_PRIVATE_KEY
export VECTOR_JWT_SIGNER_PUBLIC_KEY

########################################
# Launch it

if [[ "$VECTOR_PROD" == "true" ]]
then
  echo "Starting node in prod-mode"
  export NODE_ENV=production
  exec node --no-deprecation dist/bundle.js

else
  echo "Starting node in dev-mode"
  exec nodemon \
    --delay 1 \
    --exitcrash \
    --ignore ./**/*.test.ts \
    --ignore ./**/*.spec.ts \
    --ignore ./**/*.swp \
    --legacy-watch \
    --polling-interval 1000 \
    --watch src \
    --exec ts-node \
    ./src/index.ts | pino-pretty
fi
