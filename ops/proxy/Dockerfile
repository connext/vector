FROM haproxy:2.3.5-alpine
LABEL website="Secure Docker Images https://secureimages.dev"
LABEL description="We secure your business from scratch"
LABEL maintainer="support@secureimages.dev"

ENV HOME=/app

WORKDIR /app

COPY entry.sh /entry.sh
COPY *.cfg /etc/haproxy/

RUN apk add --no-cache bash ca-certificates certbot curl iputils openssl git &&\
    until curl https://raw.githubusercontent.com/vishnubob/wait-for-it/$(git ls-remote https://github.com/vishnubob/wait-for-it.git refs/heads/master | cut -f1)/wait-for-it.sh > /bin/wait-for; do sleep 5; done &&\
    chmod +x /bin/wait-for &&\
    chmod +x /*.sh &&\
    rm -rf /var/cache/apk/* /tmp/*

ENTRYPOINT ["/entry.sh"]

CMD ["haproxy", "-db", "-f", "/etc/haproxy/https.cfg"]
