# Text → Resume JSON extraction

**Milestone:** M4 · prd.md §5.3 (step 4), §6
**Status:** todo

## Scope

- Raw text → Resume JSON 2.0 via OpenAI Structured Outputs — free to the user, platform cost only, protected by upload rate limits
- Zod validation on output
- Confidence flags written to `extractionMeta` (low OCR confidence on a line flags the fields derived from it)
- Save as the resume's original version (`kind = original`)

## Done when

- Extraction output always validates against schema 2.0 or the job fails cleanly (no partial/corrupt save)
- Low-confidence fields are correctly flagged and traceable to source OCR confidence
