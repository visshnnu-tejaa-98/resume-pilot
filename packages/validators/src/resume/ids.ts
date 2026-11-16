import type { Resume } from "./schema";

/**
 * App-generated item ids (prd.md §6.3): short, stable, never produced
 * by the model. Prefix per kind, then a counter that never reuses a
 * number already present, so ids from the original survive into
 * generated versions and new items don't collide with them.
 */
export const ID_PREFIX = {
  link: "ln",
  work: "we",
  education: "ed",
  skillGroup: "sk",
  skill: "s",
  project: "pr",
  certification: "ce",
  custom: "cs",
  customItem: "ci",
  bullet: "b",
} as const;

export type IdKind = keyof typeof ID_PREFIX;

export class IdAllocator {
  private next = new Map<string, number>();

  /** Starts counters past any ids already in use (e.g. the source version's). */
  constructor(existingIds: Iterable<string> = []) {
    for (const id of existingIds) {
      const m = /^([a-z][a-z0-9]*)_([0-9]+)$/.exec(id);
      if (m) this.next.set(m[1]!, Math.max(this.next.get(m[1]!) ?? 1, Number(m[2]) + 1));
    }
  }

  take(kind: IdKind): string {
    const prefix = ID_PREFIX[kind];
    const n = this.next.get(prefix) ?? 1;
    this.next.set(prefix, n + 1);
    return `${prefix}_${n}`;
  }
}

/** Recursive "same shape, but ids and fields optional" — what the model and v1 data give us. */
type Draft<T> = T extends (infer U)[]
  ? Draft<U>[]
  : T extends object
    ? { [K in keyof T as K extends "id" ? never : K]?: Draft<T[K]> } & { id?: string }
    : T;

export type ResumeDraft = Draft<Omit<Resume, "schemaVersion" | "layout">>;

/**
 * Gives every item that lacks a valid id an app id, keeping any valid
 * id it already has. Tolerates missing fields (they're filled by the
 * schema's defaults afterwards). Pure: returns a new object.
 */
export function assignIds(draft: ResumeDraft, alloc: IdAllocator = new IdAllocator()): ResumeDraft {
  const keep = (id: string | undefined, kind: IdKind) =>
    id && /^[a-z][a-z0-9]*_[0-9]+$/.test(id) ? id : alloc.take(kind);
  const list = <T>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);
  const bullets = <B extends { id?: string }>(items: B[] | undefined) =>
    list(items).map((b) => ({ ...b, id: keep(b.id, "bullet") }));

  return {
    ...draft,
    personalInfo: {
      ...draft.personalInfo,
      links: list(draft.personalInfo?.links).map((l) => ({ ...l, id: keep(l.id, "link") })),
    },
    workExperience: list(draft.workExperience).map((w) => ({
      ...w,
      id: keep(w.id, "work"),
      bullets: bullets(w.bullets),
    })),
    education: list(draft.education).map((e) => ({
      ...e,
      id: keep(e.id, "education"),
      bullets: bullets(e.bullets),
    })),
    skills: list(draft.skills).map((g) => ({
      ...g,
      id: keep(g.id, "skillGroup"),
      items: list(g.items).map((i) => ({ ...i, id: keep(i.id, "skill") })),
    })),
    projects: list(draft.projects).map((p) => ({
      ...p,
      id: keep(p.id, "project"),
      bullets: bullets(p.bullets),
    })),
    certifications: list(draft.certifications).map((c) => ({
      ...c,
      id: keep(c.id, "certification"),
    })),
    customSections: list(draft.customSections).map((c) => ({
      ...c,
      id: keep(c.id, "custom"),
      items: list(c.items).map((i) => ({
        ...i,
        id: keep(i.id, "customItem"),
        bullets: bullets(i.bullets),
      })),
    })),
  };
}
