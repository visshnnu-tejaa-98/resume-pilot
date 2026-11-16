import { z } from "zod";
import { parseResumeDate } from "./dates";
import { assignIds, IdAllocator, type ResumeDraft } from "./ids";
import {
  DATE_VALUE_PATTERN,
  RESUME_SCHEMA_VERSION,
  resumeContentShape,
  resumeSchema,
  type Resume,
} from "./schema";

/**
 * OpenAI Structured Outputs from the canonical resume schema (prd.md
 * §6.3: "the same schema generates the OpenAI Structured Outputs JSON
 * schema"). Nothing here is hand-written: the JSON schema is derived
 * from `resumeContentShape` and then made strict-mode compatible.
 *
 * What the model fills is the content only. `id`, `schemaVersion` and
 * `layout` are app-owned and stripped; `fromStructuredOutput` adds them
 * back (ids via IdAllocator) and validates against `resumeSchema`.
 *
 * Strict-mode rules applied (OpenAI): every object lists all its
 * properties as required and sets additionalProperties: false; a field
 * that's optional in Zod becomes nullable instead; no `default`; no
 * string length keywords.
 */

export type JsonSchema = Record<string, unknown> & {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  anyOf?: JsonSchema[];
};

/** Keywords strict mode rejects or that only make sense app-side. */
const DROP_KEYWORDS = ["$schema", "default", "minLength", "maxLength", "$id", "title"];

function isNullable(s: JsonSchema): boolean {
  return s.type === "null" || (Array.isArray(s.anyOf) && s.anyOf.some((a) => a.type === "null"));
}

function nullable(s: JsonSchema): JsonSchema {
  return isNullable(s) ? s : { anyOf: [s, { type: "null" }] };
}

export function strictify(node: JsonSchema, dropProperties: ReadonlySet<string> = new Set()): JsonSchema {
  const out: JsonSchema = {};
  for (const [key, value] of Object.entries(node)) {
    if (!DROP_KEYWORDS.includes(key)) out[key] = value;
  }
  if (out.anyOf) out.anyOf = out.anyOf.map((s) => strictify(s, dropProperties));
  if (out.items) out.items = strictify(out.items, dropProperties);

  if (out.properties) {
    const required = new Set(out.required ?? []);
    const properties: Record<string, JsonSchema> = {};
    for (const [name, prop] of Object.entries(out.properties)) {
      if (dropProperties.has(name)) continue;
      // Zod fields with a default come out non-required in input mode;
      // strict mode needs them required, so they become nullable instead.
      const strictProp = strictify(prop, dropProperties);
      properties[name] = required.has(name) ? strictProp : nullable(strictProp);
    }
    out.properties = properties;
    out.required = Object.keys(properties);
    out.additionalProperties = false;
  }
  return out;
}

/** The content the model extracts or rewrites: no ids, version or layout. */
export const resumeModelShape = resumeContentShape.omit({ schemaVersion: true, layout: true });

/** Strict JSON schema for the Responses API, derived from the canonical Zod schema. */
export function resumeJsonSchema(): JsonSchema {
  const generated = z.toJSONSchema(resumeModelShape, {
    target: "draft-7",
    io: "input",
    reused: "inline",
  }) as JsonSchema;
  return strictify(generated, new Set(["id"]));
}

/** `text.format` for `responses.create` — prd.md §5.3 step 4, §8. */
export function resumeResponseFormat() {
  return {
    type: "json_schema" as const,
    name: "resume",
    strict: true,
    schema: resumeJsonSchema(),
  };
}

/** Model output uses null for "absent"; Zod defaults expect undefined. */
function nullsToUndefined(value: unknown): unknown {
  if (value === null) return undefined;
  if (Array.isArray(value)) return value.map(nullsToUndefined);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, nullsToUndefined(v)]),
    );
  }
  return value;
}

/** Dates are `{value, raw}`; keep null `value`s that strict mode delivered as such. */
function repairDates(value: unknown, parentKey = ""): unknown {
  if (Array.isArray(value)) return value.map((v) => repairDates(v, parentKey));
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("raw" in obj && "value" in obj && Object.keys(obj).length === 2) {
      const raw = typeof obj.raw === "string" ? obj.raw : "";
      const v = obj.value;
      // A malformed value ("June 2021" in the value slot) is re-derived from raw.
      if (typeof v === "string" && !DATE_VALUE_PATTERN.test(v)) {
        return { value: parseResumeDate(raw || v).date.value, raw: raw || v };
      }
      return { value: typeof v === "string" ? v : null, raw };
    }
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, repairDates(v, k)]));
  }
  return value;
}

export class ResumeOutputError extends Error {
  constructor(readonly issues: z.core.$ZodIssue[]) {
    super(
      `Model output is not a valid resume: ${issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
    this.name = "ResumeOutputError";
  }
}

/**
 * Turns the model's Structured Outputs JSON into a canonical Resume:
 * nulls become defaults, malformed date values are re-derived from
 * `raw`, a current job has no end date, every item gets an app id
 * (keeping `existingIds` stable), and the result is validated.
 */
export function fromStructuredOutput(
  output: unknown,
  opts: { existingIds?: Iterable<string>; layout?: Resume["layout"] } = {},
): Resume {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    throw new ResumeOutputError([
      {
        code: "custom",
        path: [],
        message: "Expected an object",
        input: output,
      } as z.core.$ZodIssue,
    ]);
  }
  const cleaned = repairDates(nullsToUndefined(output)) as ResumeDraft;
  // The schema the model saw has no ids, so it never supplies any; the
  // app assigns them all here, keeping counters past `existingIds`.
  const withIds = assignIds(cleaned, new IdAllocator(opts.existingIds));
  for (const job of withIds.workExperience ?? []) {
    // Present: a current job carries no end date (§6.3).
    if (job.isCurrent) job.endDate = { raw: job.endDate?.raw ?? "", value: null };
  }

  const parsed = resumeSchema.safeParse({
    schemaVersion: RESUME_SCHEMA_VERSION,
    ...withIds,
    ...(opts.layout ? { layout: opts.layout } : {}),
  });
  if (!parsed.success) throw new ResumeOutputError(parsed.error.issues);
  return parsed.data;
}
