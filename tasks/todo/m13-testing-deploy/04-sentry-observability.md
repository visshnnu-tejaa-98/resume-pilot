# Sentry + observability wiring

**Milestone:** M13 · prd.md §15
**Status:** deferred: out of Phase 1 scope as of prd.md v2.3. Don't start it until it's brought back in scope.

## Scope

- Sentry SDK in `apps/web` and `apps/worker`, capturing unhandled errors, failed AI jobs, webhook failures — scrub resume/JD content from error context (PII)
- Structured logging (e.g. pino); Railway collects stdout, so a separate log shipper is only needed if Railway's logs aren't enough
- Alerting on error spikes and failed jobs

The AI cost and failure views in the admin dashboard (M12-02) read `ai_jobs` directly and don't depend on this task.

## Done when

- A deliberately thrown error in a worker job shows up in Sentry with job/user context but no resume/JD text
