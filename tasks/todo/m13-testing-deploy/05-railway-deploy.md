# Railway deploy

**Milestone:** M13 · prd.md §14.4
**Status:** todo

## Scope

- `apps/web/Dockerfile` and `apps/worker/Dockerfile` (multi-stage, `turbo prune` for each app). The worker image installs Chromium for Puppeteer and the Tesseract language data.
- Railway project with 4 services: web (public domain), worker (no public domain), PostgreSQL, Redis
- A `railway.json` per app (build from its Dockerfile, health check `/api/trpc/health` for web, restart policy for worker)
- Migrations: `pnpm --filter @resume-pilot/database db:migrate` as the web service's pre-deploy command, so a failed migration blocks the deploy
- Variables: `DATABASE_URL` / `REDIS_URL` as Railway references; Clerk, Razorpay, OpenAI, ImageKit and SMTP secrets as service variables (shared variables where both services need them). Nothing committed.
- Point the Clerk and Razorpay webhooks at the Railway web domain
- GitHub connected: deploy on push to `main`
- Document how to recreate the project (services, variables, domains) in this file, since there's no IaC

## Done when

- A merge to `main` produces a deployed web + worker with zero manual steps
- The worker processes a test job against Railway Redis, and Puppeteer renders a PDF inside the deployed container
- A deliberately broken migration fails the deploy and leaves the previous version serving

## Progress (in repo)

- `apps/web/Dockerfile`, `apps/worker/Dockerfile` — multi-stage, `turbo prune --docker`, build context = repo root. Worker image uses Debian's `chromium` (amd64 + arm64; Puppeteer's own Chrome has no linux-arm64 build) via `PUPPETEER_EXECUTABLE_PATH`, plus Noto/Liberation fonts; Tesseract English data ships as an npm package; `PUPPETEER_NO_SANDBOX=1`. `tsconfig.base.json` is copied in explicitly (turbo prune drops it).
- `apps/web/railway.json` — Dockerfile build, pre-deploy `pnpm --filter @resume-pilot/database db:migrate` (a failed migration blocks the deploy, previous version keeps serving), health check `/api/trpc/health`.
- `apps/worker/railway.json` — Dockerfile build, restart policy ALWAYS, no domain.
- `.dockerignore` keeps `.env*`, `node_modules`, `.next`, design/tasks out of images.

### Verified locally (2026-11-26, Docker, arm64)

- web: image builds (41 pages); pre-deploy migration runs in the image; `/api/trpc/health` 200; home 200; runs as `node`.
- worker: image builds; Puppeteer renders a PDF inside the container (`%PDF-`, 35 KB); worker boots, connects to Redis/Postgres, listens on all 6 queues and processes jobs; runs as `node`.
- Image sizes are large (web ~1.5 GB+, worker 3.2 GB) because the full pruned workspace with dev deps is kept (tsx runs the worker and migrations). Fine for Railway; slimming is a later optimisation.

## How to recreate the Railway project (no IaC)

1. **New project** → *Deploy from GitHub repo* → `visshnnu-tejaa-98/resume-pilot`, branch `main`.
2. **Add PostgreSQL** and **Add Redis** (Railway plugins).
3. **web service**: Settings → *Config-as-code* path `apps/web/railway.json`; root directory = repo root. Networking → *Generate domain* (or custom domain).
4. **worker service**: new service from the same repo, config path `apps/worker/railway.json`; no domain.
5. **Variables** (Settings → Variables; *shared variables* for keys both use):

| Variable | web | worker | Value |
|---|---|---|---|
| `DATABASE_URL` | ✓ | ✓ | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | ✓ | ✓ | `${{Redis.REDIS_URL}}` |
| `NEXT_PUBLIC_APP_URL` / `APP_URL` | ✓ | ✓ | `https://<web domain>` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET` | ✓ | | Clerk **production** instance |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | ✓ | | Razorpay **live** keys |
| `IMAGEKIT_PUBLIC_KEY` | ✓ | | |
| `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT` | ✓ | ✓ | |
| `OPENAI_API_KEY` | | ✓ | (never `AI_MOCK` in production — the worker refuses the mock there) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM_ADDRESS` | ✓ | ✓ | provider from M11-01 |
| `EMAIL_UNSUBSCRIBE_SECRET` | ✓ | ✓ | same value in both |
| `SUPPORT_EMAIL`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `EMAIL_REPLY_TO`, `EMAIL_DKIM_SELECTOR`, `EMAIL_LOGO_URL` (`https://<web domain>/email-logo.png`), `POSTAL_ADDRESS` | ✓ | ✓ | |
| `ABUSE_HASH_SALT` | ✓ | | long random string |
| `APP_ENV` | ✓ | ✓ | `production` |

   `NEXT_PUBLIC_*` are inlined at **build** time; Railway passes service variables as Docker build args, so a change needs a redeploy.
6. **Webhooks**: Clerk (production instance) → `https://<web domain>/api/webhooks/clerk`, events `user.created`, `session.created`. Razorpay (live mode) → `https://<web domain>/api/webhooks/razorpay`, events `payment.captured`, `payment.failed`, `refund.processed`, `refund.failed`, with a new secret.
7. **Deploys**: both services → *Deploy on push* to `main` (default with GitHub source); watch patterns in each `railway.json` skip unrelated changes.

### Left (needs the Railway / Clerk / Razorpay accounts)

- Create the project and variables above; first deploy.
- Done-when checks: a merge to `main` deploys both; worker processes a test job against Railway Redis and renders a PDF in the container; a deliberately broken migration fails the deploy and the previous version keeps serving.
