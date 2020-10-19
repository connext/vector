#!/bin/bash
set -e

this_user="$(id -u):$(id -g)"
user="$1"
cmd="$2"

finish() {
    if [[ "$this_user" == "$user" ]]
    then echo "Same user, skipping permission fix"
    else
      echo "Fixing permissions for $user"
      find . -not -name "*.swp" -user "$(id -u)" -exec chown -R "$user" {} \;
    fi
}
trap finish EXIT

echo "Running command as $this_user (target user: $user)"
bash -c "$cmd"
