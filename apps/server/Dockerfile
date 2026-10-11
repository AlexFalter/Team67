FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/client/package.json apps/client/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server ./apps/server
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/client/dist ./apps/client/dist
COPY --from=builder /app/package.json ./package.json
# Optional isolated load test, using the same movement client as networking regressions.
COPY --from=builder /app/scripts/server-load-test.ts ./scripts/server-load-test.ts
COPY --from=builder /app/tests/reportClient.ts /app/tests/fixture.ts ./tests/
EXPOSE 2567
CMD ["node", "--import", "tsx", "apps/server/src/index.ts", "--production"]
