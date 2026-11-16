import { parseDateRange, parseResumeDate } from "./dates";
import { assignIds, IdAllocator, type ResumeDraft } from "./ids";
import { RESUME_SCHEMA_VERSION, resumeSchema, type Resume } from "./schema";

/**
 * Schema migrations — prd.md §6.3: "schemaVersion is checked on read;
 * migrations are pure functions migrate_1_0_to_2_0(json) run lazily and
 * saved back".
 *
 * The PRD doesn't spell out the v1.1 shape, only its gaps (no ids, no
 * section order/visibility, undefined custom sections, free-text dates).
 * This assumes the v1 shape implied by those gaps and is lenient about
 * what it reads:
 *   - no ids anywhere
 *   - dates as plain strings ("Jan 2021"), or one `duration` string
 *     ("Jan 2021 - Present") on jobs
 *   - bullets as plain strings; job bullets may be `responsibilities`
 *   - `skills` as a flat string array (or comma-separated string)
 *   - no layout
 * No v1 rows exist yet; revisit if real v1 data turns up.
 */

type Json = Record<string, unknown>;

const str = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Json =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};

const toDate = (v: unknown) => {
  if (v && typeof v === "object") return v as { value: string | null; raw: string };
  return parseResumeDate(str(v)).date;
};
const toBullets = (v: unknown) =>
  arr(v).map((b) => (typeof b === "string" ? { text: b } : { text: str(obj(b).text) }));

export function migrate_1_0_to_2_0(v1: unknown): Resume {
  const src = obj(v1);
  const pi = obj(src.personalInfo ?? src.contact);

  // v1 sometimes stored the name as one string.
  let firstName = str(pi.firstName);
  let lastName = str(pi.lastName);
  if (!firstName && !lastName && str(pi.name)) {
    const [first, ...rest] = str(pi.name).trim().split(/\s+/);
    firstName = first ?? "";
    lastName = rest.join(" ");
  }

  const draft: ResumeDraft = {
    personalInfo: {
      firstName,
      lastName,
      headline: str(pi.headline ?? pi.title),
      email: str(pi.email),
      phone: str(pi.phone),
      location: str(pi.location),
      links: arr(pi.links).map((l) =>
        typeof l === "string"
          ? { type: linkType(l), label: "", url: l }
          : { type: linkType(str(obj(l).url)), label: str(obj(l).label), url: str(obj(l).url) },
      ),
    },
    summary: { text: str(typeof src.summary === "string" ? src.summary : obj(src.summary).text) },
    workExperience: arr(src.workExperience ?? src.experience).map((raw) => {
      const w = obj(raw);
      const range = w.duration ? parseDateRange(str(w.duration)) : null;
      const end = range ? range.end : parseResumeDate(str(w.endDate));
      const isCurrent = Boolean(w.isCurrent) || end.isPresent;
      return {
        company: str(w.company),
        designation: str(w.designation ?? w.title ?? w.role),
        location: str(w.location),
        startDate: range ? range.start.date : toDate(w.startDate),
        endDate: isCurrent ? { value: null, raw: end.date.raw } : end.date,
        isCurrent,
        bullets: toBullets(w.bullets ?? w.responsibilities).map((b) => ({
          ...b,
          kind: "responsibility" as const,
        })),
        skillsUsed: arr(w.skillsUsed).map(str).filter(Boolean),
      };
    }),
    education: arr(src.education).map((raw) => {
      const e = obj(raw);
      return {
        institution: str(e.institution ?? e.school),
        degree: str(e.degree),
        fieldOfStudy: str(e.fieldOfStudy ?? e.field),
        location: str(e.location),
        startDate: toDate(e.startDate),
        endDate: toDate(e.endDate ?? e.year),
        grade: { value: str(e.grade ?? e.gpa), scale: null },
        bullets: toBullets(e.bullets),
      };
    }),
    skills: migrateSkills(src.skills),
    projects: arr(src.projects).map((raw) => {
      const p = obj(raw);
      return {
        name: str(p.name ?? p.title),
        role: str(p.role),
        url: str(p.url ?? p.link),
        startDate: toDate(p.startDate),
        endDate: toDate(p.endDate),
        bullets: toBullets(p.bullets ?? p.description),
        technologies: arr(p.technologies ?? p.tech)
          .map(str)
          .filter(Boolean),
      };
    }),
    certifications: arr(src.certifications).map((raw) => {
      const c = typeof raw === "string" ? { name: raw } : obj(raw);
      return {
        name: str(c.name),
        issuer: str(c.issuer),
        issueDate: toDate(c.issueDate ?? c.date),
        expiryDate: toDate(c.expiryDate),
        credentialId: str(c.credentialId),
        credentialUrl: str(c.credentialUrl ?? c.url),
      };
    }),
    customSections: [],
  };

  return resumeSchema.parse({
    schemaVersion: RESUME_SCHEMA_VERSION,
    ...assignIds(draft, new IdAllocator()),
  });
}

function linkType(url: string): "linkedin" | "github" | "portfolio" | "other" {
  if (/linkedin\.com/i.test(url)) return "linkedin";
  if (/github\.com/i.test(url)) return "github";
  return url ? "portfolio" : "other";
}

function migrateSkills(v: unknown): ResumeDraft["skills"] {
  const list = typeof v === "string" ? v.split(/[,;|]/) : arr(v);
  // Already grouped (v2-like): keep groups.
  if (list.length > 0 && list.every((g) => g && typeof g === "object" && "items" in (g as Json))) {
    return list.map((g) => ({
      category: str(obj(g).category),
      items: arr(obj(g).items).map((i) => ({ name: typeof i === "string" ? i : str(obj(i).name) })),
    }));
  }
  const names = list
    .map((s) => (typeof s === "string" ? s : str(obj(s).name)).trim())
    .filter(Boolean);
  return names.length ? [{ category: "Skills", items: names.map((name) => ({ name })) }] : [];
}

export class UnsupportedSchemaVersionError extends Error {
  constructor(readonly version: unknown) {
    super(`Unsupported resume schemaVersion: ${JSON.stringify(version)}`);
    this.name = "UnsupportedSchemaVersionError";
  }
}

/**
 * Reads stored resume JSON: validates 2.0 as-is, migrates older
 * versions. `migrated` tells the caller to save the result back (lazy
 * migration). A version newer than this code knows is refused rather
 * than silently downgraded.
 */
export function readResume(json: unknown): { resume: Resume; migrated: boolean } {
  const version = obj(json).schemaVersion ?? "1.0";
  if (version === RESUME_SCHEMA_VERSION)
    return { resume: resumeSchema.parse(json), migrated: false };
  if (version === "1.0" || version === "1.1" || version === 1 || version === 1.1) {
    return { resume: migrate_1_0_to_2_0(json), migrated: true };
  }
  throw new UnsupportedSchemaVersionError(version);
}
