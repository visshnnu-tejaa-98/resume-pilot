# Sentry + observability wiring

**Milestone:** M13 · prd.md §15
**Status:** todo

## Scope

- Sentry SDK in `apps/web` and `apps/worker`, capturing unhandled errors, failed AI jobs, webhook failures — scrub resume/JD content from error context (PII)
- Structured logging (e.g. pino) shipped to CloudWatch
- AI cost and failure dashboards (feeds admin dashboard, m12)

## Done when

- A deliberately thrown error in a worker job shows up in Sentry with job/user context but no resume/JD text
