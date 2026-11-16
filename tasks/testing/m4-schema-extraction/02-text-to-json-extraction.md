# Text → Resume JSON extraction

**Milestone:** M4 · prd.md §5.3 (step 4), §6
**Status:** testing. Both "done when" items are verified against a fake model and real Postgres, and the live pipeline was run end to end up to the model call. **Not yet run against real OpenAI**: there's no `OPENAI_API_KEY`. That's the one remaining check (see below).

## Scope

- Raw text → Resume JSON 2.0 via OpenAI Structured Outputs — free to the user, platform cost only, protected by upload rate limits
- Zod validation on output
- Confidence flags written to `extractionMeta` (low OCR confidence on a line flags the fields derived from it)
- Save as the resume's original version (`kind = original`)

## Done when

- Extraction output always validates against schema 2.0, or the job fails cleanly (no partial or corrupt save): **done**.
  - Model output goes through `fromStructuredOutput`, which validates against `resumeSchema`. `processStructuring` validates again before saving.
  - The original version and status `ready` are written in **one transaction**. A unique index (`resume_versions_one_original_key`) allows one original per resume, so concurrent retries save exactly one.
  - Tested: non-JSON output, schema-invalid output, a corrupt `structure()` result, refusals, truncated output and API errors **all leave zero versions**. Retryable failures reset to `processed` and retry; the final or a non-retryable failure sets `failed` with a user-facing message.
  - Live: a real upload went through extraction and chained to structuring, which failed cleanly with no key (`uploaded → processing → processed → failed`, 0 versions saved, a "retry in a few minutes" message).
- Low-confidence fields are correctly flagged and traceable to source OCR confidence: **done**.
  - OCR now records every line under 75% confidence (`pages[].lowConfidenceLines`, with page, text and confidence).
  - `flagExtraction` maps each field back to the line it came from: below 60% is `low`, 60–74% `medium`. Each entry carries `source: { kind: "ocr_line", page, line, ocrConfidence }`.
  - Tested through the DB: a job whose OCR line read at 48% gets `low` on company, title and dates with that exact line and confidence, and `unreviewedLowConfidence` (the generation gate) lists it. Fields from clean lines aren't flagged.

## What was built

- **`packages/ai`** (`openai@7.47.0`, the newest release older than two weeks):
  - `structureResume(client, { rawText, model? })`: Responses API with `text.format = resumeResponseFormat()` (strict, derived from the Zod schema), `max_output_tokens` 16k, and `store: false`, so resume data isn't retained by OpenAI.
  - **Prompt injection (§8.4):** the text goes in `<resume_text>` delimiters, any closing tag inside it is neutralised, and the instructions say the text is data and to ignore AI-directed requests in it. They also say: copy facts verbatim, never invent, keep raw dates, achievement vs responsibility, and custom sections for other headings.
  - `StructuringError(kind, retryable)`: refused and incomplete → not retryable; invalid output, 429, 5xx and network → retryable; 400/401/403/404/422 → `config_error`, not retryable.
  - The client is injectable (`ResponsesClient`), so tests never call OpenAI.
- **`packages/validators/resume/flags.ts`**: `flagExtraction(resume, { rawText, lowConfidenceLines })`, deterministic (the model never decides what's uncertain):
  - `ocr_line`, as above. Where a value appears on several lines, the lowest confidence wins.
  - `not_in_source` (always `low`): company, title, institution, degree, email or phone not found in the uploaded text, a cheap guard against invented or "corrected" facts. Phones are compared by digits, so reformatting doesn't trip it.
  - `partial_date`: a job date with only a year (`"Only year found"`, the PRD §6.2 example). Year-only education dates are normal and not flagged.
  - The `extractionMeta` entry gained an optional `source` (kind, page, line, ocrConfidence), a compatible extension of §6.2.
- **Migration 0009**: `resume_status` gains `structuring` and `ready`. The flow is uploaded → processing → processed → structuring → ready, or failed at any step. Plus the one-original unique index.
- **`packages/services/src/structuring.ts`**:
  - `processStructuring(db, resumeId, { structure, isFinalAttempt })`. Model usage (tokens, model, prompt version) is recorded in `resumes.extraction_meta.structuring` as a platform cost; no wallet, no `ai_jobs`.
  - Messages: our faults (no key, OpenAI down) show "something went wrong on our side, retry"; model or file problems show "couldn't work out the sections, retry or upload a cleaner copy".
  - `resumeContentHash` (sorted-key sha256) and `getOriginalVersion` (owner only).
- **Worker**: the extraction queue now runs `extract` then automatically `structure` (its own job, so a model retry never redoes OCR). The OpenAI client is lazy, and a missing key fails the job once with `config_error` instead of retrying three times. `OPENAI_API_KEY` and an optional `OPENAI_EXTRACTION_MODEL` were added to `apps/worker/.env.example`.
- **tRPC**: `resumes.retryExtraction` re-runs only the JSON step when the raw text exists, otherwise the full extraction. New `resumes.original` returns the parsed original with its review flags (owner only, NOT_FOUND until ready).

## Verified

- Full workspace `pnpm turbo lint build test --force`: 39/39, twice in a row. New tests: 6 ai (fake client), 7 flags, 10 structuring against real Postgres, 2 worker, 2 tRPC.
- **Fixed pre-existing flakiness:** the services test files ran in parallel against one DB, and `pricing.test.ts` switches the globally active pricing config, which the credit and ledger suites read. Roughly one run in three failed. Services test files now run one at a time (`vitest.config.mts`, `fileParallelism: false`); 4/4 clean runs after.

## Left for later

- **Live OpenAI check (blocking real use):** set `OPENAI_API_KEY` in `apps/worker/.env.local`, upload a few real resumes, and confirm that (1) OpenAI accepts the derived strict schema, (2) the output reads well, and (3) a resume with "ignore previous instructions…" text doesn't leak it into fields. `DEFAULT_EXTRACTION_MODEL` is `gpt-5.1`; switch via `OPENAI_EXTRACTION_MODEL` if a cheaper model does as well.
- Platform cost tracking is per resume in `extraction_meta`. The admin AI-cost dashboard (M12-02) should sum it alongside `ai_jobs`.
- Review screen (M4-03): show `extractionMeta` flags, using `source` to quote the OCR line, and set `reviewed`.
