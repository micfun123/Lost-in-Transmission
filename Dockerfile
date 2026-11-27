FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js operation.js ./
COPY levels ./levels
COPY web ./web
COPY apps ./apps
COPY scripts ./scripts

# Owned by node so the analytics volume is writable.
RUN mkdir /data && chown node:node /data
ENV ANALYTICS_FILE=/data/analytics.jsonl

USER node
EXPOSE 8000
CMD ["node", "server.js", "--host", "0.0.0.0", "--port", "8000"]
