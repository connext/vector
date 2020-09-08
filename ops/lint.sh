#!/usr/bin/env bash

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
eslint="$root/node_modules/.bin/eslint -c $root/.eslintrc.js"

for package in `ls modules`
do
  echo "Linting ${package}"
  cd "${root}/modules/${package}"
  eval "$eslint src/**/* $@"
  cd "${root}"
done

if [[ -z "$@" ]]
then echo "Protip: run 'bash ops/lint.sh --fix' to auto-fix simple formatting inconsistencies"
fi
