FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/client/package.json apps/client/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

COPY . .
RUN npm run build

FROM caddy:2.11-alpine AS runner

COPY --from=builder /app/apps/client/dist /srv
COPY apps/client/Caddyfile /etc/caddy/Caddyfile
