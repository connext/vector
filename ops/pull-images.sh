#!/usr/bin/env bash
set -e

root=$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )
project=$(grep '"name":' "$root/package.json" | head -n 1 | cut -d '"' -f 4)
registry=$(grep '"registry":' "$root/package.json" | head -n 1 | cut -d '"' -f 4)
release=$(grep -m 1 '"version":' "$root/package.json" | cut -d '"' -f 4)
commit=$(git rev-parse HEAD | head -c 8)

default_images=$(
  echo 'auth builder database ethprovider global_proxy nats node node_proxy router router_proxy test_runner' |\
    sed "s/^/${project}_/g" |\
    sed "s/ / ${project}_/g"
)

# If given an arg like "image_name:version", then try to pull that version of image_name
if [[ -n "$1" && "$1" == *:* ]]
then
  versions="${1#*:}"
  images="${1%:*}"

# Else parse first arg as versions and second as image names
else
  versions="${1:-latest $commit $release}"
  images="${2:-$default_images}"
fi

for image in $images
do
  for version in $versions
  do
    name="$image:$version"
    if grep -qs "$version" <<<"$(docker image ls | grep "$image\>")"
    then echo "Image $name already exists locally"
    else

      if grep -qs "${project}_" <<<"$name"
      then full_name="${registry%/}/$name"
      else full_name="$name"
      fi

      echo "Pulling image: $full_name"
      docker pull "$full_name" || true

      if [[ "$name" != "$full_name" ]]
      then
        echo "Tagging image $full_name as $name"
        docker tag "$full_name" "$name" || true
      fi

    fi
  done
done
