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

## Implementation

- [EditorView.tsx](../../../apps/web/src/components/editor/EditorView.tsx) has three panes:
  - **Sections list:** drag the grip (or press ↑/↓ on it) to reorder, the eye icon hides a section, and "+ Add custom section" creates a new one.
  - **Form:** edits every section — personal info, summary, experience, education, projects, skills, certifications and custom sections. Items and bullets can be added, deleted, hidden and reordered.
  - **Live preview:** zoom, Fit, and page navigation with page-break markers.
- [editor-store.ts](../../../apps/web/src/stores/editor-store.ts) (Zustand) holds every edit operation. New ids are unique across the whole resume, and deleting an item also removes it from the layout (hidden items, section order).
- **Autosave** runs 800 ms after the last edit through `versions.save`. The server re-hashes the content and marks old ATS reports outdated. The browser warns before leaving if a save is still pending.
- **"Show original"** shows a bullet's source text, taken from the provenance and the parent version.
- **Original versions** open read-only here (they are edited on the review screen), but their template can still be changed.
- **Template choice** is saved per version (`versions.setTemplate`, using `resume_versions.template_id`).

## How to test

- `apps/web`: `npx vitest run src/stores` covers reordering sections, items and bullets; add, delete and hide; custom sections; dates, skills and links.
- Manual: open a tailored version in the editor.
  1. Drag a section, then reload the page: the new order is kept.
  2. Edit a bullet: the preview updates immediately, and the status changes to "saving…" and then "saved".
  3. The ATS report for that version now shows as outdated.
