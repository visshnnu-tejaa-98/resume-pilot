# Split-screen editor

**Milestone:** M8 · prd.md §10.1
**Status:** todo

## Scope

- Form editor (left) + live HTML preview (right), page navigation, zoom
- Edit every section/item; add/delete/reorder (drag) items and sections; hide sections/items; custom sections
- "Show original" on any generated bullet uses provenance to display source text
- Autosave with debounce; saving updates content hash and marks ATS report Outdated

## Done when

- Preview updates within 200ms of an edit (non-functional requirement, §15)
- Drag-reorder persists to `layout.sectionOrder` / item order correctly
