import { strictify, type JsonSchema } from "@resume-pilot/validators/resume";
import { z } from "zod";

/** Range/length keywords strict mode doesn't reliably accept; Zod re-checks them after parsing. */
const STRIP = ["maxItems", "minItems", "minimum", "maximum", "pattern"];

function strip(node: JsonSchema): JsonSchema {
  const out: JsonSchema = {};
  for (const [k, v] of Object.entries(node)) {
    if (STRIP.includes(k)) continue;
    if (k === "properties") out.properties = Object.fromEntries(Object.entries(v as Record<string, JsonSchema>).map(([n, p]) => [n, strip(p)]));
    else if (k === "items") out.items = strip(v as JsonSchema);
    else if (k === "anyOf") out.anyOf = (v as JsonSchema[]).map(strip);
    else out[k] = v;
  }
  return out;
}

/** OpenAI Structured Outputs `text.format` from a Zod schema (strict, closed objects). */
export function strictResponseFormat(name: string, schema: z.ZodType) {
  const json = z.toJSONSchema(schema, { target: "draft-7", io: "input", reused: "inline" }) as JsonSchema;
  return { type: "json_schema" as const, name, strict: true, schema: strip(strictify(json)) };
}
