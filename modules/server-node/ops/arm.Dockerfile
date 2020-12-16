FROM arm32v7/node
WORKDIR /root
ENV HOME /root
RUN curl https://raw.githubusercontent.com/vishnubob/wait-for-it/ed77b63706ea721766a62ff22d3a251d8b4a6a30/wait-for-it.sh > /bin/wait-for && chmod +x /bin/wait-for
COPY ops/package.json package.json
RUN npm install
ENV PATH="/root/node_modules/.bin:./node_modules/.bin:${PATH}"
COPY ops ops
COPY schema.prisma schema.prisma
COPY migrations migrations
COPY dist dist
RUN cp -rfT dist/.prisma node_modules/.prisma
RUN cp -rfT dist/@prisma/client node_modules/@prisma/client
ENTRYPOINT ["bash", "ops/entry.sh"]
