FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @fi/api... build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/package.json ./
COPY --from=build /repo/node_modules ./node_modules
EXPOSE 4000
CMD ["node", "dist/server.js"]
