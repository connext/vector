#!/bin/bash
set -eE

project="vector"
if [[ -d "modules/server-node" ]]
then cd modules/server-node || exit 1
fi

export VECTOR_PG_HOST="postgres_db"
export VECTOR_PG_USERNAME="$project"
export VECTOR_PG_PASSWORD="$project"
export VECTOR_PG_PORT="5432"
export VECTOR_PG_USERNAME="$project"
export VECTOR_DATABASE_URL="postgresql://$VECTOR_PG_USERNAME:$VECTOR_PG_PASSWORD@${VECTOR_PG_HOST}:$VECTOR_PG_PORT/$VECTOR_PG_DATABASE"

# Migrate db
prisma migrate deploy --preview-feature --schema prisma-postgres/schema.prisma

# Launch tests
nyc ts-mocha --bail --check-leaks --exit --timeout 60000 'src/**/*.spec.ts' "$@"
