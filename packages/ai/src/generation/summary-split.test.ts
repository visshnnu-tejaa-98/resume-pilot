import { describe, expect, it } from "vitest";
import { SUMMARY_SPLIT_CHARS, splitLongSummary } from "./assemble";

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const long =
  "Full-stack engineer with 5+ years building React and Node.js products. Led a migration to Next.js, cutting load time by 40%. " +
  "Built payment flows handling 1M+ transactions. Owns features end to end, from PostgreSQL schemas to CI. " +
  "Mentored four developers and ran weekly reviews. Drove accessibility fixes to WCAG 2.1 AA across the app. " +
  "Looking to bring product sense and strong TypeScript skills to a fast-moving team that ships every week. Also built an internal design system used by six product squads and set up observability, alerting and on-call runbooks for the whole platform.";

describe("splitLongSummary", () => {
  it("leaves short summaries alone", () => {
    expect(splitLongSummary("Short. Two sentences.")).toBe("Short. Two sentences.");
  });

  it("splits a long summary into two paragraphs without losing text", () => {
    expect(long.length).toBeGreaterThan(SUMMARY_SPLIT_CHARS);
    const out = splitLongSummary(long);
    expect(out.split("\n\n")).toHaveLength(2);
    expect(norm(out)).toBe(norm(long));
  });

  it("never splits inside Node.js / 2.1", () => {
    for (const p of splitLongSummary(long).split("\n\n")) expect(p).not.toMatch(/^(js|1 )/);
  });

  it("keeps an existing paragraph break and a single long sentence as-is", () => {
    expect(splitLongSummary(`A.\n\nB.`)).toBe("A.\n\nB.");
    const one = "word ".repeat(150).trim();
    expect(splitLongSummary(one)).toBe(one);
  });
});
