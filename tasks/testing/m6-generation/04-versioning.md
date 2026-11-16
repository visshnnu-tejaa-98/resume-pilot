# Versioning

**Milestone:** M6 · prd.md §8.5, §8.6, §16.2.9
**Status:** testing

## Scope

- Original + every generated version = separate `resume_versions` rows, never overwritten by AI
- `parentVersionId` snapshots the source version id; editing the original never changes history of already-generated versions
- Each version independently editable, scorable, exportable, soft-deletable (30-day restore)
- Duplicate = copy with no AI call, no charge
- Manual edits accepted as user's own claims (rules in §8.2-8.4 apply to AI output only); editor shows a responsibility note; if a user generates again from an edited version, the edits count as source facts

## Done when

- Generating from a version, then editing the original, leaves the generated version's content unchanged (acceptance criterion 16.2.9)
- Soft-deleted versions are restorable within 30 days

## Implementation

- `packages/services/src/versions.ts`: `listVersions`, `getVersion`, `saveVersionContent` (generated versions; hand edits are user claims, cached ATS reports marked outdated), `duplicateVersion` (no AI, no charge), `deleteVersion` / `restoreVersion` (30 days), `listDeletedVersions`, `purgeDeletedVersions` (daily `purge-versions` maintenance job)
- Generated content is its own copy; `parentVersionId` = the source version; generating from an edited version uses its edits as source facts
- API: `versions.list|deleted|get|save|duplicate|delete|restore`
- UI: editor loads/saves real content (responsibility note shown), My resumes lists versions with Duplicate/Delete and a "Recently deleted" list with Restore

## How to test

- Generate, then edit the original on its review screen → the generated version is unchanged (16.2.9; also `generation.test.ts`).
- Delete a version → appears under "Recently deleted" → Restore.

Automated (real DB): `packages/services/src/generation.test.ts`.
