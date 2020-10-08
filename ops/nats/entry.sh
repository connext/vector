#!/bin/bash
set -e

if [[ -n "$JWT_SIGNER_PUBLIC_KEY" ]]
then echo "Using public key provided by env var"
elif [[ -n "$JWT_SIGNER_PUBLIC_KEY_FILE" ]]
then export JWT_SIGNER_PUBLIC_KEY_FILE="`cat $JWT_SIGNER_PUBLIC_KEY_FILE`"
else echo "public key must be provided via either a secret or an env var." && exit 1
fi

exec /bin/nats-server -D -V
