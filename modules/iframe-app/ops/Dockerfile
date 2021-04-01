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

COPY ops/package.json package.json

RUN npm install
RUN npm audit --audit-level=moderate
RUN npm outdated || true

COPY build build

EXPOSE 5000

# USER node

ENTRYPOINT ["serve", "build"]
