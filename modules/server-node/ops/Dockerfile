FROM node:12.16.0-alpine3.10
WORKDIR /root
ENV HOME /root
RUN apk add --update --no-cache bash curl g++ gcc git jq make python
RUN npm config set unsafe-perm true && npm install -g npm@6.14.7
RUN curl https://raw.githubusercontent.com/vishnubob/wait-for-it/ed77b63706ea721766a62ff22d3a251d8b4a6a30/wait-for-it.sh > /bin/wait-for && chmod +x /bin/wait-for
RUN npm install pg prisma prisma-cli sqlite3
COPY ops ops
COPY dist dist
COPY migrations migrations
COPY schema.prisma schema.prisma
RUN mkdir -p node_modules
RUN cp -r ./dist/.prisma node_modules/.prisma
RUN cp -r ./dist/@prisma node_modules/@prisma
ENV PATH="/root/node_modules/.bin:./node_modules/.bin:${PATH}"
ENTRYPOINT ["bash", "ops/entry.sh"]
