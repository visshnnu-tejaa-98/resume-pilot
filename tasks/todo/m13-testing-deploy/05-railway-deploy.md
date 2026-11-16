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
