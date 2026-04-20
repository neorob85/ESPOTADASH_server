FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY public/ ./public/

RUN mkdir -p config firmware

EXPOSE 3000

ENV PORT=3000 \
    PING_INTERVAL_MS=60000 \
    PING_TIMEOUT_MS=4000 \
    OFFLINE_GRACE_MS=180000

CMD ["node", "server.js"]
