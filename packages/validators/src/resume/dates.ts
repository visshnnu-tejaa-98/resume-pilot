import type { ResumeDate } from "./schema";

/**
 * Turns what a resume says into `{ value, raw }` (prd.md §6.3). `value`
 * is `YYYY-MM` when the month is known, `YYYY` when only the year is,
 * null when neither is. `raw` always keeps the original text.
 * `isPresent` flags "Present", "Current", "Now", "Till date" etc.
 */

const MONTHS: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

const PRESENT = /^(present|current|currently|now|ongoing|till date|to date|today)$/i;
const YEAR = "((?:19|20)\\d{2})";

export interface ParsedResumeDate {
  date: ResumeDate;
  isPresent: boolean;
}

export function parseResumeDate(input: string | null | undefined): ParsedResumeDate {
  const raw = (input ?? "").trim().slice(0, 100);
  const lower = raw.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  const result = (value: string | null, isPresent = false): ParsedResumeDate => ({
    date: { value, raw },
    isPresent,
  });

  if (!lower) return result(null);
  if (PRESENT.test(lower)) return result(null, true);

  // 2021-06, 2021/06, 2021.06
  let m = new RegExp(`^${YEAR}[-/.](\\d{1,2})$`).exec(lower);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12)
    return result(`${m[1]}-${m[2]!.padStart(2, "0")}`);

  // 06/2021, 6-2021
  m = new RegExp(`^(\\d{1,2})[-/.]${YEAR}$`).exec(lower);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12)
    return result(`${m[2]}-${m[1]!.padStart(2, "0")}`);

  // Jan 2021, January 2021, Jan '21 is not supported (ambiguous century)
  m = new RegExp(`^([a-z]+)\\s+${YEAR}$`).exec(lower);
  if (m) {
    const month = MONTHS[m[1]!];
    // "Summer 2021", "Fall 2019": the year is known, the month isn't.
    return result(month ? `${m[2]}-${month}` : m[2]!);
  }

  // 2021, or a year anywhere ("Class of 2017", "Expected 2025")
  m = new RegExp(`\\b${YEAR}\\b`).exec(lower);
  if (m) return result(m[1]!);

  return result(null);
}

/** Splits a range like "Jan 2021 – Present" or "2017 to 2020" into its two ends. */
export function parseDateRange(input: string): { start: ParsedResumeDate; end: ParsedResumeDate } {
  const parts = input.split(/\s*(?:–|—|-{1,2}|\bto\b|\btill\b|\buntil\b)\s*/i);
  // "2021-06" alone shouldn't be split on its hyphen.
  if (
    parts.length === 2 &&
    /^\d{4}$/.test(parts[0]!.trim()) &&
    /^\d{1,2}$/.test(parts[1]!.trim())
  ) {
    return { start: parseResumeDate(input), end: parseResumeDate("") };
  }
  return { start: parseResumeDate(parts[0]), end: parseResumeDate(parts.slice(1).join(" ")) };
}
