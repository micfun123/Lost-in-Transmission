FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js operation.js ./
COPY web ./web
COPY data ./data
COPY shared ./shared
COPY portal ./portal
COPY apps ./apps

USER node
EXPOSE 8000
CMD ["node", "server.js", "--host", "0.0.0.0", "--port", "8000"]
