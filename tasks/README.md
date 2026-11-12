# Tasks

Two views over the same work:

1. **By milestone + status** — `todo/`, `testing/`, `done/`, each split into `m1-foundation` … `m13-testing-deploy` subfolders matching prd.md §16.3. This is the source of truth: a task's folder (`todo`/`testing`/`done`) is its real status. Move the file itself when status changes.
2. **By feature area** — `by-category/`, an index that cross-references the same tasks by kind of work (database, UI, integrations, env vars/keys, dev process). Use this to answer "what's left on the DB" or "what env vars do I need before I can run this locally" without reading all 13 milestone folders.

The category files are a manual index, not a live query — when a task file moves between `todo`/`testing`/`done`, tick (or untick) its box in every category file that lists it.

## Checkbox convention in `by-category/`

- `[ ]` not started · `[~]` in testing · `[x]` done — matching the three status folders.
