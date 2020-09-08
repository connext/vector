FROM haproxy:2.1.3-alpine
WORKDIR /root
ENV HOME /root
RUN apk add --update --no-cache bash ca-certificates certbot curl iputils openssl
RUN curl https://raw.githubusercontent.com/vishnubob/wait-for-it/ed77b63706ea721766a62ff22d3a251d8b4a6a30/wait-for-it.sh > /bin/wait-for && chmod +x /bin/wait-for
COPY . .
ENTRYPOINT ["bash", "/root/entry.sh"]
