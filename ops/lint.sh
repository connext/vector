#!/usr/bin/env bash
set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
eslint="$root/node_modules/.bin/eslint"

for package in `ls modules`
do
  echo "Linting ${package}"
  cd "${root}/modules/${package}"
  $eslint src/**/*.ts
  cd "${root}"
done
