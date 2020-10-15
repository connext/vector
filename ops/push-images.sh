#!/usr/bin/env bash
set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"
registry="`cat $root/package.json | grep '"registry":' | head -n 1 | cut -d '"' -f 4`"

registry_url="https://index.docker.io/v1/repositories/${registry#*/}"
images="auth builder database ethprovider global_proxy nats node node_proxy router router_proxy test_runner"

commit="`git rev-parse HEAD | head -c 8`"
git_tag="`git tag --points-at HEAD | grep "vector-" | head -n 1`"

# Try to get the semver from git tag or commit message
if [[ -z "$git_tag" ]]
then
  message="`git log --format=%B -n 1 HEAD`"
  if [[ "$message" == "Deploy vector-"* ]]
  then semver="${message#Deploy vector-}"
  else semver=""
  fi
else semver="`echo $git_tag | sed 's/vector-//'`"
fi

for image in $images
do
  if [[ -n "$semver" ]]
  then
    echo "Tagging image ${project}_$image:$commit as ${project}_$image:$semver"
    docker tag ${project}_$image:$commit ${project}_$image:$semver  || true
  fi
  for version in latest $commit $semver
  do
    echo "Tagging image ${project}_$image:$version as $registry/${project}_$image:$version"
    docker tag ${project}_$image:$version $registry/${project}_$image:$version  || true
    echo "Pushing image: $registry/${project}_$image:$version"
    docker push $registry/${project}_$image:$version || true
  done
done
