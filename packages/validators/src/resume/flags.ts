import type { ExtractionMeta, Resume } from "./schema";

/**
 * Deterministic confidence flags for an extracted resume — prd.md §5.3
 * step 5, §6.2. Runs after the model's JSON is validated; the model
 * never decides what's uncertain.
 *
 * - `ocr_line`: the value came from a line OCR read with low
 *   confidence. Below 60% that's `low`, otherwise `medium`.
 * - `not_in_source`: a key fact (company, title, institution, degree,
 *   email, phone) doesn't appear in the uploaded text, so the model may
 *   have invented or "corrected" it. Always `low`.
 * - `partial_date`: a job date with only a year (prd §6.2's example).
 *
 * Every flag carries `source`, so the review screen can show exactly
 * which line and confidence it came from.
 */

export interface LowConfidenceLineInput {
  page: number;
  text: string;
  confidence: number;
}

export const LOW_CONFIDENCE_BELOW = 60;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}@.+]+/gu, " ")
    .trim();
const tokens = (s: string) =>
  norm(s)
    .split(" ")
    .filter((t) => t.length > 1);
const digits = (s: string) => s.replace(/\D/g, "");

/** The lowest-confidence OCR line this value was (most likely) read from. */
function sourceLine(
  value: string,
  lines: readonly LowConfidenceLineInput[],
): LowConfidenceLineInput | undefined {
  const v = tokens(value);
  if (v.length === 0) return undefined;
  let best: LowConfidenceLineInput | undefined;
  for (const line of lines) {
    const l = new Set(tokens(line.text));
    if (l.size === 0) continue;
    const shared = v.filter((t) => l.has(t)).length;
    // Most of the value's words are on that line (a short value must match fully).
    const matches = shared / v.length >= (v.length <= 2 ? 1 : 0.6);
    if (matches && (!best || line.confidence < best.confidence)) best = line;
  }
  return best;
}

export function flagExtraction(
  resume: Resume,
  source: { rawText: string; lowConfidenceLines?: readonly LowConfidenceLineInput[] },
): ExtractionMeta {
  const meta: ExtractionMeta = {};
  const lines = source.lowConfidenceLines ?? [];
  const haystack = ` ${norm(source.rawText)} `;
  const haystackDigits = digits(source.rawText);

  const put = (path: string, entry: ExtractionMeta[string]) => {
    const existing = meta[path];
    // Keep the most severe flag per field.
    if (!existing || (existing.confidence === "medium" && entry.confidence === "low"))
      meta[path] = entry;
  };

  const checkOcr = (path: string, value: string) => {
    if (!value.trim()) return;
    const line = sourceLine(value, lines);
    if (!line) return;
    put(path, {
      confidence: line.confidence < LOW_CONFIDENCE_BELOW ? "low" : "medium",
      reason: `Read by OCR at ${line.confidence}% confidence (page ${line.page}). Check it's right.`,
      reviewed: false,
      source: {
        kind: "ocr_line",
        page: line.page,
        line: line.text.slice(0, 500),
        ocrConfidence: line.confidence,
      },
    });
  };

  const checkInSource = (path: string, value: string, kind: "text" | "phone" = "text") => {
    if (!value.trim()) return;
    const found =
      kind === "phone"
        ? digits(value).length >= 6 && haystackDigits.includes(digits(value).slice(-8))
        : haystack.includes(` ${norm(value)} `) || haystack.includes(norm(value));
    if (!found) {
      put(path, {
        confidence: "low",
        reason: "Not found in your uploaded file. Check it wasn't misread.",
        reviewed: false,
        source: { kind: "not_in_source" },
      });
    }
  };

  const checkDate = (path: string, date: { value: string | null; raw: string }) => {
    checkOcr(path, date.raw);
    if (date.value && /^\d{4}$/.test(date.value) && date.raw.trim()) {
      put(path, {
        confidence: "low",
        reason: "Only year found",
        reviewed: false,
        source: { kind: "partial_date" },
      });
    }
  };

  const p = resume.personalInfo;
  for (const field of ["firstName", "lastName", "headline", "location"] as const) {
    checkOcr(`personalInfo.${field}`, p[field]);
  }
  checkOcr("personalInfo.email", p.email);
  checkInSource("personalInfo.email", p.email);
  checkOcr("personalInfo.phone", p.phone);
  checkInSource("personalInfo.phone", p.phone, "phone");

  for (const w of resume.workExperience) {
    const at = `workExperience[id=${w.id}]`;
    for (const field of ["company", "designation"] as const) {
      checkOcr(`${at}.${field}`, w[field]);
      checkInSource(`${at}.${field}`, w[field]);
    }
    checkOcr(`${at}.location`, w.location);
    checkDate(`${at}.startDate`, w.startDate);
    if (!w.isCurrent) checkDate(`${at}.endDate`, w.endDate);
    for (const b of w.bullets) checkOcr(`${at}.bullets[id=${b.id}]`, b.text);
  }

  for (const e of resume.education) {
    const at = `education[id=${e.id}]`;
    for (const field of ["institution", "degree"] as const) {
      checkOcr(`${at}.${field}`, e[field]);
      checkInSource(`${at}.${field}`, e[field]);
    }
    checkOcr(`${at}.fieldOfStudy`, e.fieldOfStudy);
    checkOcr(`${at}.grade`, e.grade.value);
    // Year-only is normal for education, so only OCR doubt flags these.
    checkOcr(`${at}.startDate`, e.startDate.raw);
    checkOcr(`${at}.endDate`, e.endDate.raw);
  }

  for (const g of resume.skills) {
    for (const s of g.items) checkOcr(`skills[id=${g.id}].items[id=${s.id}]`, s.name);
  }
  for (const pr of resume.projects) {
    checkOcr(`projects[id=${pr.id}].name`, pr.name);
    for (const b of pr.bullets) checkOcr(`projects[id=${pr.id}].bullets[id=${b.id}]`, b.text);
  }
  for (const c of resume.certifications) {
    checkOcr(`certifications[id=${c.id}].name`, c.name);
    checkOcr(`certifications[id=${c.id}].issuer`, c.issuer);
  }
  return meta;
}
