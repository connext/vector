#!/usr/bin/env bash

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
eslint="$root/node_modules/.bin/eslint -c $root/.eslintrc.js"
solhint="$root/node_modules/.bin/solhint -c $root/.solhint.json"

for package in `ls modules`
do
  echo "Linting ${package}"
  cd "${root}/modules/${package}"
  if [[ -d "src" ]]
  then
    eval "$eslint 'src' $@"
  elif [[ -d "src.ts" && -d "src.sol" ]]
  then
    eval "$eslint 'src.ts' $@"
    eval "$solhint 'src.sol/**/*.sol' $@"
  fi
  cd "${root}"
done

if [[ -z "$@" ]]
then echo "Protip: run 'bash ops/lint.sh --fix' to auto-fix simple formatting inconsistencies"
fi
