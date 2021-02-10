FROM arm64v8/node:14.15.4-buster

ENV HOME="/root" \
    PATH="/root/node_modules/.bin:./node_modules/.bin:${PATH}" \
    PRISMA_QUERY_ENGINE_BINARY=/prisma-arm64/query-engine \
    PRISMA_MIGRATION_ENGINE_BINARY=/prisma-arm64/migration-engine \
    PRISMA_INTROSPECTION_ENGINE_BINARY=/prisma-arm64/introspection-engine \
    PRISMA_FMT_BINARY=/prisma-arm64/prisma-fmt

WORKDIR /root

COPY ./prisma-binaries-armv8/ /prisma-arm64/
COPY package.json package.json
COPY schema.prisma schema.prisma

RUN chmod +x /prisma-arm64/* ;\
    curl https://raw.githubusercontent.com/vishnubob/wait-for-it/ed77b63706ea721766a62ff22d3a251d8b4a6a30/wait-for-it.sh > /bin/wait-for ;\
    chmod +x /bin/wait-for

RUN npm install --production ;\
    prisma --version

RUN prisma generate

COPY ops ops
COPY migrations migrations
COPY dist dist

ENTRYPOINT ["bash", "ops/entry.sh"]
