FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY server.js ./
COPY public/ ./public/
COPY config.yaml ./config.yaml

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "server.js"]
