# Load and security tests

**Milestone:** M13 · prd.md §15, §16.2.5, §16.2.14
**Status:** todo

## Scope

- Load test: 20 parallel requests against a limited balance never overspend (acceptance criterion 16.2.5)
- Security: server-side auth on every tRPC procedure, magic-byte checks, ImageKit signed-URL expiry and private files (unsigned URL doesn't resolve), ImageKit private key never in client bundles, secrets in env only, Razorpay/Clerk webhook signature verification
- Cross-tenant isolation test: user A cannot read user B's resumes, files, JDs, reports or ledger (acceptance criterion 16.2.14)
- Rate limit tests: 10 AI actions/min/user, 20 uploads/day/user, per-IP limits on public endpoints

## Done when

- All items above have an automated test (Vitest/Playwright) in CI, not just manual verification
