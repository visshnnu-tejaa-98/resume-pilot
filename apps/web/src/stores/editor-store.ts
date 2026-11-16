import { parseResumeDate, type Resume } from "@resume-pilot/validators/resume";
import { create } from "zustand";
import type { VersionView } from "@/features/versions/types";
import type { TemplateName } from "@/stores/preferences-store";

/**
 * State for the version editor (design/screens/Editor.dc.html). Holds
 * the resume being edited plus UI state shared by the toolbar, section
 * list, form and live preview, which sit in separate component trees.
 *
 * Hand edits are the user's own claims (prd.md §8.6) and never touch the
 * version they came from. Any edit marks a cached ATS score as outdated.
 */
export const EDITABLE_SECTIONS = ["summary", "workExperience", "skills", "projects", "education", "certifications"] as const;
export type EditableSection = (typeof EDITABLE_SECTIONS)[number];

interface EditorState {
  versionId: string | null;
  content: Resume | null;
  template: TemplateName;
  activeSection: EditableSection;
  /** Bullet ids the user has changed by hand this session. */
  userEdited: Set<string>;
  zoom: number;
  dirty: boolean;
  scoreOutdated: boolean;
  savedAt: Date | null;

  load: (v: VersionView) => void;
  setTemplate: (t: TemplateName) => void;
  toggleSection: (s: EditableSection) => void;
  setActive: (s: EditableSection) => void;
  editSummary: (text: string) => void;
  editBullet: (section: "workExperience" | "projects", itemId: string, bulletId: string, text: string) => void;
  editRole: (roleId: string, patch: { company?: string; designation?: string; dates?: string }) => void;
  zoomBy: (delta: number) => void;
  markSaved: () => void;
}

function mutate(set: (fn: (s: EditorState) => Partial<EditorState>) => void, fn: (draft: Resume, s: EditorState) => void, extra: (s: EditorState) => Partial<EditorState> = () => ({})) {
  set((s) => {
    if (!s.content) return {};
    const draft = structuredClone(s.content);
    fn(draft, s);
    return { content: draft, dirty: true, scoreOutdated: true, ...extra(s) };
  });
}

export const useEditorStore = create<EditorState>()((set) => ({
  versionId: null,
  content: null,
  template: "Classic",
  activeSection: "workExperience",
  userEdited: new Set(),
  zoom: 0.8,
  dirty: false,
  scoreOutdated: false,
  savedAt: null,

  load: (v) =>
    set({
      versionId: v.id,
      content: structuredClone(v.content),
      template: v.template,
      activeSection: "workExperience",
      userEdited: new Set(),
      zoom: 0.8,
      dirty: false,
      scoreOutdated: v.score?.outdated ?? false,
      savedAt: v.savedAt,
    }),
  setTemplate: (template) => set({ template }),
  toggleSection: (sec) =>
    mutate(set, (d) => {
      const hidden = new Set(d.layout.hiddenSections);
      if (hidden.has(sec)) hidden.delete(sec);
      else hidden.add(sec);
      d.layout.hiddenSections = [...hidden];
    }),
  setActive: (activeSection) => set({ activeSection }),
  editSummary: (text) => mutate(set, (d) => (d.summary.text = text)),
  editBullet: (section, itemId, bulletId, text) =>
    mutate(
      set,
      (d) => {
        const item = (d[section] as { id: string; bullets: { id: string; text: string }[] }[]).find((x) => x.id === itemId);
        const b = item?.bullets.find((x) => x.id === bulletId);
        if (b) b.text = text;
      },
      (s) => ({ userEdited: new Set(s.userEdited).add(bulletId) }),
    ),
  editRole: (roleId, patch) =>
    mutate(set, (d) => {
      const w = d.workExperience.find((x) => x.id === roleId);
      if (!w) return;
      if (patch.company !== undefined) w.company = patch.company;
      if (patch.designation !== undefined) w.designation = patch.designation;
      if (patch.dates !== undefined) {
        const [start = "", end = ""] = patch.dates.split(/\s+[–-]\s+/);
        w.startDate = parseResumeDate(start).date;
        const e = parseResumeDate(end);
        w.isCurrent = e.isPresent;
        w.endDate = e.isPresent ? { value: null, raw: "Present" } : e.date;
      }
    }),
  zoomBy: (delta) => set((s) => ({ zoom: Math.min(1.2, Math.max(0.5, Math.round((s.zoom + delta) * 10) / 10)) })),
  markSaved: () => set({ dirty: false, savedAt: new Date() }),
}));
