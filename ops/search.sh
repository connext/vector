#!/bin/bash

target="$1";
shift;

if [[ -z "$target" ]]
then echo "One arg required: bash ops/search.sh <target>" && exit 1
fi

grep "$@" --exclude=*.swp --exclude=*.pdf --color=auto -r "$target" \
  Makefile \
  .github/workflows/* \
  ops \
  docs \
  modules/*/src.ts \
  modules/*/src.sol \
  modules/*/ops \
  modules/*/src \
  modules/*/test
