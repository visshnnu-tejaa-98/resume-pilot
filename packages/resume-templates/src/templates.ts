/** The five templates (prd.md §10.2). Keys match `resume_templates.key`. All free for every user. */
export const TEMPLATE_KEYS = ["classic", "modern", "minimal", "professional", "technical"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];
export const DEFAULT_TEMPLATE: TemplateKey = "classic";

export const TEMPLATE_NAMES: Record<TemplateKey, string> = {
  classic: "Classic",
  modern: "Modern",
  minimal: "Minimal",
  professional: "Professional",
  technical: "Technical",
};

export const TEMPLATE_DESCRIPTIONS: Record<TemplateKey, string> = {
  classic: "Centred serif header, ruled headings. Safe for any role.",
  modern: "Clean sans-serif with a blue accent rule.",
  minimal: "No rules, plenty of white space.",
  professional: "Serif headings, sans body, soft dividers.",
  technical: "Monospace headings and compact skill rows for engineering roles.",
};

export function isTemplateKey(v: unknown): v is TemplateKey {
  return typeof v === "string" && (TEMPLATE_KEYS as readonly string[]).includes(v);
}

/** Lenient lookup: accepts a key or a display name ("Modern"), else the default. */
export function toTemplateKey(v: string | null | undefined): TemplateKey {
  const k = v?.toLowerCase();
  return isTemplateKey(k) ? k : DEFAULT_TEMPLATE;
}

/**
 * The self-hosted font faces every template uses (@fontsource packages).
 * The web preview imports the same CSS files; the PDF inlines them (node.ts),
 * so both render with identical font files.
 */
export const FONT_FILES = [
  ["@fontsource/inter", [400, 600, 700]],
  ["@fontsource/source-serif-4", [400, 600, 700]],
  ["@fontsource/space-grotesk", [400, 700]],
  ["@fontsource/jetbrains-mono", [400, 700]],
] as const;
