#!/bin/bash
set -e -o pipefail

HOST="$1"
SSH_KEY="$2"
CMD="$3"

SSH_DIR="$HOME/.ssh"
KEY_FILE="$SSH_DIR/id_rsa"
KEY_FOOTER='-----END RSA PRIVATE KEY-----'
KEY_HEADER='-----BEGIN RSA PRIVATE KEY-----'

echo "ssh-action activated!"
echo "Executing command \"$CMD\" on host $HOST"

mkdir -p "$SSH_DIR"
rm -f "$KEY_FILE" "$SSH_DIR/known_hosts"
touch "$KEY_FILE" "$SSH_DIR/known_hosts"

# Env vars strip out newlines so a naively loaded ssh key will be improperly formatted
# Replace any existing header/footers with manually added ones that include proper newlines
{
  echo "$KEY_HEADER"
  echo "$SSH_KEY" | sed "s/$KEY_HEADER//" | sed "s/$KEY_FOOTER//" | tr -d '\n '
  echo
  echo "$KEY_FOOTER"
} >> "$KEY_FILE"
chmod 400 "$KEY_FILE"

# Manually substitute env var values into CMD
# derived from https://stackoverflow.com/a/39530053
subbed_cmd=$CMD
oldIFS=$IFS
unset IFS
for var in $(compgen -e); do
  if [[ "$var" == *"|"* || "${!var}" == *"|"* ]]
  then
    echo "Warning, env var $var contains a | character, skipping"
    continue
  fi
  if [[ "$subbed_cmd" == *"$var"* ]]
  then
    echo "subbing env var: ${var}=${!var}"
    subbed_cmd=${subbed_cmd//\$$var/${!var}}
  fi
done
IFS=$oldIFS

echo "Loaded ssh key with fingerprint:"
ssh-keygen -lf "$KEY_FILE"

echo "Running subbed command: $subbed_cmd"

exec ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "$HOST" "bash -s" <<EOF
  set -e;
  # Run CMD in an up-to-date repo
  git clone https://github.com/connext/vector.git || true;
  cd vector;
  git fetch --all --prune --tags;
  $subbed_cmd
  exit;
EOF
