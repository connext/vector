#!/usr/bin/env bash
set -e

stack="duet"

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project=$(grep -m 1 '"name":' "$root/package.json" | cut -d '"' -f 4)

# make sure a network for this project has been created
docker swarm init 2> /dev/null || true
docker network create --attachable --driver overlay "$project" 2> /dev/null || true

if ! grep -q "$stack" <<<"$(docker stack ls --format '{{.Name}}' | grep "$stack")"
then echo "A $stack stack is already running" && exit 0;
else echo; echo "Preparing to launch $stack stack"
fi

####################
# Misc Config

config="$(cat "$root/config-node.json")"

version="latest"

common="networks:
      - '$project'
    logging:
      driver: 'json-file'
      options:
          max-size: '100m'"

########################################
# Global services / chain provider config

bash "$root/ops/start-global.sh"

chain_addresses="$(cat "$root/.chaindata/chain-addresses.json")"
config="$(echo "$config" '{"chainAddresses":'"$chain_addresses"'}' | jq -s '.[0] + .[1]')"

########################################
## Database config

database_image="${project}_database:$version"
bash "$root/ops/pull-images.sh" "$database_image" > /dev/null

pg_port="5432"

database_env="environment:
      POSTGRES_DB: '$project'
      POSTGRES_PASSWORD: '$project'
      POSTGRES_USER: '$project'"

########################################
## Node config

internal_node_port="8000"

alice_port="8003"
alice_database="database_a"
alice_database_port="5432"
alice_mnemonic="avoid post vessel voyage trigger real side ribbon pattern neither essence shine"
echo "$stack.alice will be exposed on *:$alice_port"

bob_port="8004"
bob_database="database_b"
bob_database_port="5433"
bob_mnemonic="negative stamp rule dizzy embark worth ill popular hip ready truth abandon"
echo "$stack.bob will be exposed on *:$bob_port"

public_url="http://localhost:$alice_port"

node_image="image: '${project}_builder'
    entrypoint: 'bash modules/server-node/ops/entry.sh'
    volumes:
      - '$root:/root'"

node_env="environment:
      VECTOR_CONFIG: '$config'
      VECTOR_PG_DATABASE: '$project'
      VECTOR_PG_PASSWORD: '$project'
      VECTOR_PG_PORT: '$pg_port'
      VECTOR_PG_USERNAME: '$project'"

####################
# Launch stack

docker_compose=$root/.${stack}.docker-compose.yml
rm -f "$docker_compose"
cat - > "$docker_compose" <<EOF
version: '3.4'

networks:
  $project:
    external: true

services:

  alice:
    $common
    $node_image
    $node_env
      VECTOR_PG_HOST: '$alice_database'
      VECTOR_MNEMONIC: '$alice_mnemonic'
    ports:
      - '$alice_port:$internal_node_port'

  bob:
    $common
    $node_image
    $node_env
      VECTOR_PG_HOST: '$bob_database'
      VECTOR_MNEMONIC: '$bob_mnemonic'
    ports:
      - '$bob_port:$internal_node_port'

  $alice_database:
    $common
    image: '$database_image'
    $database_env
    ports:
      - '$alice_database_port:5432'

  $bob_database:
    $common
    image: '$database_image'
    $database_env
    ports:
      - '$bob_database_port:5432'

EOF

docker stack deploy -c "$docker_compose" "$stack"

echo "The $stack stack has been deployed, waiting for $public_url to start responding.."
timeout=$(( $(date +%s) + 60 ))
while true
do
  res="$(curl -k -m 5 -s $public_url || true)"
  if [[ -z "$res" || "$res" == "Waiting for proxy to wake up" ]]
  then
    if [[ "$(date +%s)" -gt "$timeout" ]]
    then echo "Timed out waiting for proxy to respond.." && exit
    else sleep 2
    fi
  else echo "Good Morning!" && exit;
  fi
done
