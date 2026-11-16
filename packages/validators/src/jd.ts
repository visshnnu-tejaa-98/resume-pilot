import { z } from "zod";

/** prd.md §7.1 / §16.2.7: 200–30,000 characters after trimming. Shared by the form and the server. */
export const JD_TEXT_MIN = 200;
export const JD_TEXT_MAX = 30_000;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const jdTextSchema = z
  .string()
  .trim()
  .min(JD_TEXT_MIN, `Paste at least ${JD_TEXT_MIN} characters of the job description.`)
  .max(JD_TEXT_MAX, `Job descriptions can be at most ${JD_TEXT_MAX.toLocaleString("en-IN")} characters.`);

export const jdInputSchema = z.object({
  text: jdTextSchema,
  companyName: optionalText(200),
  jobTitle: optionalText(200),
  /** Stored for the user's reference only; never fetched in Phase 1. */
  postingUrl: optionalText(2000).refine(
    (v) => v === null || /^https?:\/\/\S+$/i.test(v),
    "Posting link must start with http:// or https://",
  ),
});

export type JdInput = z.input<typeof jdInputSchema>;

/** Editing a JD's text creates a new record (§7.1); the old one stays for versions built from it. */
export const reviseJdInputSchema = jdInputSchema.extend({ jdId: z.uuid() });
