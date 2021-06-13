#!/usr/bin/env bash
set -e

stack="postgres"
root=$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )
project=$(grep -m 1 '"name":' "$root/package.json" | cut -d '"' -f 4)

if grep -qs "$stack" <<<"$(docker stack ls --format '{{.Name}}')"
then echo "A $stack stack is already running" && exit 0
fi

db_env="environment:
      POSTGRES_DB: '$project'
      POSTGRES_USER: '$project'
      POSTGRES_PASSWORD: '$project'"

common="networks:
      - '$project'
    logging:
      driver: 'json-file'
      options:
          max-size: '100m'"

####################
# Launch stack

docker_compose=$root/.${stack}.docker-compose.yml

rm -f "$docker_compose"
cat - > "$docker_compose" <<EOF
version: '3.4'

networks:
  $project:
    external: true

volumes:

  db:
    driver_opts:
      type: tmpfs
      device: tmpfs

services:

  db:
    $common
    image: '${project}_database'
    $db_env
    volumes:
      - db:/var/lib/postgresql/data

EOF

docker stack deploy -c "$docker_compose" "$stack"
echo "The $stack stack has been deployed, waiting for it to wake up.."

timeout=$(( $(date +%s) + 300 ))
stack_name=$(docker stack ls --format '{{.Name}}' | grep "$target")
while [[ -z "$stack_name" ]]
do
  if [[ "$(date +%s)" -gt "$timeout" ]]
  then echo "Timed out waiting for $stack stack to wake up" && exit 1
  else sleep 5
  fi
done
echo "Good Morning!"