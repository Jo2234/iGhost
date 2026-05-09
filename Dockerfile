FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    chromium \
    ffmpeg \
    fonts-liberation \
    fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY server.mjs ./
COPY public ./public

ENV NODE_ENV=production
ENV CHROME_PATH=/usr/bin/chromium
ENV IGHOST_DATA_DIR=/data/data
ENV IGHOST_GENERATED_DIR=/data/generated

EXPOSE 10000

CMD ["node", "server.mjs"]
