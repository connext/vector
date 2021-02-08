# Vector Server Node

# Development

## Creating Database Migrations

_Warning: Annoying process due to Prisma's lack of multi-db support._

Start off the process by making changes to `prisma-sqlite`.

DB changes must be applied against running environment.

- Run `make start-trio`.
- Run `make dls` to find docker container ID for `carol`.
- Run `docker exec -it CONTAINER_ID bash`.
- Run `cd modules/server-node`.
- Run `npx prisma migrate dev --create-only --preview-feature --schema prisma-sqlite/schema.prisma` to generate migration locally. It will show up in the `prisma-sqlite/migrations` directory
