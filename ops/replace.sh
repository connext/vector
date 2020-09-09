#!/bin/bash

old="$1"
new="$2"

if [[ -z "$old" || -z "$new" ]]
then echo "Exactly two args required: bash ops/replace.sh <replace_this> <with_this>" && exit 1
fi

echo "Before:"
bash ops/search.sh "$old"
echo
echo "After:"
bash ops/search.sh "$old" | sed "s|$old|$new|g" | grep --color=always "$new"
echo
echo "Does the above replacement look good? (y/n)"
echo -n "> "
read response
echo

if [[ "$response" == "y" ]]
then

  find \
    .github/workflows/*
    Makefile \
    modules/*/contracts \
    modules/*/src \
    modules/*/ops \
    ops \
    -type f -not -name "*.swp" -exec sed -i "s|$old|$new|g" {} \;

else echo "Goodbye"
fi
