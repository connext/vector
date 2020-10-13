#!/bin/bash
set -e

if [[ -n "$JWT_SIGNER_PUBLIC_KEY" ]]
then echo "Using public key provided by env var"
elif [[ -n "$JWT_SIGNER_PUBLIC_KEY_FILE" ]]
then export JWT_SIGNER_PUBLIC_KEY="`cat $JWT_SIGNER_PUBLIC_KEY_FILE`"
else echo "public key must be provided via either a secret or an env var." && exit 1
fi

# Ensure keys have proper newlines inserted (bc newlines are stripped from env vars)
export JWT_SIGNER_PUBLIC_KEY=`
  echo $JWT_SIGNER_PUBLIC_KEY | tr -d '\n\r' |\
  sed 's/-----BEGIN PUBLIC KEY-----/\n-----BEGIN PUBLIC KEY-----\n/' |\
  sed 's/-----END PUBLIC KEY-----/\n-----END PUBLIC KEY-----\n/'`

echo "JWT_SIGNER_PUBLIC_KEY:"
echo "$JWT_SIGNER_PUBLIC_KEY"

exec /bin/nats-server -D -V
