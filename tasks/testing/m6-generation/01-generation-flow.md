# Generation flow

**Milestone:** M6 · prd.md §8.1, §16.2.3
**Status:** testing

## Scope

1. User picks source version + JD
2. If JD has no analysis, include it in the estimate and run first
3. Confirmation dialog: target job title/company, what will run, credit estimate, balance after — hold placed only on Confirm
4. Worker: OpenAI Responses API with Structured Outputs — original resume JSON + JD analysis + rules → generated resume JSON + provenance + gap list
5. Zod validation → grounding check (see 02-grounding-check.md)
6. Save as new `resume_versions` row (`kind = generated`, `parentVersionId`, `jdId`)
7. Capture hold, route to editor

Editor shows a separate "Score this resume" action with its own estimate — generation never produces the ATS score.

## Done when

- Estimate dialog always shown before any hold is placed; Cancel charges nothing (16.2.3)
- Every generation produces a new, independent `resume_versions` row

## Implementation

- Services: `packages/services/src/generation.ts` — `estimateGeneration` (read-only; includes JD analysis when the JD isn't analysed), `startGeneration` (holds only on Confirm, never above the confirmed total, idempotent per dialog `requestId`; places the analysis hold too when needed and releases it if the generation hold fails), `processGeneration` (runs the analysis first, generates, saves a new `resume_versions` row with `parentVersionId` + `jdId`, captures; any failure releases), `getGenerationStatus`
- AI: `packages/ai/src/generation/` — the model returns a tailoring *plan* referencing source ids; `assembleVersion` builds the resume, copying every fact from the source
- Queue/worker: `generation` job on `ai-jobs` (`enqueueGeneration`, `createAiWorker`)
- API: `generation.estimate|start|status`; enqueue failure releases both holds
- UI: Generate → confirm dialog with real estimate → `/generate/[aiJobId]` progress (auto-refresh) → editor; gap list shown in the editor; generation never scores
- DB: migration `0010` adds `resume_versions.generation_meta`, `ai_jobs.input`, `ai_jobs.result_version_id`

## How to test

1. Worker + web with `OPENAI_API_KEY`, Redis, credits; a reviewed original and a saved job.
2. Generate → Proceed → dialog shows lines + total; Cancel → nothing held (wallet "On hold" stays 0).
3. Confirm → progress page → "ready" → Open in editor; wallet shows one capture ≤ estimate (two if the job wasn't analysed).
4. Generate again for the same pair → a second, separate version in My resumes.

Automated (real DB): `packages/services/src/generation.test.ts`.
