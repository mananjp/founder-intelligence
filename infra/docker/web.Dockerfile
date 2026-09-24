# syntax=docker/dockerfile:1
# MVP deploys web on Vercel. This image exists for the Production (ECS) path.
FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @fi/web build

FROM node:22-slim
ENV NODE_ENV=production HOSTNAME=0.0.0.0
WORKDIR /app
RUN groupadd --system --gid 10001 nodejs \
    && useradd --system --uid 10001 --gid nodejs nodejs \
    && chown -R nodejs:nodejs /app
COPY --from=build --chown=nodejs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=build --chown=nodejs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
USER nodejs
WORKDIR /app/apps/web
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]