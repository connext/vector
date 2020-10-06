#!/bin/bash
set -e

if [[ -z "$VECTOR_NATS_JWT_SIGNER_PUBLIC_KEY" && -n "$VECTOR_NATS_JWT_SIGNER_PUBLIC_KEY_FILE" ]]
then
  echo "Loading key from file: $VECTOR_NATS_JWT_SIGNER_PUBLIC_KEY_FILE"
  export VECTOR_NATS_JWT_SIGNER_PUBLIC_KEY="`cat $VECTOR_NATS_JWT_SIGNER_PUBLIC_KEY_FILE`"
else
  echo "Using key provided by env var"
fi

exec /bin/nats-server -D -V
