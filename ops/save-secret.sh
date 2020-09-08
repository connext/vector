#!/bin/bash
set -e

secret_name="${1:-indra_mnemonic}";
secret_value="$2"

if [[ -n "`docker secret ls | grep "$secret_name\>"`" ]]
then echo "A secret called $secret_name already exists, skipping secret setup"
else

  if [[ -z "$secret_value" ]]
  then

    # Prepare to load the node's private key into the server's secret store
    echo "Copy the $secret_name secret to your clipboard then paste it below & hit enter (no echo)"
    echo -n "> "
    read -s secret
    echo

    if [[ -z "$secret" ]]
    then echo "No secret provided, skipping secret creation" && exit 0;
    fi

  elif [[ "$secret_value" == "random" ]]
  then secret=`head -c 32 /dev/urandom | xxd -plain -c 32 | tr -d '\n\r'`
  else secret=$secret_value
  fi

  id="`echo $secret | tr -d '\n\r' | docker secret create $secret_name -`"
  if [[ "$?" == "0" ]]
  then
    echo "Successfully saved secret $secret_name w id $id"
    echo
  else echo "Something went wrong creating a secret called $secret_name"
  fi

fi
