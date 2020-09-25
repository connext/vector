#!/bin/bash

target="$1";
shift;

if [[ -z "$target" ]]
then echo "One arg required: bash ops/search.sh <target>" && exit 1
fi

grep "$@" --exclude=*.swp --exclude=*.pdf --color=auto -r "$target" \
  .github/workflows/* \
  Makefile \
  modules/*/migrations \
  modules/*/ops \
  modules/*/package.json \
  modules/*/README.md \
  modules/*/src \
  modules/*/src.sol \
  modules/*/src.ts \
  modules/server-node/schema.prisma \
  ops \
  package.json
