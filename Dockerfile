# syntax=docker/dockerfile:1.7
# Production image: the Fastify server serving the client build on one origin (docs/context/deploy.md).
# Debian slim, not Alpine: the prebuilt binaries of sharp and @node-rs/argon2 are glibc.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH HUSKY=0 CI=1
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile \
      --filter . --filter "@lorkarium/client..." --filter "@lorkarium/server..."
RUN pnpm --filter @lorkarium/client build && pnpm --filter @lorkarium/server build

# Only the server's runtime dependencies; the @lorkarium/* packages are already in the bundle.
FROM build AS prod-deps
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @lorkarium/server deploy --prod --legacy /out

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3333 CLIENT_DIST_DIR=/app/client/dist
WORKDIR /app/server
COPY --from=prod-deps --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/server/package.json ./package.json
COPY --from=build --chown=node:node /repo/server/dist ./dist
COPY --from=build --chown=node:node /repo/server/drizzle ./drizzle
COPY --from=build --chown=node:node /repo/client/dist /app/client/dist
USER node
EXPOSE 3333
# No curl in the image: Node 22's fetch asks the health route.
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3333/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# Migrate, then exec: Node becomes PID 1 and gets Coolify's SIGTERM, which runs app.close().
CMD ["sh", "-c", "node dist/deploy-migrate.mjs && exec node dist/index.mjs"]
