FROM provide/nats-server:indra
WORKDIR /root
RUN apk add --update --no-cache bash
COPY entry.sh entry.sh
ENTRYPOINT ["bash", "entry.sh"]
