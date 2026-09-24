# syntax=docker/dockerfile:1
FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @fi/api... build
RUN pnpm --filter @fi/api deploy --prod /out

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system --gid 10001 nodejs \
    && useradd --system --uid 10001 --gid nodejs nodejs \
    && chown -R nodejs:nodejs /app
COPY --from=build --chown=nodejs:nodejs /out .
USER nodejs
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]