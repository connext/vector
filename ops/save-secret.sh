#!/bin/bash
set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"

secret_name="${1:-${project}_mnemonic}";
secret_value="$2"

# NOTE: any newlines or carriage returns will be stripped out of the secret value

if [[ -n "`docker secret ls | grep "$secret_name\>"`" ]]
then
  echo "A secret called $secret_name already exists, skipping secret setup."
  echo "To overwrite this secret, remove the existing one first: 'docker secret rm $secret_name'"
else

  if [[ -z "$secret_value" ]]
  then
    # Prepare to load the node's private key into the server's secret store
    echo "Copy the $secret_name secret to your clipboard then paste it below & hit enter (no echo)"
    echo -n "> "
    read -s secret_value
    echo
    if [[ -z "$secret_value" ]]
    then echo "No secret_value provided, skipping secret creation" && exit 0;
    fi
  fi

  id="`echo $secret_value | tr -d '\n\r' | docker secret create $secret_name -`"
  if [[ "$?" == "0" ]]
  then echo "Successfully saved secret $secret_name w id $id"
  else echo "Something went wrong creating a secret called $secret_name"
  fi

fi
