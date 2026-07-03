# ---- Build-Stage: Dependencies installieren (better-sqlite3 braucht Build-Tools) ----
FROM node:22-alpine AS build

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ---- Runtime-Stage: schlankes Image ----
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_PATH=/data/smartcart.db

COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY public ./public

EXPOSE 8080

CMD ["node", "server/index.js"]
