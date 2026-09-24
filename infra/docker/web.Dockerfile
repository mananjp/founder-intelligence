# MVP deploys web on Vercel. This image exists for the Production (ECS) path.
FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @fi/web build
FROM node:22-slim
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
