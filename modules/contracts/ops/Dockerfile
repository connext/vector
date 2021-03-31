FROM node:14.16.0-alpine3.13
LABEL website="Secure Docker Images https://secureimages.dev"
LABEL description="We secure your business from scratch"
LABEL maintainer="support@secureimages.dev"

ENV HOME=/app \
    PATH=/app/node_modules/.bin:./node_modules/.bin:${PATH}

WORKDIR /app

RUN apk add --no-cache bash curl g++ gcc git jq make python2 &&\
    npm config set unsafe-perm true &&\
    curl https://raw.githubusercontent.com/vishnubob/wait-for-it/$(git ls-remote https://github.com/vishnubob/wait-for-it.git refs/heads/master | cut -f1)/wait-for-it.sh > /bin/wait-for &&\
    chmod +x /bin/wait-for &&\
    rm -rf /var/cache/apk/* /tmp/*

COPY package.json ./

RUN npm install
RUN npm audit --audit-level=moderate
RUN npm outdated || true

COPY tsconfig.json tsconfig.json
COPY hardhat.config.ts hardhat.config.ts
COPY ops/entry.sh /entry.sh
COPY deploy deploy
COPY src.sol src.sol
COPY src.ts src.ts
COPY artifacts artifacts
COPY dist dist

RUN find dist -type f -name "*.ts"  -exec rm {} \; &&\
    find dist -type f -name "*.map" -exec rm {} \; &&\
    chmod +x /*.sh

# USER node

ENTRYPOINT ["bash", "/entry.sh"]
