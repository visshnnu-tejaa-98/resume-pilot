# Versioning

**Milestone:** M6 · prd.md §8.5, §8.6, §16.2.9
**Status:** todo

## Scope

- Original + every generated version = separate `resume_versions` rows, never overwritten by AI
- `parentVersionId` snapshots the source version id; editing the original never changes history of already-generated versions
- Each version independently editable, scorable, exportable, soft-deletable (30-day restore)
- Duplicate = copy with no AI call, no charge
- Manual edits accepted as user's own claims (rules in §8.2-8.4 apply to AI output only); editor shows a responsibility note; if a user generates again from an edited version, the edits count as source facts

## Done when

- Generating from a version, then editing the original, leaves the generated version's content unchanged (acceptance criterion 16.2.9)
- Soft-deleted versions are restorable within 30 days
