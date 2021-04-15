FROM node:14.16.0-alpine3.13
LABEL website="Secure Docker Images https://secureimages.dev"
LABEL description="We secure your business from scratch"
LABEL maintainer="support@secureimages.dev"

ENV HOME=/app \
    PATH=/app/node_modules/.bin:./node_modules/.bin:${PATH}

ARG LERNA_VERSION=4.0.0

WORKDIR /app

COPY entry.sh /entry.sh
COPY test.sh /test.sh

RUN apk add --no-cache bash curl g++ gcc git jq make python2 &&\
    npm config set unsafe-perm true &&\
    npm install -g lerna@$LERNA_VERSION &&\
    until curl https://raw.githubusercontent.com/vishnubob/wait-for-it/$(git ls-remote https://github.com/vishnubob/wait-for-it.git refs/heads/master | cut -f1)/wait-for-it.sh > /bin/wait-for; do sleep 5; done &&\
    chmod +x /bin/wait-for &&\
    chmod +x /*.sh &&\
    rm -rf /var/cache/apk/* /tmp/*

# USER node

ENTRYPOINT ["bash", "/entry.sh"]
