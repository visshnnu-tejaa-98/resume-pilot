# Resume Pilot web (Next.js). Build context: repo root.
#   docker build -f apps/web/Dockerfile .
# Pruned with `turbo prune` so only the web app's workspace packages are copied.
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@11.9.0 && npm cache clean --force
WORKDIR /app

FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.11 prune @resume-pilot/web --docker

FROM base AS build
# Dependencies first (cached until a package.json or the lockfile changes).
COPY --from=prune /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=prune /app/out/full/ .
# turbo prune keeps workspace packages but not root config files they extend.
COPY tsconfig.base.json ./
# NEXT_PUBLIC_* are inlined at build time: Railway passes service variables as build args.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SUPPORT_EMAIL
ARG NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
ARG NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard
RUN pnpm --filter @resume-pilot/web build

FROM base AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
# Whole pruned workspace: `next start` runs the app, and Railway's pre-deploy
# command runs migrations from packages/database (tsx + drizzle/ folder).
COPY --from=build --chown=node:node /app .
USER node
EXPOSE 3000
WORKDIR /app/apps/web
CMD ["node_modules/.bin/next", "start"]
