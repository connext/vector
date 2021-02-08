# Vector Server Node

# Development

## Creating Database Migrations

_Warning: Annoying process due to Prisma's lack of multi-db support._

Start off the process by making changes to `prisma-sqlite/schema.prisma`.

DB changes must be applied against running environment.

Note: Revisit these instructions by frequently checking Prisma [releases](https://github.com/prisma/prisma/releases) and [docs](https://www.prisma.io/docs/)

- Run `make reset-config` to ensure a fully local development stack.
- Run `make start-trio`.
- Run `make dls` to find docker container ID for `carol`.
- Run `docker exec -it CONTAINER_ID bash`.
- Run `cd modules/server-node`.
- Run `VECTOR_DATABASE_URL=sqlite:///tmp/store.sqlite npm run migration:generate` to generate migration locally. It will show up in the `prisma-sqlite/migrations` directory on the host machine.
- Modify as needed, then run `npx prisma migrate dev --preview-feature` to apply the migration during development.
- When satisfied, port the changes over exactly as is to the `prisma-postgres/schema.prisma`. The only diff between the two files should be the database provider.
- Run `make stop-all` to stop the `trio` stack.
- Run `make start-router` to start the router in a prod-style setup with Postgres running.
- Run `make dls` to find docker container ID for `node`.
- Run `docker exec -it CONTAINER_ID bash`.
- Run `cd modules/server-node`.
- Run `VECTOR_DATABASE_URL=postgresql://vector:vector@database_node:5432/vector npm run migration:generate` to generate migration locally. It will show up in the `prisma-postgres/migrations` directory on the host machine.
- Commit the new migrations and schema changes for both Postgres and SQLite to the repo.
