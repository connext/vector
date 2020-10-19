#!/bin/bash
set -e

root=$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )
project=$(grep -m 1 '"name":' "$root/package.json" | cut -d '"' -f 4)

docker swarm init 2> /dev/null || true

secret_name="${1:-${project}_mnemonic}";
secret_value="$2"

# NOTE: any newlines or carriage returns will be stripped out of the secret value

if grep -qs "$secret_name\>" <<<"$(docker secret ls)"
then
  echo "A secret called $secret_name already exists, skipping secret setup."
  echo "To overwrite this secret, remove the existing one first: 'docker secret rm $secret_name'"
else

  if [[ -z "$secret_value" ]]
  then
    # Prepare to load the node's private key into the server's secret store
    echo "Copy the $secret_name secret to your clipboard then paste it below & hit enter (no echo)"
    echo -n "> "
    read -rs secret_value
    echo
    if [[ -z "$secret_value" ]]
    then echo "No secret_value provided, skipping secret creation" && exit 0;
    fi
  fi

  if echo "$secret_value" | tr -d '\n\r' | docker secret create "$secret_name" -
  then echo "Successfully saved secret $secret_name"
  else echo "Something went wrong creating a secret called $secret_name"
  fi

fi
