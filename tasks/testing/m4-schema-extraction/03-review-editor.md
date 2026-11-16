# Resume Information review screen

**Milestone:** M4 · prd.md §5.3 (step 7), §4.1
**Status:** testing

## Scope

- "Resume Information" page: user lands here after extraction with uncertain fields highlighted
- Generation is blocked until every `low`-confidence field is reviewed or explicitly left as-is
- Manual edit of any field at this stage is accepted as the user's own claim (§8.6)

## Done when

- A resume with `low`-confidence fields cannot proceed to Generate until each is marked reviewed
