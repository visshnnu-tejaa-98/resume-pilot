# Resume Pilot — PRD v2.3

Nov 12, 2026 · @Visshnnu Tejaa

Version 2.0 replaces the ₹20-per-generation wallet with a credits model: users add money to a wallet, receive credits, and spend them on paid AI actions — each metered, shown before it runs, and charged only on success. It also fixes the data-model gaps found in v1.1 and settles storage, rendering and API architecture.

Version 2.1 adds email (section 13): the emails users receive, admin campaigns, marketing preferences and unsubscribe, the email log, and the admin pages that manage them.

Version 2.2 records decisions on referral rewards (100 credits each to referrer and new user), bonus top-up packs, a 6-month refund window, no GST for now, AWS hosting, S3 instead of ImageKit, Nodemailer for email, and postpones gift codes.

Version 2.3 (Nov 16, 2026) drops AWS entirely: hosting moves to Railway (web, worker, Postgres, Redis), file storage moves to ImageKit, email is Nodemailer over a generic SMTP provider for both transactional and campaign sends (no SES/SNS event pipeline), and observability (Sentry, logs, alarms) is deferred out of Phase 1.

## 0. What changed from v1.1

| Area                             | v1.1                                   | v2.0                                                                                                                                    |
| -------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Monetisation                     | ₹500 wallet top-up, ₹20 per generation | Top-up packs from ₹500 (10,000 credits) to ₹5,000, larger packs with bonus credits; every AI action costs credits based on actual usage |
| Subscriptions                    | P1, pricing undecided                  | None. Wallet top-ups only                                                                                                               |
| Charged actions                  | Generation only                        | JD analysis, generation, ATS score + report (upload and extraction are free)                                                            |
| Credit expiry                    | n/a                                    | Credits never expire                                                                                                                    |
| ATS score                        | Returned by the generation call        | Separate action with its own report; can be re-run after edits; computed by deterministic code from AI-extracted matches                |
| Original vs generated comparison | Undefined cost                         | Supported; charged as ATS scoring runs                                                                                                  |
| File storage                     | Unspecified                            | ImageKit (private files, short-lived signed URLs) — v2.3                                                                                |
| API layer                        | Express + tRPC                         | tRPC inside Next.js App Router; separate worker for background jobs                                                                     |
| PDF                              | React PDF or browser                   | HTML templates for web view; Puppeteer renders the same HTML to PDF, stored in ImageKit                                                 |
| Resume schema                    | Gaps in ids, ordering, metadata        | Schema 2.0 with ids everywhere, section order/visibility, extraction metadata, provenance, parent version                               |
| Job description                  | No limit                               | Max 30,000 characters                                                                                                                   |
| Prompt injection                 | Not covered                            | JD and resume text treated as data; facts can never be altered, but if user manually updates, it is acceptable                          |
| Email (v2.1)                     | Not covered                            | 6 transactional + 2 marketing emails sent with Nodemailer, admin campaigns, preferences, one-click unsubscribe, email log               |
| Hosting (v2.3)                   | Undecided                              | Railway (v2.2's AWS plan dropped)                                                                                                       |

## 1. Product overview

Resume Pilot (repo name: resume-pilot) is a SaaS web app that turns a user's existing resume into job-specific, ATS-optimised versions without inventing anything. Users upload a resume (LaTeX, PDF, DOCX or image), review the extracted data, paste a job description, and get a tailored resume plus a separate ATS score and report. Users add money to their wallet and spend the credits on generation, JD analysis and ATS scoring; upload and extraction are free.

**Vision:** "One Resume. Every Opportunity. Tailored with AI."

**Core principle:** preserve the candidate's original facts, create a separate version for every tailoring, and charge credits only for AI work that completes successfully.

### 1.1 Goals

1. Make tailoring a resume to a job a 2-minute task.
2. Improve keyword relevance without fabricating experience.
3. Give users a transparent, pay-for-what-you-use credit model.
4. Keep the original resume and every generated version intact and recoverable.
5. Keep AI cost per action measurable and below the credit price charged.

## 2. Roles and wallet

Admin is a system role. Every customer has the same account: a wallet that holds credits. There are no monthly or yearly plans — users add money when they need more credits.

| Item           | Rule                                                                                                                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signup         | Wallet created automatically with 0 credits. Applying a coupon adds its credits (launch coupon EARLYBIRD = 500); applying a referral code gives 100 credits to the new user and 100 to the referrer |
| Add money      | Razorpay one-time payment; packs from ₹500 = 10,000 credits up to ₹5,000 (see below)                                                                                                                |
| Spend          | Credits deducted per paid AI action (section 3)                                                                                                                                                     |
| Expiry         | Credits never expire                                                                                                                                                                                |
| Repeat top-ups | Unlimited                                                                                                                                                                                           |

- Top-up packs are config (`credit_packages`), so packs and bonuses can change without code changes:

| Pack                      |   Credits |                      Bonus |
| ------------------------- | --------: | -------------------------: |
| ₹500                      |    10,000 |                          — |
| ₹1,000                    |    21,000 |                 1,000 (5%) |
| Larger packs up to ₹5,000 | [CREDITS] | Bonus grows with pack size |

- The exact amounts and credits for packs between ₹1,000 and ₹5,000 are still to be set (16.4).
- The wallet holds credits, not rupees. The rupee amount lives on the payment record.
- Every user has the same features; credits are the only limit.

### 2.1 Coupon and referral codes

New wallets start at 0 credits. A user gets free credits only by applying a code.

| Code type | Who creates it                    | Credits                                                            | Example   |
| --------- | --------------------------------- | ------------------------------------------------------------------ | --------- |
| Coupon    | Admin                             | Set per coupon (EARLYBIRD = 500)                                   | EARLYBIRD |
| Referral  | Every user gets one automatically | 100 to the new user (referee) and 100 to the code owner (referrer) | RP-7K3XQ  |

- Codes are case-insensitive ("earlybird" works).
- One code per account, ever: a user who applied EARLYBIRD can't also apply a referral code, and vice versa.
- A user can't apply their own referral code.
- When a referral code is applied, both credits are granted in one transaction: a `referral_credit` ledger entry for the new user and one for the referrer, each linked to the redemption. The referrer can earn from any number of referrals.
- If the abuse checks flag a referral, the new user still gets their 100 credits but the referrer's 100 are held until an admin approves the referral.
- Codes can be applied at signup or later from the Wallet page.
- Coupons have optional limits: total redemptions, expiry date, active/inactive.
- Redemption is atomic and unique per (user, code); credits arrive as a `coupon_credit` ledger entry linked to the redemption.
- Basic abuse checks: rate-limit code attempts (5 per hour per user), and flag many referrals from the same IP or device for admin review.

### 2.2 Admin

- Manage users and suspension.
- View wallets, credit ledger, holds, payments and refunds.
- Grant or deduct credits manually (reason required, written to audit log).
- Configure top-up packs, credit value, markup and minimum charge per action.
- Create, limit and disable coupon codes; view redemptions and referrals.
- Manage templates.
- Monitor AI usage: tokens, cost in ₹, failures, latency, by action and model.
- Manage email: preview and test templates, switch marketing emails on or off, send campaigns, and view the email log (section 13).

## 3. Credits model

Credits are a platform unit, not raw OpenAI tokens. Every paid AI action shows an estimate first, holds that many credits, then charges the actual usage — never more than the estimate — and releases the rest. Failed actions release the full hold.

### 3.1 Why platform credits, not raw tokens

- ₹500 for 10,000 raw OpenAI tokens would buy only 1–2 generations; credits let us price sensibly.
- OpenAI prices and models change; the credit rate absorbs that without repricing packs.
- One unit covers every AI cost: LLM tokens and retries.

### 3.2 Charged actions

| Action                                          | When it runs                                            | Charged                                       | Reuse rule                                                |
| ----------------------------------------------- | ------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------- |
| Resume extraction                               | After upload                                            | No                                            | use tessaract.js to get the data from uplaoded file       |
| JD analysis                                     | First time a JD is used                                 | Yes                                           | Cached per JD; generation and scoring reuse it at no cost |
| Resume generation                               | User confirms Generate                                  | Yes                                           | Each run is a new version                                 |
| ATS score + report                              | User clicks Score (original, generated, or after edits) | Yes                                           | Same resume content + same JD = cached result, free       |
| Original vs generated comparison                | User clicks Compare                                     | Yes, as two ATS scores (either may be cached) | —                                                         |
| Template switch, editing, PDF export, duplicate | Any time                                                | No                                            | No AI involved                                            |

The cache key for scoring is a hash of the resume content JSON + JD id, so re-scoring an unchanged resume never costs credits twice.

### 3.3 How credits are calculated

```latex
\text{credits} = \left\lceil \frac{\text{AI cost (INR)} \times \text{markup}}{\text{credit value (INR)}} \right\rceil
```

- **Credit value** = ₹500 / 10,000 = ₹0.05 per credit (from the base pack). Bonus packs make credits cheaper (₹1,000 / 21,000 ≈ ₹0.048), so the markup must cover the pack with the biggest bonus.
- **AI cost (INR)** = input tokens × input price + output tokens × output price (+ cached-input pricing), converted at a configured USD→INR rate.
- **Markup** = configurable multiplier (admin setting) covering Razorpay fees, infrastructure and margin.
- A **minimum charge per action** (configurable) stops very small calls from rounding to \~0.
- All model prices, the exchange rate, markup and minimums live in `pricing_config`, versioned, so every charge records which config it used.

### 3.4 Estimate → hold → capture

1. Before the call, the server estimates credits from input size (resume JSON + JD length, counted with the model's tokenizer) plus a maximum output budget for that action.
2. The UI shows the estimate: "This will use up to 640 credits. Balance: 9,360."
3. On confirm, the server atomically checks **available balance = balance − active holds** and creates a hold for the estimate. Insufficient balance = rejected, with a Buy credits prompt.
4. The AI job runs. The output token cap equals the budget used in the estimate, so actual cost can't exceed it.
5. On success (output validated and saved), the hold is captured at the actual amount and the remainder released — one ledger debit.
6. On failure, timeout or validation error, the hold is released in full. Holds also expire after 15 minutes as a safety net.

Every hold carries an idempotency key, so a retried request or double click never creates two charges.

### 3.5 Balance, grants and ledger

- One wallet per user, holding a single credit balance.
- Credits come from top-ups, coupon or referral codes, and admin adjustments. Nothing expires.
- The ledger (`credit_ledger`) is append-only: purchase, capture, refund, admin adjustment, coupon credit, referral credit. The cached balance is updated in the same database transaction as each ledger row.
- Users see: balance, credits on hold, history with action, credits, balance after, date.

### 3.6 Unit economics to set before launch

- Measure average AI cost per action on a test set of 50 resumes × JDs.
- Set markup so every top-up pack, including the largest bonus pack, still covers AI cost + fees.
- Publish typical costs on the Pricing page ("A typical generation uses about N credits") once measured.

## 4. Pages, authentication and authorisation

### 4.1 Pages

| Area   | Pages                                                                                                                                                                                                                 |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public | Landing, Pricing (top-up packs, typical credits per action), How It Works, About, Contact, Privacy Policy, Terms, Refund Policy, Login, Sign-up, Email preferences / Unsubscribe (token link, no sign-in)             |
| User   | Dashboard, My Resumes, Upload Resume, Resume Information (review), Generate Resume, Resume Editor, ATS Report, Compare, Wallet (balance, add money, apply code, history), Profile, Settings (including Notifications) |
| Admin  | Overview, Users, AI Jobs & Logs, Coupons & Referrals, Email Templates, Campaigns, Email Log, Credit Ledger, Payments, Pricing Config, Templates, Audit Log, App Settings                                              |

The credit balance is visible in the app header on every authenticated page.

### 4.2 Authentication (Clerk)

- Google OAuth, LinkedIn OAuth, email.
- Custom-styled sign-in and sign-up screens; redirect to Dashboard after login.
- Sign-up includes an unticked marketing-email consent checkbox (13.5).
- Verification and password-reset emails are sent by Clerk.
- Duplicate-email handling and account linking via Clerk.
- A Clerk `user.created` webhook creates the app user, an empty wallet (0 credits) and the user's referral code (idempotent on Clerk user id).

### 4.3 Authorisation

- Role (`user` | `admin`) is stored in the database and Clerk private metadata; never writable from the client.
- Every tRPC procedure resolves the user server-side and filters by `userId`; admin procedures use a separate `adminProcedure`.
- Every AI action verifies ownership of the resume, version and JD it touches.
- Wallet balances and holds are only read and changed server-side.

## 5. Upload and extraction

### 5.1 Formats and limits

| Format | Extensions        | Extraction                                                         |
| ------ | ----------------- | ------------------------------------------------------------------ |
| LaTeX  | .tex              | Source parsing (sections, lists, \\href); no compile needed        |
| PDF    | .pdf              | Text layer first; Tesseract.js OCR for scanned pages               |
| Word   | .docx             | Document parsing (e.g. mammoth)                                    |
| Image  | .png, .jpg, .jpeg | Tesseract.js OCR; up to 5 images per upload as pages of one resume |

- Max file size: 10 MB. Max 5 pages / images.
- Validate by magic bytes, not just extension.
- Duplicate detection by SHA-256 of the file per user.
- Low-quality images: if Tesseract's average word confidence is below a set threshold (e.g. 60%), the upload is rejected and the user is asked for a clearer file.

### 5.2 Storage (ImageKit)

- Uploads and generated PDFs are stored in ImageKit as **private files** (`isPrivateFile: true`), under per-user folders (`/users/<userId>/uploads/`, `/users/<userId>/pdfs/`). File names are random ids, never the user's original file name.
- Files are served only through short-lived **signed URLs** (5 minutes), generated server-side after an ownership check. Unsigned URLs to private files don't resolve.
- The server uploads to ImageKit with the private API key; the browser never gets write access or client-side upload tokens. The browser sends the file to our API, which validates it, then uploads.
- Every stored file records both its path and ImageKit `fileId` (`resumes.storage_file_id`, `generated_files.storage_file_id`), because deletion needs the `fileId`.
- Original uploads are kept 30 days, then deleted by a **daily worker job** that finds `resumes` rows older than 30 days and deletes their files by `fileId` (ImageKit has no lifecycle rules). Extracted JSON is kept until the user deletes it.
- The ImageKit private key lives only in server-side environment variables (web and worker), never in client bundles.
- All ImageKit calls go through `packages/storage`, so swapping providers later touches one package.

### 5.3 Extraction workflow

1. User uploads; API validates type, size and hash.
2. File stored in ImageKit; `resumes` row created with status `uploaded`.
3. Worker gets the raw text: LaTeX parser, DOCX parser, PDF text layer, or Tesseract.js OCR for images and scanned PDFs.
4. The text is converted to Resume JSON 2.0 (OpenAI Structured Outputs). This step is free to the user; its cost is a platform cost, kept in check by upload rate limits.
5. Zod validates; confidence flags written to `extractionMeta` (low OCR confidence on a line also flags the fields from it).
6. Saved as the resume's original version (`kind = original`).
7. User lands on the review screen with uncertain fields highlighted.

Upload and extraction never touch the wallet. Any failure shows an error and a retry option.

## 6. Resume JSON schema 2.0

One canonical schema is used for extraction, editing, generation, scoring, rendering and PDF export. Version 2.0 fixes the v1.1 gaps: ids on every item, section order and visibility, defined custom sections, a fixed date format, extraction confidence and provenance.

### 6.1 Resume content

```json
{
  "schemaVersion": "2.0",
  "personalInfo": {
    "firstName": "",
    "lastName": "",
    "headline": "",
    "email": "",
    "phone": "",
    "location": "",
    "links": [
      {
        "id": "",
        "type": "linkedin|github|portfolio|other",
        "label": "",
        "url": ""
      }
    ]
  },
  "summary": { "text": "" },
  "workExperience": [
    {
      "id": "",
      "company": "",
      "designation": "",
      "employmentType": "full-time|part-time|contract|internship|freelance|null",
      "location": "",
      "startDate": { "value": "YYYY-MM", "raw": "" },
      "endDate": { "value": "YYYY-MM|null", "raw": "" },
      "isCurrent": false,
      "bullets": [
        { "id": "", "text": "", "kind": "responsibility|achievement" }
      ],
      "skillsUsed": []
    }
  ],
  "education": [
    {
      "id": "",
      "institution": "",
      "degree": "",
      "fieldOfStudy": "",
      "location": "",
      "startDate": { "value": "", "raw": "" },
      "endDate": { "value": "", "raw": "" },
      "grade": { "value": "", "scale": "CGPA/10|%|GPA/4|other" },
      "bullets": [{ "id": "", "text": "" }]
    }
  ],
  "skills": [{ "id": "", "category": "", "items": [{ "id": "", "name": "" }] }],
  "projects": [
    {
      "id": "",
      "name": "",
      "role": "",
      "url": "",
      "startDate": { "value": "", "raw": "" },
      "endDate": { "value": "", "raw": "" },
      "bullets": [{ "id": "", "text": "" }],
      "technologies": []
    }
  ],
  "certifications": [
    {
      "id": "",
      "name": "",
      "issuer": "",
      "issueDate": { "value": "", "raw": "" },
      "expiryDate": { "value": "", "raw": "" },
      "credentialId": "",
      "credentialUrl": ""
    }
  ],
  "customSections": [
    {
      "id": "",
      "title": "",
      "items": [
        {
          "id": "",
          "heading": "",
          "subheading": "",
          "date": { "value": "", "raw": "" },
          "bullets": [{ "id": "", "text": "" }]
        }
      ]
    }
  ],
  "layout": {
    "sectionOrder": [
      "summary",
      "workExperience",
      "projects",
      "skills",
      "education",
      "certifications",
      "custom:<id>"
    ],
    "hiddenSections": [],
    "hiddenItems": []
  }
}
```

### 6.2 Metadata stored beside the content (not sent to templates)

```json
{
  "extractionMeta": {
    "workExperience[id=we_1].startDate": {
      "confidence": "low",
      "reason": "Only year found",
      "reviewed": false
    }
  },
  "provenance": {
    "we_1.bullets[b_3]": {
      "sourceBulletIds": ["b_3"],
      "changeType": "rewritten|reordered|unchanged|merged"
    }
  }
}
```

- **extractionMeta:** one entry per uncertain field (confidence `low` | `medium`, reason, reviewed flag). The review screen blocks generation until every `low` field is reviewed or left as-is on purpose.
- **provenance:** for generated versions, each bullet points to the original bullet ids it came from, so the grounding check (8.3) and the editor's "show original" both work.

### 6.3 Rules

- Ids are short stable strings (`we_1`, `b_3`) generated by the app, never by the model's free text. Ids from the original are kept in generated versions.
- Dates: `value` is `YYYY-MM` or `YYYY` when only the year is known; `raw` keeps what the resume said ("Summer 2021"). `endDate.value = null` with `isCurrent = true` means Present.
- All string fields optional except where the editor requires them: name, one contact method, and company + designation per job.
- Zod schema lives in `packages/validators/resume`; the same schema generates the OpenAI Structured Outputs JSON schema.
- `schemaVersion` is checked on read; migrations are pure functions `migrate_1_0_to_2_0(json)` run lazily and saved back.

## 7. Job descriptions

### 7.1 Input

- Required: JD text, 200 to 30,000 characters (counted after trimming whitespace). Over the limit is blocked in the form and on the server.
- Optional: company name, job title, posting URL (stored only; not fetched in Phase 1).
- JDs are saved per user and reusable across generations and scoring.

After entering the JD, the user clicks **Proceed**. Nothing runs and no credits are used until they confirm in the dialog described in 8.1.

### 7.2 Analysis (charged once per JD, then cached)

The JD analysis is structured output, stored in `jd_analyses` and reused by generation, ATS scoring and comparison:

```json
{
  "jobTitle": "",
  "seniority": "",
  "minYearsExperience": null,
  "requirements": [
    {
      "id": "r1",
      "text": "",
      "type": "skill|tool|qualification|experience|education|responsibility",
      "priority": "required|preferred",
      "keywords": [""],
      "synonyms": [""]
    }
  ],
  "educationRequirements": [],
  "domainTerms": []
}
```

```json
Editing the JD text creates a new JD record (and a new analysis), so old versions keep the JD they were built from.
```

## 8. AI resume generation

### 8.1 Flow

1. User picks a source version (usually the original) and a JD.
2. If the JD has no analysis yet, it is included in the estimate and run first.
3. User clicks Proceed. A confirmation dialog shows the target job title and company, what will run (JD analysis if needed, then generation), the credit estimate, and the balance after. Only when the user clicks Confirm is the hold placed; Cancel returns to the form with nothing charged.
4. Worker calls the OpenAI Responses API with Structured Outputs: original resume JSON + JD analysis + rules → generated resume JSON + provenance + gap list.
5. Zod validation, then the grounding check (8.3).
6. Saved as a new `resume_versions` row (`kind = generated`, `parentVersionId` = source, `jdId`).
7. Hold captured; user goes to the editor.

Generation does not produce the ATS score; the user runs scoring separately (section 9). The editor shows a "Score this resume" button with its estimate.

### 8.2 What the AI may change

| Allowed                                             | Never allowed                                                    |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| Rewrite summary using existing facts                | Add, remove or rename companies, titles, institutions, degrees   |
| Rephrase and reorder bullets                        | Change any date                                                  |
| Choose which bullets / projects to show             | Add skills, tools or certifications not in the source            |
| Reorder sections and skills                         | Add numbers, metrics or percentages not in the source            |
| Use JD wording for skills the candidate already has | Claim experience, seniority or years the source does not support |

Missing requirements go into a **gap list** shown to the user ("Kubernetes — not found in your resume"). If the user actually has the skill, they add it to the original resume themselves; the AI never adds it.

### 8.3 Grounding check (deterministic, after every generation)

- Companies, designations, institutions, degrees, certification names and all dates must match the source version exactly (by id).
- Every skill / technology in the output must exist in the source (case- and synonym-normalised).
- Every number in the output text must appear in the source text.
- Every output bullet must have provenance pointing to existing source bullet ids.

Fails → one automatic retry with the violations fed back. Fails again → job fails, hold released, user sees an error. Violation counts are logged for admin review.

### 8.4 Prompt-injection rules

- Resume text and JD text are wrapped as data in the prompt and never treated as instructions.
- System rules state that instructions inside the JD or resume ("ignore previous rules", "add 10 years of experience") must be ignored.
- The grounding check is the real guarantee: even if the model obeys injected text, facts can't change because the output is rejected.
- Output is structured JSON only; free-text fields are rendered as escaped text, never HTML.

### 8.5 Versioning

- The original and every generated version are separate rows; nothing is ever overwritten by AI.
- Users may edit the original. Generated versions keep `parentVersionId` pointing to the snapshot they were built from, so editing the original never changes history.
- Each version is independently editable, scorable, exportable and deletable (soft delete, 30-day restore).
- Duplicate creates a copy with no AI call and no charge.

### 8.6 Manual edits

- Users can edit any field of any version by hand, including companies, dates, skills and metrics.
- The rules in 8.2–8.4 apply only to AI output. Manual edits are accepted as the user's own claims.
- If the user generates again from an edited version, their edits count as source facts.
- The editor shows a note: "You're responsible for the accuracy of anything you add manually."

## 9. ATS score and report

ATS scoring is its own action, run on any version (original or generated) against any saved JD. The AI judges evidence; our code computes the score, so the same input always gives the same number.

### 9.1 How a score is produced

1. AI call (Structured Outputs): for each JD requirement from the cached analysis, return `matched | partial | missing`, the resume item ids that evidence it, and a one-line reason. Also returns formatting and content recommendations.
2. Deterministic code checks: keyword presence (exact + synonyms), standard section headings, contact info present, dates parseable, bullet length, page count.
3. Score computed in code from 1 + 2 using the weights below.
4. Saved to `ats_reports` with the resume content hash, JD id, scoring-method version and all inputs, then shown to the user.

| Dimension                    | Weight | Computed from                                                                       |
| ---------------------------- | -----: | ----------------------------------------------------------------------------------- |
| Required keyword relevance   |    30% | Required keywords found / total required                                            |
| Skills match                 |    25% | Required skills matched (full = 1, partial = 0.5) + preferred skills at half weight |
| Experience relevance         |    20% | Experience/responsibility requirements matched; years vs minimum                    |
| Education and qualifications |    10% | Education requirements matched                                                      |
| Structure and formatting     |    15% | Deterministic checks in step 2                                                      |

The report states: "Estimated compatibility score. Employers' ATS systems differ; this is not a guarantee."

### 9.2 Report contents

- Overall score, per-dimension breakdown, one-paragraph assessment.
- Matched keywords and skills, each linked to the resume line that proves it.
- Missing keywords and skill gaps (required vs preferred).
- Recommendations: summary, ordering, bullet clarity, formatting.

### 9.3 Re-scoring after edits

- Any edit to a version marks its last report **Outdated** (content hash changed).
- "Re-score" runs a new scoring action with its own estimate and charge. Old reports are kept, so the user sees score history per version.
- Unchanged content + same JD returns the cached report at no charge.

### 9.4 Comparison

- Compare picks two versions (default: original vs a generated version) and one JD.
- Each side uses its cached report if current, otherwise runs scoring (charged). The estimate shows only the parts that need to run.
- The compare view shows both scores, the per-dimension change, keywords gained, and gaps still open. No extra AI call beyond the two scores.

## 10. Editor, templates and PDF

### 10.1 Editor

- Split screen: form editor on the left, live HTML preview on the right (page navigation, zoom).
- Edit every section and item; add, delete, reorder (drag) items and sections; hide sections or items; custom sections.
- "Show original" on any generated bullet uses provenance to show the source text.
- Autosave with debounce; saving changes the content hash and marks the ATS report Outdated.

### 10.2 Templates

Five templates in Phase 1, all available to every plan: Classic (default), Modern, Minimal, Professional, Technical.

- Single-column, standard section headings, selectable text, no text in images, A4 with fixed margins, multi-page.
- Each template is a React component in `packages/resume-templates` that renders Resume JSON to HTML + print CSS.

### 10.3 One renderer for web and PDF

- **Web view:** the template's HTML is rendered in the preview pane, scaled to an A4 page frame.
- **PDF:** the worker renders the same template to an HTML string (server-side), opens it in headless Chromium with Puppeteer, and calls `page.pdf({ format: 'A4', printBackground: true })`.
- Fonts are self-hosted and loaded in both, so preview and PDF match. Page breaks use CSS `break-inside: avoid` on items.
- The PDF is uploaded to ImageKit as a private file; the user downloads via a short-lived signed URL.
- PDFs are cached by (version content hash + template id); an unchanged resume reuses the stored PDF.
- Filename: `Firstname-Lastname-<JobTitle>.pdf`.
- PDF export is free (no AI).

## 11. Payments (Razorpay)

### 11.1 Wallet top-up (one-time payment)

1. User clicks Add money → picks a top-up pack (e.g. ₹500 = 10,000 or ₹1,000 = 21,000 credits).
2. Server creates a Razorpay order (amount in paise, `notes.packageId`, `notes.userId`) and a `payments` row (`created`).
3. Razorpay Checkout opens; user pays.
4. Client sends `razorpay_payment_id`, `order_id`, `signature`; server verifies the signature.
5. Webhook `payment.captured` (also signature-verified) confirms.
6. Whichever of 4 or 5 arrives first grants credits; the grant is keyed on the Razorpay payment id (unique), so it happens exactly once.
7. Ledger `purchase` row written; balance shown.

### 11.2 Refunds

- Credit pack refund (admin-initiated, within 6 months of purchase): allowed only for unused purchased credits; the ledger debits them before the Razorpay refund is issued.
- For bonus packs, the refund is pro rata: unused credits × (amount paid ÷ credits in the pack). Coupon and referral credits are never refunded.
- AI failures never need refunds: holds are released automatically.

### 11.3 Money rules

- All amounts stored as integer paise; credits as integers.
- Unique constraints on Razorpay order id and payment id.
- Webhook handler is idempotent and stores the raw event (`payment_events`).
- No GST is charged for now. Prices are shown as final amounts and a receipt is issued per payment. If GST registration becomes necessary, pricing and receipts will be revised.

## 12. Dashboards

### 12.1 User dashboard

- Wallet credit balance and credits on hold.
- Resumes generated, latest ATS scores.
- Recent versions; quick actions: Upload, Generate, Add money.

**My Resumes** lists every version: title, company, job title, latest ATS score (with Outdated flag), template, created, updated. Actions: Edit, Preview, Score, Compare, Download, Duplicate, Delete.

**Wallet page:** balance, active holds, full history (action, credits, balance after, date, linked resume or payment).

### 12.2 Admin dashboard

- Users: total, paying (at least one top-up), signups over time.
- AI: actions by type, success / failure rate, average latency, tokens, AI cost in ₹, credits charged, margin per action type.
- Grounding-check violations per 100 generations.
- Revenue: wallet top-ups, refunds.
- Credits: issued (purchased, coupon, referral, admin) vs consumed; outstanding liability.
- Email: sent, delivered, opened, bounced, unsubscribed (last 30 days).
- User detail: profile, ledger, payments, AI jobs, versions (metadata only; resume content visible only with logged admin access).

## 13. Email

Resume Pilot sends two kinds of email. **Transactional** emails confirm something the user did or something that happened to their money; they always send. **Marketing** emails (reminders, product news) go only to users who agreed to them and can be switched off in one click.

`promo_code` (personal gift codes) is postponed with gift codes (16.1).

Sign-in, email verification and password-reset emails are sent by Clerk, not by us. Their look is set in the Clerk dashboard to match the templates below.

### 13.1 Email catalogue

| Template key       | Type                        | Trigger                                                                    | Content                                                                                                                                            | Sent at most                                               |
| ------------------ | --------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `welcome`          | Transactional               | Clerk `user.created` processed                                             | Welcome; wallet starts at 0 credits; apply EARLYBIRD for 500 credits or a friend's referral code for 100; three steps to the first tailored resume | Once per user                                              |
| `code_applied`     | Transactional               | `code_redemptions` row created                                             | Credits added, code used, new balance, what the credits cover                                                                                      | Once per redemption                                        |
| `referral_reward`  | Transactional               | Referrer's 100 credits granted                                             | "Your friend joined with your code", credits added, new balance, share link                                                                        | Once per referral                                          |
| `recharge_success` | Transactional               | `purchase` ledger row written                                              | Receipt: amount, credits, payment id, date, new balance, invoice link                                                                              | Once per Razorpay payment id                               |
| `recharge_failed`  | Transactional               | Razorpay `payment.failed`                                                  | Amount, reason in plain words, "any money taken is returned automatically", Try again link                                                         | Once per Razorpay payment id                               |
| `recharge_pending` | Transactional               | Payment neither captured nor failed 10 minutes after the order was created | "Don't pay again", what happens next, time limit, Check status link                                                                                | Once per payment                                           |
| `inactive_nudge`   | Marketing (reminders)       | No sign-in for 30 days                                                     | Balance waiting, last activity, link back                                                                                                          | Once every 30 days; stops after 3 nudges without a sign-in |
| `new_features`     | Marketing (product updates) | Admin campaign                                                             | Up to three feature blocks, each with a link                                                                                                       | Once per campaign                                          |

- Every send has an idempotency key of template key + source id (user, redemption, payment or campaign), so duplicate webhooks or retries never send twice.
- Transactional emails go to suspended users only when they concern money (recharge emails). Marketing never goes to suspended users.
- Inactive nudges skip users with no credits left _and_ no top-up ever, after the first nudge.

### 13.2 Sending pipeline

1. The event (ledger row, redemption, webhook, scheduler or campaign) enqueues an `email` job on BullMQ with the idempotency key.
2. The worker checks the user's preferences and the suppression list (marketing only for preferences; both kinds for hard bounces).
3. The template renders to HTML and plain text with the merge data.
4. Nodemailer sends it over SMTP to the configured provider (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`); an `email_messages` row stores the provider message id and status `sent`.
5. If the SMTP server rejects the message outright (a 5xx response), the row is marked `failed`, and a permanent recipient rejection adds the address to `email_suppressions` as a hard bounce.

Plain SMTP only tells us whether the provider **accepted** a message. It doesn't report later delivery, asynchronous bounces, spam complaints, opens or clicks. Phase 1 therefore tracks sent, failed and unsubscribed only. A provider event webhook can be added later without schema changes (`email_events` is provider-neutral).

- Transactional and marketing emails run on separate queues so a large campaign never delays a receipt.
- Campaign sends are throttled (configurable per minute) to protect sender reputation.
- Failed sends retry with backoff (3 attempts), then are marked failed in the log.
- A daily scheduler job finds inactive users; a delayed job per order checks for pending payments.

### 13.3 Templates

- Built with React Email in `packages/emails`, one component per template key, versioned in code.
- Table-based layout, inline styles, 600 px wide, system fonts as fallbacks, works in Gmail, Outlook and Apple Mail in light and dark mode.
- Every email has a plain-text version.
- Shared header and footer. The marketing footer carries the unsubscribe and preferences links; the transactional footer says it's a service email about the user's account.
- Every footer includes the support email and registered business address.
- Templates are rendered to HTML with React Email's `render()` and passed to Nodemailer with the plain-text version and unsubscribe headers.
- Merge fields: `{first_name}`, `{balance}`, `{credits}`, `{amount}`, `{payment_id}`, `{referral_code}`, `{segment_reason}`.
- Admins can't edit template bodies in Phase 1. They can preview each template with sample data, send a test to themselves, switch marketing templates on or off, and set the subject and preheader of a campaign.

### 13.4 Campaigns

In Phase 1 an admin can send `new_features` to a chosen group of users. More campaign templates can be added later.

1. **Audience:** combine filters (all must match): signed in within N days, no sign-in for N days, tailored N or more resumes, never topped up, topped up at least once, has used a code, joined before / after a date, balance below N.
2. **Exclusions (always applied):** users without consent for product updates, unsubscribed, suppressed (hard bounce or spam complaint), suspended, or with unverified email. The live count shows recipients after exclusions and how many were left out.
3. **Message:** subject, preheader and up to three feature blocks, with merge fields and a live preview using a sample user.
4. **When:** send now or schedule a date and time (IST).
5. **Confirm:** a dialog shows template, recipient count and time; sending is written to the audit log.

- Statuses: draft, scheduled, sending, sent, cancelled. A scheduled campaign can be cancelled before it starts.
- The audience is frozen when sending starts; users who opt out during a send are skipped.
- Sends are throttled (configurable per minute) to stay within the SMTP provider's sending limits.
- "Send test to me" sends the rendered email to the admin's own address with their own merge data.

### 13.5 Preferences and unsubscribe

- Marketing consent is asked at sign-up with an unticked checkbox, as required for consent under the DPDP Act.
- **Settings → Notifications** has two switches: Reminders (inactive nudge) and Product updates. An Offers switch is added when promo emails ship. Transactional emails are listed there as always on.
- Every marketing email has a one-click unsubscribe link (signed token, no sign-in needed) and `List-Unsubscribe` + `List-Unsubscribe-Post` headers, which Gmail and Yahoo expect from bulk senders.
- The public unsubscribe page confirms the change and lets the user turn individual categories back on or off.
- Unsubscribes take effect immediately, including for campaigns already sending.
- A hard bounce (permanent SMTP rejection) suppresses the address for all email; a spam complaint, once a source for them exists, suppresses marketing. Hard bounces on transactional emails are shown on the admin user page.

### 13.6 Log, metrics and retention

- Every send is an `email_messages` row: user, template, campaign (if any), status, provider message id, timestamps, merge data (not the rendered body).
- Admin views show recipients masked (`as***@gmail.com`); the full address is on the user detail page.
- Delivery, open and click rates aren't available in Phase 1 (plain SMTP reports none of them).
- Messages and events are kept for [RETENTION PERIOD], then deleted.
- The admin dashboard shows sent, failed, hard-bounced (SMTP rejections) and unsubscribed for the last 30 days, overall and per template.

### 13.7 Sending domain

- Send from [SENDER EMAIL] on a subdomain (e.g. `mail.<domain>`) through the chosen SMTP provider; replies go to [SUPPORT EMAIL].
- Check the provider's sending limits (daily and per-second) before launch and set the campaign throttle below them.
- SPF, DKIM (per the provider's DNS records) and DMARC must be set up and verified before launch; the admin Email templates page shows their status.

## 14. Architecture

### 14.1 Stack

| Layer           | Choice                                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Web app + API   | Next.js App Router, TypeScript; tRPC mounted at `/api/trpc` via the fetch adapter                                                         |
| Webhooks        | Next.js route handlers (`/api/webhooks/razorpay`, `/api/webhooks/clerk`) reading the raw body for signature checks                        |
| UI              | Tailwind CSS, custom design system, React Hook Form, Zod, Zustand (editor state)                                                          |
| Auth            | Clerk                                                                                                                                     |
| Database        | PostgreSQL + Drizzle ORM                                                                                                                  |
| Background jobs | BullMQ on Redis, run by `apps/worker` (extraction + OCR, JD analysis, generation, scoring, PDF, email)                                    |
| AI              | OpenAI Responses API with Structured Outputs; Tesseract.js OCR (in the worker) for images and scanned PDFs                                |
| PDF text layer  | pdfjs-dist, used before falling back to Tesseract.js OCR for scanned pages                                                                |
| LaTeX parsing   | node-latex-parser                                                                                                                          |
| File validation | file-type, for magic-byte checks on every upload                                                                                          |
| PDF             | Puppeteer (headless Chromium) in the worker                                                                                               |
| File storage    | ImageKit (private files, signed URLs; 30-day upload cleanup by a worker job)                                                              |
| Payments        | Razorpay Orders (one-time wallet top-ups)                                                                                                 |
| Email           | Nodemailer over a generic SMTP provider (transactional + campaigns); React Email for templates                                            |
| Error tracking  | Deferred from Phase 1 (see 14.5)                                                                                                           |
| Testing         | Vitest (unit/integration), Playwright (visual regression + E2E)                                                                            |
| Hosting         | Railway (see 14.4), web and worker deployed from Dockerfiles                                                                               |
| Monorepo        | Turborepo + pnpm                                                                                                                          |

Why a separate worker: AI calls, Tesseract OCR and Puppeteer take 10–60 s and need Chromium, which doesn't fit serverless request limits. The web app enqueues jobs; the client polls (or subscribes via SSE) for job status.

### 14.2 Monorepo

```text
resume-pilot/
├── apps/
│   ├── web/            Next.js: pages, tRPC route, webhooks
│   └── worker/         BullMQ processors + Puppeteer + scheduler
├── packages/
│   ├── database/       Drizzle schema, migrations, client
│   ├── trpc/           routers, procedures (public/auth/admin), context
│   ├── services/       user, resume, jd, generation, ats, credits, payment, email, admin
│   ├── validators/     Zod: resume 2.0, jd analysis, ats, credits
│   ├── ai/             openai client, prompts, schemas, grounding check, token estimator
│   ├── credits/        estimate, hold, capture, release, pricing config
│   ├── file-processing/ latex, pdf, docx, images
│   ├── storage/        ImageKit wrapper (upload, signed URL, delete)
│   ├── resume-templates/ 5 templates, shared HTML renderer, print CSS, fonts
│   └── emails/         React Email templates, shared header/footer, plain-text versions
├── turbo.json
└── pnpm-workspace.yaml
```

### 14.5 Testing and error tracking

- **Unit / integration tests:** Vitest, across `packages/*` and `apps/*` (grounding check, credits math, pricing config, Zod schemas, tRPC procedures against a test database).
- **E2E and visual regression:** Playwright — full user flows (upload → generate → score) and template PDF-vs-preview visual diffs (acceptance criterion 16.2.12).
- **Error tracking:** deferred from Phase 1. Until it's added, failures are visible through Railway's service logs and the `ai_jobs` / `email_messages` status columns. When added, it must never capture resume or JD content.

### 14.3 Database tables

| Table                   | Purpose                                                                                                                      | Key constraints                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| users                   | App user, Clerk id, role, status                                                                                             | unique clerk_user_id                           |
| resumes                 | One per upload: file ref, hash, status                                                                                       | unique (user_id, file_hash)                    |
| resume_versions         | Original + generated JSONB content, meta, kind, parent_version_id, jd_id, content_hash, template_id                          | FK parent_version_id                           |
| job_descriptions        | JD text (≤30,000 chars), company, title, url                                                                                 | check length                                   |
| jd_analyses             | Cached structured analysis per JD                                                                                            | unique jd_id                                   |
| ai_jobs                 | Every AI action: type, status, model, tokens, cost_paise, credits_estimated, credits_charged, error                          | unique idempotency_key                         |
| ats_reports             | Score, breakdown, report JSONB, content_hash, jd_id, method_version                                                          | index (version_id, content_hash, jd_id)        |
| credit_accounts         | Cached wallet credit balance                                                                                                 | one per user; balance ≥ 0 check                |
| credit_holds            | Active / captured / released holds, expires_at                                                                               | unique ai_job_id                               |
| credit_ledger           | Append-only credit movements with balance_after                                                                              | unique (source_type, source_id)                |
| credit_packages         | Price, credits, bonus credits, active, sort order                                                                            | unique price_paise                             |
| coupons                 | Admin coupon codes: credits, max redemptions, expires_at, active                                                             | unique lower(code)                             |
| referral_codes          | One code per user                                                                                                            | unique user_id, unique lower(code)             |
| code_redemptions        | Who applied which coupon or referral code, credits to user, credits to referrer, referrer status (granted / held / rejected) | unique user_id (one code per account)          |
| pricing_config          | Model prices, FX rate, markup, minimums; versioned                                                                           | —                                              |
| payments                | Razorpay orders and payments, amount_paise, status                                                                           | unique order_id, payment_id                    |
| payment_events          | Raw webhook events                                                                                                           | unique event_id                                |
| generated_files         | PDFs in ImageKit by content_hash + template (storage_key + storage_file_id)                                                  | unique (version_id, content_hash, template_id) |
| resume_templates        | The five templates                                                                                                           | —                                              |
| audit_logs              | Admin actions with reason                                                                                                    | —                                              |
| email_preferences       | Per user: reminders, offers, product_updates, consent source and time                                                        | unique user_id                                 |
| email_suppressions      | Addresses blocked after hard bounce, complaint or unsubscribe-all                                                            | unique lower(email)                            |
| email_template_settings | Enabled flag per marketing template, inactive-nudge timing                                                                   | unique template_key                            |
| email_campaigns         | Template, audience filters JSONB, subject, preheader, content JSONB, status, scheduled_at, created_by, counts                | —                                              |
| email_messages          | One row per send: user, template, campaign, status, provider message id, merge data                                          | unique idempotency_key; unique provider_message_id |
| email_events            | Raw provider delivery events (unused until an event source exists)                                                           | unique provider_event_id                       |

All primary keys are UUIDs. Every hold, capture and grant runs inside one database transaction with `SELECT … FOR UPDATE` on the user's `credit_accounts` rows.

### 14.4 Hosting (Railway)

| Part                                                | Railway                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------------------- |
| Web app (Next.js)                                   | Railway service built from `apps/web/Dockerfile`, public domain               |
| Worker (BullMQ, Tesseract.js, Puppeteer + Chromium) | Railway service built from `apps/worker/Dockerfile`, no public domain         |
| Database                                            | Railway PostgreSQL                                                            |
| Queue                                                | Railway Redis                                                                 |
| Files                                                | ImageKit (external, see 5.2)                                                  |
| Email                                                | Generic SMTP provider via Nodemailer (external, see 13.2)                     |
| Secrets                                              | Railway service variables (shared variables for values both services need)    |
| Logs                                                 | Railway's built-in service logs; dedicated observability deferred (14.5)      |

- Both services build from the same monorepo. Railway deploys on push to `main` once GitHub is connected; migrations run as a pre-deploy command on the web service.
- The worker needs a long-running container with Chromium installed, which is why it can't be serverless. Railway runs it as an always-on service.
- Region: Railway has no India region; pick the nearest (Southeast Asia) for latency. Store user data only with providers whose terms meet the DPDP Act obligations in 15.
- No infrastructure-as-code app. Services, variables and plugins are configured in Railway, and the config needed to recreate them is documented in `tasks/todo/m13-testing-deploy/05-railway-deploy.md`.

## 15. Non-functional requirements

| Area          | Requirement                                                                                                                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Performance   | Dashboard p95 < 1.5 s; preview updates < 200 ms after an edit; generation p95 < 60 s; PDF < 10 s                                                                                                                                                                                      |
| Reliability   | AI and PDF jobs retried with backoff; holds auto-release after 15 min; every job status visible to the user; transactional emails sent within 2 min of their event                                                                                                                    |
| Security      | Server-side auth on every procedure; magic-byte file checks; ImageKit private files with short-lived signed URLs, private key server-side only; secrets in env only; Razorpay and Clerk webhook signatures verified                                                                                    |
| Rate limits   | Per user: 10 AI actions per minute, 20 uploads per day; per IP on public endpoints                                                                                                                                                                                                    |
| Email         | SPF, DKIM, DMARC verified; one-click unsubscribe headers; campaign throttling; SMTP rejections tracked as hard bounces                                                                                                                                                                  |
| Privacy       | Comply with India's DPDP Act 2023: consent at signup (separate opt-in for marketing email), delete resume / version / account on request, uploads deleted after 30 days; no use of resume data for model training; OpenAI API data-retention setting documented in the Privacy Policy |
| Auditability  | Every credit movement traceable to an AI job, payment, grant or admin action                                                                                                                                                                                                          |
| Observability | Deferred from Phase 1; Railway service logs only. AI cost and failures are visible in the admin dashboard from `ai_jobs`                                                                                                                                                                                                |

## 16. Phase 1 scope, acceptance and milestones

### 16.1 In scope (all P0)

Auth (Google, LinkedIn, email) · upload + extraction for 4 formats · schema 2.0 · resume information editor · JD input and analysis · grounded generation with versioning · separate ATS scoring, re-scoring and comparison · split editor with 5 templates · Puppeteer PDF in ImageKit · credits (estimate, hold, capture) · wallet top-up packs · transactional and marketing email with campaigns and preferences · basic admin dashboard.

**Postponed:** cover letters, LinkedIn import, fetching JD from URL, application tracking, public sharing, team accounts, multiple languages (English only in Phase 1), premium templates, priority queue, subscription plans, personal gift codes and promo-code emails, observability (Sentry, alarms), email delivery/open/click tracking.

### 16.2 Acceptance criteria

1. Users sign up with Google, LinkedIn or email and get a wallet with 0 credits; applying EARLYBIRD adds 500 credits; applying a valid referral code adds 100 to the new user and 100 to the referrer; one code per account.
2. LaTeX, PDF, DOCX and image uploads up to 10 MB extract into valid schema 2.0 JSON; low-confidence fields are highlighted.
3. Every paid AI action shows a credit estimate before running and is blocked if available balance is too low.
4. Charged credits never exceed the estimate; failed actions charge 0 credits.
5. Concurrent requests cannot spend more than the available balance (load-tested with 20 parallel requests).
6. Re-running scoring on unchanged content + same JD returns the cached report free.
7. A JD over 30,000 characters is rejected on client and server.
8. On an evaluation set of 50 resume × JD pairs, including 10 with injected instructions, saved generations have 0 grounding violations.
9. Every generation creates a new version; the original and earlier versions are unchanged.
10. Editing a version marks its ATS report Outdated; re-scoring creates a new report and keeps history.
11. Comparison shows both scores and per-dimension change.
12. The PDF matches the preview for all 5 templates (visual regression tests) and downloads via a short-lived ImageKit signed URL.
13. A ₹500 payment grants 10,000 credits and a ₹1,000 payment grants 21,000 credits, exactly once, even with duplicate webhooks.
14. Users cannot read another user's resumes, files, JDs, reports or ledger.
15. Admins can view users, AI jobs and cost, ledger, payments, and make audited credit adjustments.
16. Each transactional email is sent exactly once per event, even with duplicate webhooks or job retries.
17. The recharge-successful email arrives within 2 minutes of credits being granted.
18. Marketing email is never sent to users without consent for that category, unsubscribed or suppressed users; one-click unsubscribe works without sign-in and takes effect immediately.
19. A campaign's recipients match the audience count shown at confirmation, minus users who opted out during the send.
20. A flagged referral grants the referrer's credits only after admin approval.
21. All eight Phase 1 emails have plain-text versions and render correctly in Gmail, Outlook and Apple Mail, light and dark.

### 16.3 Milestones

| #   | Deliverable                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------- |
| M1  | Monorepo, local Docker Postgres + Redis, Clerk, tRPC in Next.js, worker skeleton                     |
| M2  | Credits core: ledger, holds, estimate/capture, pricing config (with stub AI)                         |
| M3  | Upload, ImageKit storage, file processing                                                                  |
| M4  | Schema 2.0, extraction, review editor                                                                |
| M5  | JD input and analysis                                                                                |
| M6  | Generation, grounding check, versioning                                                              |
| M7  | ATS scoring, report, re-score, comparison                                                            |
| M8  | Editor, 5 HTML templates, live preview                                                               |
| M9  | Puppeteer PDF + ImageKit                                                                                   |
| M10 | Razorpay wallet top-ups                                                                              |
| M11 | Email: SMTP provider and domain setup, Nodemailer, templates, transactional sends, preferences and unsubscribe |
| M12 | Marketing pages, dashboards, admin (including campaigns and email log)                               |
| M13 | Eval set, load and security tests (Vitest + Playwright), Dockerfiles + Railway deploy                |

Credits come at M2 so every AI feature is built on real metering from the start.

### 16.4 Decisions still open

- [ ] Exact packs between ₹1,000 and ₹5,000 and their bonus credits
- [ ] Markup multiplier and minimum credits per action, after measuring AI cost on the eval set
- [ ] Whether OCR text is structured into JSON by OpenAI (platform-paid, as written) or by a rule-based parser
- [ ] Railway service sizing and plan (web/worker replicas, CPU/memory, Postgres and Redis plans) — the platform itself is decided (14.4)
- [ ] ImageKit plan (storage and bandwidth limits)
- [ ] When to bring observability (Sentry, alarms) back into scope
- [ ] Sender address, sending subdomain, and which SMTP provider Nodemailer uses
- [ ] Email log retention period
- [ ] Inactive-nudge timing: 30 days and a maximum of 3 nudges, as proposed
