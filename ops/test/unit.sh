#!/usr/bin/env bash
set -e

unit=$1
shift;
args=$@

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/../.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"

# If file descriptors 0-2 exist, then we're prob running via interactive shell instead of on CD/CI
if [[ -t 0 && -t 1 && -t 2 ]]
then interactive="--interactive --tty"
else echo "Running in non-interactive mode"
fi

exec docker run \
  --entrypoint="bash" \
  $interactive \
  --name="${project}_test_$unit" \
  --rm \
  --volume="$root:/root" \
  ${project}_builder -c "
    set -e
    echo 'Test-$unit container launched!'
    
    cd modules/$unit

    function finish {
      echo && echo 'Test-$unit container exiting..' && exit
    }
    trap finish SIGTERM SIGINT

    echo 'Launching $unit tests!';echo
    bash ops/test.sh $args
  "
