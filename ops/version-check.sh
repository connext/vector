#!/usr/bin/env bash
set -e

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

echo "==== Module: project root"
npm outdated -D | tail -n +2 | awk '$3 != $4' | awk "$format" | sed "$filter_cmd"
echo

cd modules
for module in `ls`
do
  echo "===== Module: $module"
  cd $module
  npm outdated | tail -n +2 | awk '$3 != $4' | awk "$format" | sed "$filter_cmd"
  echo "-----"
  npm outdated -D | tail -n +2 | awk '$3 != $4' | awk "$format" | sed "$filter_cmd"
  cd ..
  echo
done
