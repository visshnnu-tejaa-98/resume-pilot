/**
 * Term normalisation for the grounding check (prd.md §8.3: skills are
 * compared "case- and synonym-normalised").
 *
 * `termKey` folds case and punctuation ("React.js" → "reactjs") and then
 * maps known aliases to one canonical key ("reactjs" → "react"). JD
 * analyses add their own synonym groups at check time.
 */

/** Canonical key → aliases (already in folded form, i.e. through `fold`). */
const ALIASES: Record<string, string[]> = {
  javascript: ["js", "ecmascript", "es6", "es2015"],
  typescript: ["ts"],
  react: ["reactjs", "reactjsx"],
  reactnative: ["rn"],
  node: ["nodejs"],
  next: ["nextjs"],
  vue: ["vuejs"],
  angular: ["angularjs"],
  express: ["expressjs"],
  kubernetes: ["k8s"],
  postgresql: ["postgres", "psql"],
  mongodb: ["mongo"],
  golang: ["go"],
  csharp: ["c#"],
  dotnet: [".net", "net"],
  cicd: ["ci/cd", "cicd", "continuousintegration"],
  aws: ["amazonwebservices"],
  gcp: ["googlecloud", "googlecloudplatform"],
  azure: ["microsoftazure"],
  machinelearning: ["ml"],
  artificialintelligence: ["ai"],
  python: ["python3"],
  css: ["css3"],
  html: ["html5"],
  graphql: ["gql"],
  tailwind: ["tailwindcss"],
  sql: ["structuredquerylanguage"],
  restapi: ["rest", "restful", "restapis", "restfulapis"],
};

/** Lowercase, keep letters/digits/#/+, drop spaces, dots, hyphens etc. */
export function fold(term: string): string {
  return term
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9#+]/g, "");
}

const ALIAS_TO_CANONICAL = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(ALIASES)) {
  ALIAS_TO_CANONICAL.set(canonical, canonical);
  for (const a of aliases) ALIAS_TO_CANONICAL.set(fold(a), canonical);
}

/** Canonical comparison key for a skill/technology name. */
export function termKey(term: string, extra?: Map<string, string>): string {
  const f = fold(term);
  return extra?.get(f) ?? ALIAS_TO_CANONICAL.get(f) ?? f;
}

/** Synonym groups from a JD analysis (keyword + its synonyms) → extra alias map. */
export function synonymMap(groups: { keywords: string[]; synonyms: string[] }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const g of groups) {
    const all = [...g.keywords, ...g.synonyms].filter(Boolean);
    if (all.length < 2) continue;
    // Prefer a built-in canonical key so built-in and JD aliases agree.
    const canonical = all.map((t) => ALIAS_TO_CANONICAL.get(fold(t))).find(Boolean) ?? fold(all[0]!);
    for (const t of all) m.set(fold(t), canonical);
  }
  return m;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/**
 * Whether `term` occurs in `text` as a whole word/phrase (case-insensitive).
 * Boundaries are "not a letter/digit", so "C++" and "CI/CD" work and
 * "Java" doesn't match inside "JavaScript".
 */
export function mentions(text: string, term: string): boolean {
  const t = term.trim();
  if (!t) return false;
  return new RegExp(`(^|[^A-Za-z0-9])${escape(t)}(?=$|[^A-Za-z0-9+#])`, "i").test(text);
}

/** Every number in a text, normalised ("1,200" → "1200", "38%" → "38", "4.5" stays). */
export function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,(?=\d{3}\b)/g, "").replace(/,/g, "."));
}
