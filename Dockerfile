FROM node:8.11.4

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

RUN wget https://github.com/segmentio/chamber/releases/download/v2.3.3/chamber-v2.3.3-linux-amd64 -O /usr/local/bin/chamber && \
    chmod +x /usr/local/bin/chamber

COPY . /usr/src/app

RUN npm install
RUN npm install pm2 -g
RUN npm run build

CMD ["pm2-runtime", "process.yml"]
