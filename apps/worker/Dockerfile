# Resume Pilot worker (BullMQ processors, Puppeteer PDF, Tesseract OCR). Build context: repo root.
#   docker build -f apps/worker/Dockerfile .
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN npm install -g pnpm@11.9.0 && npm cache clean --force
WORKDIR /app

FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.11 prune @resume-pilot/worker --docker

FROM base AS runtime
# Debian's Chromium (amd64 and arm64 — Puppeteer's own Chrome has no linux-arm64 build),
# plus fonts for anything the inlined resume fonts don't cover.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates chromium fonts-liberation fonts-noto-core fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*
# Don't download Puppeteer's Chrome; launch the system one.
ENV PUPPETEER_SKIP_DOWNLOAD=1 PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
COPY --from=prune /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=prune /app/out/full/ .
# turbo prune keeps workspace packages but not root config files they extend.
COPY tsconfig.base.json ./
RUN chown -R node:node /app
ENV NODE_ENV=production
# Containers run as root-like users with a small /dev/shm: Chromium's sandbox can't start.
ENV PUPPETEER_NO_SANDBOX=1
USER node
WORKDIR /app/apps/worker
CMD ["node_modules/.bin/tsx", "src/index.ts"]
