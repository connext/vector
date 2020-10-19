#!/usr/bin/env bash
set -e -o pipefail

flags=.flags
if [[ ! -d "$flags" ]]
then echo "Nothing has been built yet. Try running: make" && exit
fi

echo
echo " seconds | module"
echo "---------+----------------"
for step in $flags/*
do echo "$(cat "$step") $step" | sed 's/.flags\///'
done | sort -nr | awk '{printf(" %7s | %s\n", $1, $2)}'
