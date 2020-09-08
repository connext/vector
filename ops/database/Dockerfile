FROM postgres:12.3-alpine
WORKDIR /root
RUN chown -R postgres:postgres /root
RUN apk add --update --no-cache coreutils groff less mailcap py-pip && pip install --upgrade awscli
COPY . .
ENTRYPOINT ["bash", "entry.sh"]
