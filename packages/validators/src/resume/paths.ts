import type { Resume } from "./schema";

/**
 * Reads the value at a field path (`workExperience[id=we_1].startDate`,
 * `personalInfo.email`). Returns undefined when the path no longer
 * exists (the item was deleted). Used to tell whether the user changed a
 * flagged field during review.
 */
export function valueAtPath(resume: Resume, path: string): unknown {
  let cur: unknown = resume;
  for (const seg of path.split(".")) {
    const m = /^([a-zA-Z]+)(?:\[id=([^\]]+)\])?$/.exec(seg);
    if (!m || cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[m[1]!];
    if (m[2] !== undefined) {
      if (!Array.isArray(cur)) return undefined;
      cur = cur.find((x) => (x as { id?: string })?.id === m[2]);
    }
  }
  return cur;
}
