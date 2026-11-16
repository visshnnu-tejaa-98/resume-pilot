# Resume Pilot

SaaS app that turns a user's existing resume into job-tailored, ATS-optimised versions without inventing anything. Full spec: [prd.md](prd.md) (v2.3). Progress is tracked in [tasks/](tasks/README.md) — a task's folder (`todo`/`testing`/`done`) is its status.

## Stack

- **Web + API:** Next.js (App Router), TypeScript, tRPC at `/api/trpc`
- **UI:** Tailwind CSS, React Hook Form + Zod, Zustand (editor state)
- **Auth:** Clerk (Google, LinkedIn, email)
- **DB:** PostgreSQL + Drizzle ORM
- **Jobs:** BullMQ on Redis, run by a separate `apps/worker` (AI calls, OCR, PDF, email — all too slow/heavy for serverless)
- **AI:** OpenAI Responses API with Structured Outputs
- **File processing:** Tesseract.js (OCR), pdfjs-dist (PDF text layer), node-latex-parser (.tex), mammoth (.docx), file-type (magic-byte validation)
- **PDF export:** Puppeteer (headless Chromium) — renders the same HTML template used for web preview
- **Storage:** ImageKit (private files, short-lived signed URLs) via `packages/storage` — the only package that talks to ImageKit
- **Payments:** Razorpay Orders (one-time wallet top-ups, no subscriptions)
- **Email:** Nodemailer over a generic SMTP provider (`SMTP_*` env vars) for transactional and campaign email, React Email for templates
- **Testing:** Vitest (unit/integration), Playwright (E2E + PDF-vs-preview visual regression)
- **Observability:** deferred for now — no Sentry/log/alarm setup until it's back in scope (see `tasks/todo/m13-testing-deploy/04-sentry-observability.md`)
- **Hosting:** Railway — web and worker as two services built from Dockerfiles in this monorepo, plus Railway Postgres and Railway Redis. Secrets are Railway service variables. No AWS, no IaC app
- **Monorepo:** Turborepo + pnpm

## Monorepo layout

```
apps/web/              Next.js: pages, tRPC route, webhooks
apps/worker/           BullMQ processors + Puppeteer + scheduler
packages/database/     Drizzle schema, migrations, client
packages/trpc/         routers, procedures (public/auth/admin), context
packages/services/     user, resume, jd, generation, ats, credits, payment, email, admin
packages/validators/   Zod: resume 2.0, jd analysis, ats, credits
packages/ai/           openai client, prompts, schemas, grounding check, token estimator
packages/credits/      estimate, hold, capture, release, pricing config
packages/file-processing/ latex, pdf, docx, images
packages/storage/      ImageKit wrapper (upload, signed URL, delete)
packages/resume-templates/ 5 templates, shared HTML renderer, print CSS, fonts
packages/emails/       React Email templates
```

## Non-negotiable invariants

- **Grounding check (§8.3):** every AI-generated resume is validated by deterministic code — companies, titles, dates, skills and numbers must trace back to the source version by id. The AI can rephrase/reorder/select; it can never add a fact. Treat this as a hard gate, not a nice-to-have, in any code touching generation.
- **Credits: estimate → hold → capture (§3.4):** every paid AI action (JD analysis, generation, ATS scoring) shows an estimate, places a hold, then captures only the actual cost on success and releases the rest. Failures release the hold in full. Never charge more than the estimate shown to the user.
- **Versioning (§8.5):** the original upload and every generated resume are separate, immutable-once-saved rows (`resume_versions`). Nothing is overwritten by AI; edits to the original never retroactively change already-generated versions (`parentVersionId` snapshots the source).
- **Prompt injection (§8.4):** resume and JD text are data, never instructions, in any AI prompt. The grounding check is the real backstop even if a model is tricked.
- **Idempotency:** every credit hold, email send and webhook handler (Razorpay, Clerk) carries an idempotency key — retries and duplicate webhooks must never double-charge or double-send.
- **Multi-tenancy:** every tRPC procedure resolves the user server-side and filters by `userId`; admin procedures use a separate `adminProcedure`. Never trust a client-supplied user/role.

## Open decisions (see prd.md §16.4)

Top-up pack amounts between ₹1,000–5,000, markup multiplier, Railway service sizing, sender domain + SMTP provider, email log retention period, inactive-nudge timing. Don't hardcode values for these — keep them in `pricing_config` / `credit_packages` / env config so they can change without a deploy.


## Reference

- check tasks/ to check the seperated small taskes to track the application development
- Check design/ to check the Figma design of the application UI

