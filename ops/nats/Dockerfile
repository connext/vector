FROM provide/nats-server:indra as nats

FROM alpine:3.13.3
LABEL website="Secure Docker Images https://secureimages.dev"
LABEL description="We secure your business from scratch"
LABEL maintainer="support@secureimages.dev"

COPY entry.sh /entry.sh
COPY --from=nats /nats /nats

RUN apk add --no-cache bash ca-certificates &&\
    chmod +x /*.sh &&\
    ln -ns /nats/bin/nats-server /bin/nats-server &&\
    ln -ns /nats/bin/nats-server /nats-server &&\
    ln -ns /nats/bin/nats-server /gnatsd &&\
    rm -rf /var/cache/apk/* /tmp/*

EXPOSE 4221 4222 5222 6222 8222

ENTRYPOINT ["/entry.sh"]

CMD ["nats-server", "-D", "-V"]
