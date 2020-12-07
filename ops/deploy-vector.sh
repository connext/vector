#!/usr/bin/env bash
set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project=$(grep -m 1 '"name":' "$root/package.json" | cut -d '"' -f 4)
registry=$(grep -m 1 '"registry":' "$root/package.json" | cut -d '"' -f 4)

registry_url="https://index.docker.io/v1/repositories/${registry#*/}"

########################################
## Run some sanity checks to make sure we're really ready to deploy

if [[ -n "$(git status -s)" ]]
then echo "Aborting: Make sure your git repo is clean" && exit 1
fi

if [[ "$(git symbolic-ref HEAD | sed 's|.*/\(.*\)|\1|')" != "main" ]]
then echo "Aborting: Make sure you've checked out the main branch" && exit 1
fi

if [[ -n "$(git diff origin/main)" ]]
then echo "Aborting: Make sure your branch is up to date with origin/main" && exit 1
fi

if [[ ! -f "Makefile" ]]
then echo "Aborting: Make sure you're in the $project project root" && exit 1
fi

# Create patch to check for conflicts
# Thanks to: https://stackoverflow.com/a/6339869
set +e # temporarily handle errors manually
git checkout prod > /dev/null 2>&1
if ! git merge --no-commit --no-ff main
then
  git merge --abort && git checkout main > /dev/null 2>&1
  echo "Merge aborted & rolled back, your repo is clean again"
  echo
  echo "Error: merging main into prod would result in the above merge conflicts."
  echo "To deploy:"
  echo " 1. Merge prod into main ie: git checkout main && git merge prod"
  echo " 2. Take care of any merge conflicts & do post-merge testing if needed"
  echo " 3. Re-run this script"
  echo
  exit 0
fi
git merge --abort && git checkout main > /dev/null 2>&1
set -e

########################################
## Gather info needed for deployment

current_version="$(git show origin/prod:package.json | grep '"version":' | awk -F '"' '{print $4}')"

echo "What version of Vector are we deploying? Current version: $current_version"
read -p "> " -r
echo
version="$REPLY" # get version from user input

if [[ -z "$version" || "$version" == "$current_version" ]]
then echo "Aborting: A new, unique $project version is required" && exit 1
fi

echo "Verifying..."
if [[ -n "$(curl -sflL "$registry_url/${project}_node/tags/$version")" ]]
then echo "Aborting: This version already exists on docker hub" && exit 1
fi

echo "Confirm: we'll deploy the current main branch as $project-$version (y/n)?"
read -p "> " -r
echo
if [[ ! "$REPLY" =~ ^[Yy]$ ]]
then echo "Aborting by user request" && exit 1 # abort!
fi

tag=$project-$version
echo "Let's go, deploying: $tag"

# First, npm publish
bash ops/npm-publish.sh <<EOF
y
$version
y
EOF

git checkout prod
git merge --no-ff main -m "Deploy $tag"

# edit package.json to set new version number
mv package.json .package.json
sed 's/^  "version": ".*"/  "version": "'"$version"'"/' < .package.json > package.json
rm .package.json
mv package-lock.json .package-lock.json
sed 's/^  "version": ".*"/  "version": "'"$version"'"/' < .package-lock.json > package-lock.json
rm .package-lock.json

# Push a new commit to prod
git add .
git commit --amend --no-edit
git push origin prod --no-verify

# Push a new semver tag
git tag "$tag"
git push origin "$tag" --no-verify

# Bring main up-to-date w prod for a cleaner git history
git checkout main
git merge prod
git push origin main --no-verify
