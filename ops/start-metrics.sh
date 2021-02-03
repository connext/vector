#!/usr/bin/env bash
set -e

stack="metrics"
root=$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )
project=$(grep -m 1 '"name":' "$root/package.json" | cut -d '"' -f 4)

# make sure a network for this project has been created
docker swarm init 2> /dev/null || true
docker network create --attachable --driver overlay "$project" 2> /dev/null || true

if grep -qs "$stack" <<<"$(docker stack ls --format '{{.Name}}')"
then echo "A $stack stack is already running" && exit 0
fi

common="networks:
      - '$project'
    logging:
      driver: 'json-file'
      options:
          max-size: '100m'"

echo
echo "Preparing to launch $stack stack"

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
  certs:

services:

  metrics:
    $common
    image: '$proxy_image'
    $proxy_ports
    environment:
      VECTOR_DOMAINNAME: '$domain_name'
      VECTOR_AUTH_URL: 'auth:$auth_port'
      VECTOR_NATS_HOST: 'nats'
    volumes:
      - 'certs:/etc/letsencrypt'

EOF

docker stack deploy -c "$docker_compose" "$stack"
echo "The $stack stack has been deployed, waiting for $public_url to wake up.."

timeout=$(( $(date +%s) + 300 ))
while [[ "$(curl -k -m 5 -s "$public_url" || true)" != "pong"* ]]
do
  if [[ "$(date +%s)" -gt "$timeout" ]]
  then
    echo "====="
    docker service ls
    echo "====="
    docker container ls -a
    echo "====="
    docker service ps messaging_auth || true
    docker service logs --tail 50 --raw messaging_auth || true
    echo "====="
    curl "$public_url" || true
    echo "====="
    echo "Timed out waiting for $stack stack to wake up."
    exit 1
  else sleep 1
  fi
done
echo "Good Morning!"
