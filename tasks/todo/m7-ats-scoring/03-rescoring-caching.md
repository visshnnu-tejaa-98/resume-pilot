# Re-scoring and cache

**Milestone:** M7 · prd.md §9.3, §3.2, §16.2.6, §16.2.10
**Status:** todo

## Scope

- Cache key = hash of resume content JSON + JD id; unchanged content + same JD = cached report, free
- Any edit to a version marks its last report "Outdated" (content hash changed)
- "Re-score" runs a new scoring action with its own estimate/charge; old reports kept for score history per version

## Done when

- Re-running scoring on unchanged content + same JD returns the cached report at zero cost (acceptance criterion 16.2.6)
- Editing a version flips its report to Outdated and re-scoring creates a new report while preserving history (16.2.10)
