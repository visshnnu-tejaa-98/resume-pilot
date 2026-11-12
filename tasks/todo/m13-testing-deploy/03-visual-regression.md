# Visual regression (PDF vs preview)

**Milestone:** M13 · prd.md §16.2.12
**Status:** todo

## Scope

- Playwright visual diff suite comparing each of the 5 templates' web preview vs. rendered PDF for a fixed set of sample resumes
- Run in CI on every change to `packages/resume-templates`

## Done when

- Suite catches a deliberately introduced CSS mismatch (e.g. font fallback diff) between preview and PDF
