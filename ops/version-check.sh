#!/usr/bin/env bash
set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"

# Packages that we should never report as being out-of-date:
# - We don't want contract addresses to change so no more solidity-related upgrades
# - Newest react-scripts version breaks daicard, don't use it
do_not_upgrade='solc @openzeppelin/contracts react-scripts @connext/'

# Format string describing how each line looks
format='{printf("| %-32s|%8s  ->  %-8s|\n", $1, $3, $4)}'

# Create the sed command to remove any ignored rows.
# the first non-default delimiter needs to be \escaped if it's the first char
filter_cmd=""
for ignored in $do_not_upgrade
do filter_cmd="$filter_cmd\| $ignored|d;"
done

echo "===== Package: $project/package.json"
npm outdated -D | tail -n +2 | awk '$3 != $4' | awk "$format" | sed "$filter_cmd"
echo

for package in `find modules ops -type f -name "package.json" -not -path "*/node_modules/*"`
do
  cd `dirname $package`
  echo "===== Package: $project/`dirname $package`/package.json"
  mv package.json package.json.backup
  cat package.json.backup | sed /@connext/d > package.json
  npm outdated | tail -n +2 | awk '$3 != $4' | awk "$format"
  echo "-----"
  npm outdated -D | tail -n +2 | awk '$3 != $4' | awk "$format"
  rm package.json
  mv package.json.backup package.json
  cd $root
  echo
done
