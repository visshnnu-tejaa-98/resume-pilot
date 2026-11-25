import { collectIds, parseResumeDate, type Resume } from "@resume-pilot/validators/resume";
import { create } from "zustand";
import type { VersionView } from "@/features/versions/types";
import type { TemplateName } from "@/stores/preferences-store";

/**
 * State for the split-screen editor (prd.md §10.1, design/screens/Editor.dc.html).
 * Holds the resume being edited plus UI state shared by the toolbar,
 * section list, form and live preview, which sit in separate trees.
 *
 * Hand edits are the user's own claims (§8.6) and never touch the version
 * they came from. Any content edit bumps `revision`; autosave writes it and
 * the server marks cached ATS reports outdated (content hash changes).
 */

export type ListSection = "workExperience" | "education" | "projects" | "certifications" | "skills" | "customSections";
/** Sections with bullet lists on their items. */
export type BulletSection = "workExperience" | "education" | "projects";
/** "personal" (fixed header), a built-in key, or `custom:<id>`. */
export type EditorPane = string;

type AnyItem = { id: string; [k: string]: unknown };
type Bullet = { id: string; text: string };

interface EditorState {
  versionId: string | null;
  content: Resume | null;
  template: TemplateName;
  active: EditorPane;
  /** Bullet ids the user has changed by hand this session. */
  userEdited: Set<string>;
  zoom: number;
  /** Increments on every content edit; autosave compares it. */
  revision: number;
  savedRevision: number;
  scoreOutdated: boolean;
  savedAt: Date | null;

  /** `pane`: section to open first (deep link from the ATS report); Personal info by default. */
  load: (v: VersionView, pane?: EditorPane) => void;
  setTemplate: (t: TemplateName) => void;
  setActive: (p: EditorPane) => void;
  zoomBy: (delta: number) => void;
  zoomTo: (z: number) => void;
  markSaved: (revision: number) => void;

  setPersonal: (field: "firstName" | "lastName" | "headline" | "email" | "phone" | "location", value: string) => void;
  setLinks: (urls: string[]) => void;
  editSummary: (text: string) => void;

  /** Patch plain fields of an item in a list section (or a custom section's item). */
  editItem: (section: ListSection, itemId: string, patch: Record<string, unknown>, customId?: string) => void;
  /** "Jan 2021 – Present" style text → start/end (+ isCurrent where it exists). */
  setDates: (section: ListSection, itemId: string, text: string, customId?: string) => void;
  addItem: (section: ListSection, customId?: string) => string;
  removeItem: (section: ListSection, itemId: string, customId?: string) => void;
  moveItem: (section: ListSection, from: number, to: number, customId?: string) => void;
  toggleItemHidden: (id: string) => void;

  editBullet: (section: BulletSection | "customSections", itemId: string, bulletId: string, text: string, customId?: string) => void;
  addBullet: (section: BulletSection | "customSections", itemId: string, customId?: string) => void;
  removeBullet: (section: BulletSection | "customSections", itemId: string, bulletId: string, customId?: string) => void;
  moveBullet: (section: BulletSection | "customSections", itemId: string, from: number, to: number, customId?: string) => void;

  /** Skills group: names as a comma-separated list. */
  setSkillNames: (groupId: string, names: string[]) => void;

  toggleSection: (key: string) => void;
  moveSection: (from: number, to: number) => void;
  addCustomSection: () => string;
  removeCustomSection: (id: string) => void;
}

/** Next free app id for a prefix (we_3, b_12…), unique across the whole resume. */
export function nextId(r: Resume, prefix: string, taken: Set<string> = new Set()): string {
  const all = new Set([...collectIds(r), ...taken]);
  let n = 0;
  for (const id of all) {
    const m = id.match(/^([a-z][a-z0-9]*)_(\d+)$/);
    if (m && m[1] === prefix) n = Math.max(n, Number(m[2]));
  }
  let id = `${prefix}_${n + 1}`;
  while (all.has(id)) id = `${prefix}_${++n + 1}`;
  return id;
}

const EMPTY_DATE = { value: null, raw: "" };
const PREFIX: Record<ListSection, string> = { workExperience: "we", education: "ed", projects: "pr", certifications: "ce", skills: "sg", customSections: "ci" };

function blank(section: ListSection, id: string): AnyItem {
  switch (section) {
    case "workExperience":
      return { id, company: "", designation: "", employmentType: null, location: "", startDate: EMPTY_DATE, endDate: EMPTY_DATE, isCurrent: false, bullets: [], skillsUsed: [] };
    case "education":
      return { id, institution: "", degree: "", fieldOfStudy: "", location: "", startDate: EMPTY_DATE, endDate: EMPTY_DATE, grade: { value: "", scale: null }, bullets: [] };
    case "projects":
      return { id, name: "", role: "", url: "", startDate: EMPTY_DATE, endDate: EMPTY_DATE, bullets: [], technologies: [] };
    case "certifications":
      return { id, name: "", issuer: "", issueDate: EMPTY_DATE, expiryDate: EMPTY_DATE, credentialId: "", credentialUrl: "" };
    case "skills":
      return { id, category: "", items: [] };
    case "customSections":
      return { id, heading: "", subheading: "", url: "", date: EMPTY_DATE, bullets: [] };
  }
}

/** The array a list op targets: a section, or the items of one custom section. */
function listOf(d: Resume, section: ListSection, customId?: string): AnyItem[] {
  if (section === "customSections") return (d.customSections.find((c) => c.id === customId)?.items ?? []) as unknown as AnyItem[];
  return d[section] as unknown as AnyItem[];
}

const move = <T,>(xs: T[], from: number, to: number) => {
  if (from === to || from < 0 || to < 0 || from >= xs.length || to >= xs.length) return;
  const [x] = xs.splice(from, 1);
  xs.splice(to, 0, x!);
};

/** Removes ids from the layout once their items are gone (the schema rejects dangling ids). */
function pruneLayout(d: Resume) {
  const ids = new Set(collectIds(d));
  d.layout.hiddenItems = d.layout.hiddenItems.filter((id) => ids.has(id));
  const custom = new Set(d.customSections.map((c) => `custom:${c.id}`));
  const ok = (k: string) => !k.startsWith("custom:") || custom.has(k);
  d.layout.sectionOrder = d.layout.sectionOrder.filter(ok);
  d.layout.hiddenSections = d.layout.hiddenSections.filter(ok);
}

export const useEditorStore = create<EditorState>()((set, get) => {
  const mutate = (fn: (draft: Resume, s: EditorState) => void, extra: (s: EditorState) => Partial<EditorState> = () => ({})) =>
    set((s) => {
      if (!s.content) return {};
      const draft = structuredClone(s.content);
      fn(draft, s);
      return { content: draft, revision: s.revision + 1, scoreOutdated: true, ...extra(s) };
    });

  const bulletsOf = (d: Resume, section: BulletSection | "customSections", itemId: string, customId?: string): Bullet[] | undefined =>
    (listOf(d, section, customId).find((x) => x.id === itemId)?.bullets as Bullet[] | undefined) ?? undefined;

  return {
    versionId: null,
    content: null,
    template: "Classic",
    active: "personal",
    userEdited: new Set(),
    zoom: 0.7,
    revision: 0,
    savedRevision: 0,
    scoreOutdated: false,
    savedAt: null,

    load: (v, pane = "personal") => {
      const content = structuredClone(v.content);
      // Every custom section gets a slot in sectionOrder so drag indices line up.
      content.layout.sectionOrder = orderedSections(content) as Resume["layout"]["sectionOrder"];
      set({
        versionId: v.id,
        content,
        template: v.template,
        active: pane,
        userEdited: new Set(),
        revision: 0,
        savedRevision: 0,
        scoreOutdated: v.score?.outdated ?? false,
        savedAt: v.savedAt,
      });
    },
    setTemplate: (template) => set({ template }),
    setActive: (active) => set({ active }),
    zoomBy: (delta) => set((s) => ({ zoom: Math.min(1.5, Math.max(0.4, Math.round((s.zoom + delta) * 10) / 10)) })),
    zoomTo: (zoom) => set({ zoom }),
    markSaved: (revision) => set((s) => ({ savedRevision: Math.max(s.savedRevision, revision), savedAt: new Date() })),

    setPersonal: (field, value) => mutate((d) => void (d.personalInfo[field] = value)),
    setLinks: (urls) =>
      mutate((d) => {
        const keep = urls.map((u) => u.trim()).filter(Boolean);
        const taken = new Set<string>();
        d.personalInfo.links = keep.map((url) => {
          const prev = d.personalInfo.links.find((l) => l.url === url);
          if (prev) return prev;
          const id = nextId(d, "ln", taken);
          taken.add(id);
          const type = /linkedin\.com/i.test(url) ? "linkedin" : /github\.com/i.test(url) ? "github" : "other";
          return { id, type, label: "", url };
        });
      }),
    editSummary: (text) => mutate((d) => void (d.summary.text = text)),

    editItem: (section, itemId, patch, customId) =>
      mutate((d) => {
        if (section === "customSections" && !customId) {
          const c = d.customSections.find((x) => x.id === itemId);
          if (c && typeof patch.title === "string") c.title = patch.title;
          return;
        }
        const item = listOf(d, section, customId).find((x) => x.id === itemId);
        if (item) Object.assign(item, patch);
      }),
    setDates: (section, itemId, text, customId) =>
      mutate((d) => {
        const item = listOf(d, section, customId).find((x) => x.id === itemId);
        if (!item) return;
        const [start = "", end = ""] = text.split(/\s+[–—-]\s+|\s+to\s+/i);
        if (section === "customSections") return void (item.date = parseResumeDate(start.trim()).date);
        if (section === "certifications") return void (item.issueDate = parseResumeDate(start.trim()).date);
        item.startDate = parseResumeDate(start.trim()).date;
        const e = parseResumeDate(end.trim());
        if ("isCurrent" in item) item.isCurrent = e.isPresent;
        item.endDate = e.isPresent ? { value: null, raw: "Present" } : e.date;
      }),
    addItem: (section, customId) => {
      const c = get().content;
      if (!c) return "";
      const id = nextId(c, section === "customSections" ? "ci" : PREFIX[section]);
      mutate((d) => void listOf(d, section, customId).push(blank(section, id)));
      return id;
    },
    removeItem: (section, itemId, customId) =>
      mutate((d) => {
        const xs = listOf(d, section, customId);
        const i = xs.findIndex((x) => x.id === itemId);
        if (i >= 0) xs.splice(i, 1);
        pruneLayout(d);
      }),
    moveItem: (section, from, to, customId) => mutate((d) => move(listOf(d, section, customId), from, to)),
    toggleItemHidden: (id) =>
      mutate((d) => {
        const h = new Set(d.layout.hiddenItems);
        if (h.has(id)) h.delete(id);
        else h.add(id);
        d.layout.hiddenItems = [...h];
      }),

    editBullet: (section, itemId, bulletId, text, customId) =>
      mutate(
        (d) => {
          const b = bulletsOf(d, section, itemId, customId)?.find((x) => x.id === bulletId);
          if (b) b.text = text;
        },
        (s) => ({ userEdited: new Set(s.userEdited).add(bulletId) }),
      ),
    addBullet: (section, itemId, customId) => {
      const c = get().content;
      if (!c) return;
      const id = nextId(c, "b");
      mutate(
        (d) => void bulletsOf(d, section, itemId, customId)?.push(section === "workExperience" ? ({ id, text: "", kind: "responsibility" } as Bullet) : { id, text: "" }),
        (s) => ({ userEdited: new Set(s.userEdited).add(id) }),
      );
    },
    removeBullet: (section, itemId, bulletId, customId) =>
      mutate((d) => {
        const bs = bulletsOf(d, section, itemId, customId);
        const i = bs?.findIndex((x) => x.id === bulletId) ?? -1;
        if (bs && i >= 0) bs.splice(i, 1);
        pruneLayout(d);
      }),
    moveBullet: (section, itemId, from, to, customId) =>
      mutate((d) => {
        const bs = bulletsOf(d, section, itemId, customId);
        if (bs) move(bs, from, to);
      }),

    setSkillNames: (groupId, names) =>
      mutate((d) => {
        const g = d.skills.find((x) => x.id === groupId);
        if (!g) return;
        const taken = new Set<string>();
        g.items = names
          .map((n) => n.trim())
          .filter(Boolean)
          .map((name) => {
            const prev = g.items.find((i) => i.name === name);
            if (prev) return prev;
            const id = nextId(d, "s", taken);
            taken.add(id);
            return { id, name };
          });
        pruneLayout(d);
      }),

    toggleSection: (key) =>
      mutate((d) => {
        const h = new Set<string>(d.layout.hiddenSections);
        if (h.has(key)) h.delete(key);
        else h.add(key);
        d.layout.hiddenSections = [...h] as Resume["layout"]["hiddenSections"];
      }),
    moveSection: (from, to) => mutate((d) => move(d.layout.sectionOrder, from, to)),
    addCustomSection: () => {
      const c = get().content;
      if (!c) return "";
      const id = nextId(c, "cs");
      mutate(
        (d) => {
          d.customSections.push({ id, title: "New section", items: [] });
          d.layout.sectionOrder.push(`custom:${id}` as Resume["layout"]["sectionOrder"][number]);
        },
        () => ({ active: `custom:${id}` }),
      );
      return id;
    },
    removeCustomSection: (id) =>
      mutate(
        (d) => {
          d.customSections = d.customSections.filter((c) => c.id !== id);
          pruneLayout(d);
        },
        () => ({ active: "summary" }),
      ),
  };
});

/** Section keys in display order: layout order, then any custom section missing from it. */
export function orderedSections(r: Resume): string[] {
  const order = [...r.layout.sectionOrder] as string[];
  for (const c of r.customSections) if (!order.includes(`custom:${c.id}`)) order.push(`custom:${c.id}`);
  return order;
}
