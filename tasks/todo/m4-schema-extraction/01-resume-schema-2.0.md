# Resume JSON schema 2.0

**Milestone:** M4 · prd.md §6
**Status:** todo

## Scope

`packages/validators/resume`:

- Zod schema matching §6.1 exactly: personalInfo, summary, workExperience, education, skills, projects, certifications, customSections, layout (sectionOrder, hiddenSections, hiddenItems)
- App-generated stable ids on every item (never model-generated free text)
- Date shape `{ value: "YYYY-MM"|"YYYY"|null, raw: string }`; `isCurrent` + `endDate.value = null` = Present
- `extractionMeta` and `provenance` side-tables (§6.2), stored beside content, not sent to templates
- Same Zod schema generates the OpenAI Structured Outputs JSON schema
- `schemaVersion` checked on read; `migrate_1_0_to_2_0` pure function run lazily and saved back

## Done when

- Schema validates all example shapes in §6.1/§6.2
- The same schema object is reused for Structured Outputs generation (no hand-duplicated JSON schema)
