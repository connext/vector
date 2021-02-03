#!/bin/bash
set -eE

if [[ -d "modules/metrics-collector" ]]
then cd modules/metrics-collector || exit 1
fi

# Launch tests
nyc ts-mocha --bail --check-leaks --exit --timeout 60000 'src/**/*.spec.ts' "$@"
