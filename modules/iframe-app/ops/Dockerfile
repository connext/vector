FROM node:12.16.0-alpine3.10
WORKDIR /root
ENV HOME /root
RUN apk add --update --no-cache bash curl g++ gcc git jq make python
RUN npm config set unsafe-perm true && npm install -g npm@6.14.7
RUN npm install serve -g
COPY build build
EXPOSE 5000
CMD ["/bin/bash", "-c", "ls build && cd build && ./env.sh && cat env-config.js && serve ."]
# CMD ["serve", "build"]