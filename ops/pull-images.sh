#!/usr/bin/env bash
set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"
registry="`cat $root/package.json | grep '"registry":' | head -n 1 | cut -d '"' -f 4`"

commit="`git rev-parse HEAD | head -c 8`"
semver="`cat package.json | grep '"version":' | head -n 1 | cut -d '"' -f 4`"

default_images="`
  echo 'auth builder database ethprovider global_proxy nats node node_proxy router router_proxy test_runner' |\
    sed "s/^/${project}_/g" |\
    sed "s/ / ${project}_/g"
`"

# If given an arg like "image_name:version", then try to pull that version of image_name
if [[ -n "$1" && "$1" == *:* ]]
then
  versions="${1#*:}"
  images="${1%:*}"

# Else parse first arg as versions and second as image names
else
  versions="${1:-latest $commit $semver}"
  images="${2:-$default_images}"
fi

for image in $images
do
  for version in $versions
  do
    name="$image:$version"
    if [[ -n "`docker image ls | grep "$image" | grep "$version"`" ]]
    then
      echo "Image $name already exists locally"
    else

      if [[ -n "`echo $name | grep "${project}_"`" ]]
      then full_name="${registry%/}/$name"
      else full_name="$name"
      fi

      echo "Pulling image: $full_name"
      docker pull $full_name || true

      if [[ "$name" != "$full_name" ]]
      then
        echo "Tagging image $full_name as $name"
        docker tag $full_name $name || true
      fi

    fi
  done
done
