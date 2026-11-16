# Resume JSON schema 2.0

**Milestone:** M4 · prd.md §6
**Status:** testing. Both "done when" items are verified in tests. **Not yet checked against the live OpenAI API** (no `OPENAI_API_KEY` in the env files); do that first in M4-02.

## Scope

`packages/validators/resume`:

- Zod schema matching §6.1 exactly: personalInfo, summary, workExperience, education, skills, projects, certifications, customSections, layout (sectionOrder, hiddenSections, hiddenItems)
- App-generated stable ids on every item (never model-generated free text)
- Date shape `{ value: "YYYY-MM"|"YYYY"|null, raw: string }`; `isCurrent` + `endDate.value = null` = Present
- `extractionMeta` and `provenance` side-tables (§6.2), stored beside content, not sent to templates
- Same Zod schema generates the OpenAI Structured Outputs JSON schema
- `schemaVersion` checked on read; `migrate_1_0_to_2_0` pure function run lazily and saved back

## Done when

- Schema validates all example shapes in §6.1/§6.2: **done**. The full §6.1 example (placeholders filled with real values, every section including custom sections and `custom:<id>` in the layout) and the §6.2 metadata example both parse. A near-empty `{ schemaVersion: "2.0" }` also parses, with defaults, so partial extractions are storable.
- The same schema object is reused for Structured Outputs generation, with no hand-duplicated JSON schema: **done**. `resumeJsonSchema()` is `z.toJSONSchema(resumeContentShape.omit({ schemaVersion, layout }))` made strict-compatible. A test checks the generated sections and fields match the Zod object's keys, so a field added to Zod shows up automatically.

## What was built

Import from `@resume-pilot/validators/resume`:

- **`schema.ts`**:
  - `resumeSchema` (canonical, §6.1): strings default to `""` and lists to `[]`; enums for link/employment/bullet/grade types; length and count caps on every field.
  - Cross-field checks:
    - **unique ids**
    - ids must be app-shaped (`we_1`, `b_3`), so free text like "Flipkart job" is rejected
    - an end date can't be before its start (compared at shared precision, so `2017-08 → 2017` passes)
    - `isCurrent` means no end date
    - `layout` may only reference built-in or existing `custom:<id>` sections, each once, and `hiddenItems` must be real ids
  - `resumeMetaSchema` (§6.2): `extractionMeta` keyed by id-addressed paths (`workExperience[id=we_1].startDate`, never array indexes), confidence `low|medium`. `provenance` is keyed `we_1.bullets[b_3]` with at least one `sourceBulletId`.
  - `unreviewedLowConfidence(meta)`: what blocks generation (§6.2). `editorIssues(resume)`: the §6.3 required fields (a name, one contact method, company + designation per job). They're kept out of the schema so partial extractions still validate.
  - `collectIds` walks every item in document order (for grounding and provenance later).
- **`dates.ts`**: `parseResumeDate` handles "Jan 2021", "Sept. 2019", "2021-06", "2021/6", "06/2021", "2021", "Summer 2021" (year only), "Class of 2017" and Present/Current/Till date; `raw` is always kept. `parseDateRange` handles "Jan 2021 – Present" and "2017 to 2020".
- **`ids.ts`**: `IdAllocator` (per-kind prefixes; counters start past existing ids, so a generated version never collides with its source's ids) and `assignIds` (fills missing ids, keeps valid ones, tolerates missing fields).
- **`structured-output.ts`**:
  - `resumeJsonSchema()` and `resumeResponseFormat()` (`text.format` for `responses.create`, `strict: true`).
  - Strict-mode rules applied:
    - every object has `additionalProperties: false` and lists all its properties as required
    - Zod-optional fields become nullable
    - no `default`/`minLength`/`maxLength`
    - `id`, `schemaVersion` and `layout` are stripped, so **the model is never asked for ids**
  - Tests check these rules on every node, plus OpenAI's size limits.
  - `fromStructuredOutput(output, { existingIds?, layout? })`: nulls become defaults; a malformed date value ("June 2021") is re-derived from `raw`; a current job's end date is dropped; app ids are assigned (any id the model sneaks in is replaced); the result is validated. A failure throws `ResumeOutputError`.
- **`migrate.ts`**: `migrate_1_0_to_2_0` (pure, tested not to modify its input) and `readResume(json)`. `readResume` returns `{ resume, migrated }`: 2.0 passes through; 1.0, 1.1 or a missing version migrates with `migrated: true` so the caller saves it back; an unknown newer version throws `UnsupportedSchemaVersionError`.
  - **Assumption:** the PRD never shows the v1.1 shape, only its gaps. The migration reads the shape those gaps imply: no ids, string dates or a `duration` range, string bullets or `responsibilities`, a flat or comma-separated `skills`, a single `name`, and no layout. No v1 rows exist yet, so revisit this if real v1 data turns up.

## Verified

- `validators`: 49 tests (examples, every rule, 15 date formats, allocator, strict-mode invariants on every schema node, model-output conversion, migration). Full workspace `pnpm turbo lint build test --force`: 39/39.

## Left for later

- **Live API check (do first in M4-02):** send `resumeResponseFormat()` to the Responses API once `OPENAI_API_KEY` is set. The strict-mode rules are checked here, but only OpenAI can confirm it accepts the schema.
- Storing resumes: `resume_versions.content` (JSONB) plus a meta column, written by M4-02. Readers must go through `readResume` and save back when `migrated`.
