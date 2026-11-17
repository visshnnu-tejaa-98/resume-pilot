# User dashboard and My Resumes

**Milestone:** M12 · prd.md §12.1
**Status:** testing

## Scope

- Dashboard: wallet balance + holds, resumes generated, latest ATS scores, recent versions, quick actions (Upload, Generate, Add money)
- **My Resumes:** every version — title, company, job title, latest ATS score (Outdated flag), template, created/updated; actions: Edit, Preview, Score, Compare, Download, Duplicate, Delete
- **Wallet page:** balance, active holds, full history (action, credits, balance after, date, linked resume/payment)
- Credit balance visible in app header on every authenticated page

## Done when

- Dashboard p95 load < 1.5s (non-functional requirement §15)

## What was built (m12)

- **Dashboard:**
  - The balance card shows credits held by running actions.
  - New "Tailored versions" count.
  - New "Recent versions" list with score chips (Outdated flag included).
  - Existing: best ATS score, recent resumes, credit activity, and the Upload / Tailor / Add money actions.
- **My Resumes:**
  - Added a Created column and a Compare action (when the version has a job and a source).
  - "Download" is now labelled "Preview / PDF".
  - **Fixed:** the template column showed "Classic" for every version; it now shows the saved template.
- **Wallet history:** each row links to what it's for: the resume made or scored, the job analysed, or the top-up's payment page (`getWalletPage` returns `versionId` / `jdId` / `orderId`).
- **Header balance:** the pill on every authenticated page already existed.

## How to test

- `admin-insights.test.ts` "wallet history links a purchase to its order".
- Manual: check the dashboard with and without versions, and each My Resumes action.
- **p95 < 1.5 s:** must be measured on the deployed app (m13 load test). The dashboard is one parallel batch of indexed queries.
