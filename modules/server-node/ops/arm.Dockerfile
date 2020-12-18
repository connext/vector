FROM arm64v8/node
WORKDIR /root
ENV HOME /root
RUN curl https://raw.githubusercontent.com/vishnubob/wait-for-it/ed77b63706ea721766a62ff22d3a251d8b4a6a30/wait-for-it.sh > /bin/wait-for && chmod +x /bin/wait-for
ENV PATH="/root/node_modules/.bin:./node_modules/.bin:${PATH}"
COPY package.json package.json
COPY schema.prisma schema.prisma
RUN npm install --production
RUN prisma generate
COPY ops ops
COPY migrations migrations
COPY dist dist
ENTRYPOINT ["bash", "ops/entry.sh"]
