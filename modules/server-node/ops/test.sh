#!/bin/bash
set -eE

if [[ -d "modules/server-node" ]]
then cd modules/server-node || exit 1
fi

# Poke sqlite file
# sqlite_file=${VECTOR_SQLITE_FILE:-/tmp/store.sqlite}
# echo "Using SQLite store at $sqlite_file"
# touch "$sqlite_file"

project="vector"

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

stack="server_node_tester"

docker_compose=$root/.${stack}.docker-compose.yml
rm -f "$docker_compose"
cat - > "$docker_compose" <<EOF
version: '3.4'

networks:
  $project:
    external: true

volumes:

  server_node_db:
    driver_opts:
      type: tmpfs
      device: tmpfs

services:

  server_node_db:
    $common
    image: '${project}_database'
    $db_env
    volumes:
      - server_node_db:/var/lib/postgresql/data

EOF

docker stack deploy -c "$docker_compose" "$stack"

# export VECTOR_DATABASE_URL="sqlite://$sqlite_file"
export VECTOR_PG_HOST="server_node_db"
export VECTOR_PG_USERNAME="$project"
export VECTOR_PG_PASSWORD="$project"
export VECTOR_PG_PORT="5432"
export VECTOR_PG_USERNAME="$project"

# Migrate db
prisma migrate deploy --preview-feature --schema prisma-postgres/schema.prisma

# Launch tests
nyc ts-mocha --bail --check-leaks --exit --timeout 60000 'src/**/*.spec.ts' "$@"
