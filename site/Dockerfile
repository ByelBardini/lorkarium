# syntax=docker/dockerfile:1.7
# Landing page image (docs/context/deploy.md): the static Astro build served by Caddy on :80.
# Build context is the repo root (docker build -f site/Dockerfile .): site/ needs packages/brand and packages/tsconfig.

FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH HUSKY=0 CI=1
RUN corepack enable
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --filter "@lorkarium/site..."
# astro:env validates these at build time and inlines them: they are Build Variables, not runtime env.
# LEGAL_DRAFTS_ALLOWED stays unset in production so a draft of Termos/Privacidade fails the build;
# only CI passes it, to prove the image before the final legal text exists.
ARG SITE_URL
ARG PUBLIC_APP_URL
ARG PUBLIC_CONTACT_EMAIL
ARG LEGAL_DRAFTS_ALLOWED
RUN pnpm --filter @lorkarium/site build

FROM caddy:2-alpine AS runtime
COPY site/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/site/dist /srv
# Non-root works on :80: the official image grants cap_net_bind_service to the caddy binary,
# and the Caddyfile turns off the admin API and autosave, so nothing writes to /config or /data.
USER nobody
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "--spider", "http://127.0.0.1/"]
