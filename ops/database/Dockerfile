FROM postgres:12.6-alpine
LABEL website="Secure Docker Images https://secureimages.dev"
LABEL description="We secure your business from scratch"
LABEL maintainer="support@secureimages.dev"

WORKDIR /postgres

RUN apk add --no-cache coreutils groff less mailcap py-pip &&\
    pip install --upgrade awscli &&\
    rm -rf /var/cache/apk/* /tmp/*

COPY . .

RUN chmod +x entry.sh &&\
    chown -R postgres:postgres /postgres

ENTRYPOINT ["bash", "entry.sh"]
