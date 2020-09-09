#!/usr/bin/env bash
set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"
registry="`cat $root/package.json | grep '"registry":' | head -n 1 | cut -d '"' -f 4`"

extra="$1"

images="builder database ethprovider node proxy"

commit="`git rev-parse HEAD | head -c 8`"
semver="`cat package.json | grep '"version":' | head -n 1 | cut -d '"' -f 4`"

for image in $images
do
  for version in $extra latest $commit $semver
  do
    echo "Pulling image: $registry/${project}_$image:$version"
    docker pull $registry/${project}_$image:$version || true
    echo "Tagging image $registry/${project}_$image:$version as ${project}_$image:$version"
    docker tag $registry/${project}_$image:$version ${project}_$image:$version || true
  done
done
