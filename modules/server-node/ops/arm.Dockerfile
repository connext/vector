FROM arm64v8/node:14.16.0-buster
LABEL website="Secure Docker Images https://secureimages.dev"
LABEL description="We secure your business from scratch"
LABEL maintainer="support@secureimages.dev"

ENV HOME="/app" \
    PATH="/app/node_modules/.bin:./node_modules/.bin:${PATH}" \
    PRISMA_QUERY_ENGINE_BINARY=/prisma-arm64/query-engine \
    PRISMA_MIGRATION_ENGINE_BINARY=/prisma-arm64/migration-engine \
    PRISMA_INTROSPECTION_ENGINE_BINARY=/prisma-arm64/introspection-engine \
    PRISMA_FMT_BINARY=/prisma-arm64/prisma-fmt

WORKDIR /app

COPY ./prisma-binaries-armv8/ /prisma-arm64/
COPY package.json package.json

RUN chmod +x /prisma-arm64/* &&\
    curl https://raw.githubusercontent.com/vishnubob/wait-for-it/$(git ls-remote https://github.com/vishnubob/wait-for-it.git refs/heads/master | cut -f1)/wait-for-it.sh > /bin/wait-for &&\
    chmod +x /bin/wait-for

RUN npm install --production
RUN npm audit --audit-level=moderate
RUN npm outdated || true

COPY ops ops
COPY prisma-postgres prisma-postgres
COPY prisma-sqlite prisma-sqlite
COPY dist dist
COPY dist/generated/db-client /.prisma/client

ENTRYPOINT ["bash", "ops/entry.sh"]
