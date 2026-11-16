import { create } from "zustand";
import type { EditableRole, VersionView } from "@/features/versions/types";
import type { TemplateName } from "@/stores/preferences-store";

/**
 * State for the tailored-version editor (design/screens/Editor.dc.html):
 * selected template, section visibility/order, the section being edited,
 * draft work entries, preview zoom and dirty tracking. Shared by the
 * toolbar, section list, form and live preview, which sit in separate
 * component trees, so this lives in a store, not in props.
 *
 * Editing a generated version never touches the original (§8.5); any
 * edit marks a cached ATS score as outdated (§9).
 */
interface EditorState {
  versionId: string | null;
  template: TemplateName;
  sections: VersionView["sections"];
  activeSection: string;
  work: EditableRole[];
  zoom: number;
  dirty: boolean;
  scoreOutdated: boolean;

  load: (v: VersionView) => void;
  setTemplate: (t: TemplateName) => void;
  toggleSection: (id: string) => void;
  setActive: (id: string) => void;
  editBullet: (roleId: string, bulletId: string, text: string) => void;
  editRole: (roleId: string, patch: Partial<Pick<EditableRole, "company" | "designation" | "dates">>) => void;
  zoomBy: (delta: number) => void;
}

export const useEditorStore = create<EditorState>()((set) => ({
  versionId: null,
  template: "Classic",
  sections: [],
  activeSection: "work",
  work: [],
  zoom: 0.8,
  dirty: false,
  scoreOutdated: false,

  load: (v) =>
    set({
      versionId: v.id,
      template: v.template,
      sections: v.sections,
      activeSection: "work",
      work: structuredClone(v.work),
      zoom: 0.8,
      dirty: false,
      scoreOutdated: v.score?.outdated ?? false,
    }),
  setTemplate: (template) => set({ template, dirty: true }),
  toggleSection: (id) =>
    set((s) => ({ sections: s.sections.map((x) => (x.id === id ? { ...x, visible: !x.visible } : x)), dirty: true })),
  setActive: (activeSection) => set({ activeSection }),
  editBullet: (roleId, bulletId, text) =>
    set((s) => ({
      work: s.work.map((r) =>
        r.id !== roleId ? r : { ...r, bullets: r.bullets.map((b) => (b.id === bulletId ? { ...b, text, origin: "user" } : b)) },
      ),
      dirty: true,
      scoreOutdated: true,
    })),
  editRole: (roleId, patch) =>
    set((s) => ({ work: s.work.map((r) => (r.id === roleId ? { ...r, ...patch } : r)), dirty: true, scoreOutdated: true })),
  zoomBy: (delta) => set((s) => ({ zoom: Math.min(1.2, Math.max(0.5, Math.round((s.zoom + delta) * 10) / 10)) })),
}));
