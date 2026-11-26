import { describe, expect, it } from "vitest";
import { JD_TEXTS } from "../eval/jd-texts";
import { EVAL_PAIRS, JD_ANALYSES, RESUMES } from "./generation/fixtures";
import { generateTailoredResume } from "./generation/generate";
import { analyzeJobDescription } from "./jd-analysis";
import { MockResponsesClient, resolveAIClient } from "./mock";
import { scoreResume } from "./scoring/report";
import { structureResume } from "./structure";

const client = new MockResponsesClient(() => 0);

describe("MockResponsesClient through the real pipeline", () => {
  it("analyses every eval JD into a valid analysis", async () => {
    for (const text of Object.values(JD_TEXTS)) {
      const r = await analyzeJobDescription(client, { jdText: text, model: "gpt-5-mini", maxOutputTokens: 3000 });
      expect(r.analysis.requirements.length).toBeGreaterThan(0);
      expect(r.usage.outputTokens).toBeGreaterThan(0);
    }
  });

  it("generates a grounded resume for all 50 pairs on the first attempt, then scores it", async () => {
    for (const p of EVAL_PAIRS) {
      const g = await generateTailoredResume(client, { source: RESUMES[p.resume]!, analysis: JD_ANALYSES[p.jd]!, model: "gpt-5-mini", maxOutputTokens: 6000 });
      expect(g.attempts).toBe(1);
      const s = await scoreResume(client, { resume: g.resume, analysis: JD_ANALYSES[p.jd]!, model: "gpt-5-mini", maxOutputTokens: 5000, asOf: new Date() });
      expect(s.report.requirements.length).toBe(JD_ANALYSES[p.jd]!.requirements.length);
    }
  }, 60_000);

  it("extracts a schema-valid resume from raw text", async () => {
    const raw = "Asha Rao\nFrontend engineer building React apps.\nasha@example.com · +91 98000 00021\n- Built a design system in React and TypeScript\n- Wrote Playwright tests";
    const r = await structureResume(client, { rawText: raw, model: "gpt-5-mini" });
    expect(r.resume.personalInfo.firstName).toBe("Asha");
    expect(r.resume.personalInfo.email).toBe("asha@example.com");
    expect(r.resume.skills[0]!.items.map((i) => i.name)).toEqual(expect.arrayContaining(["React", "TypeScript", "Playwright"]));
  });
});

describe("resolveAIClient", () => {
  it("uses the mock locally without a usable key, or when forced", async () => {
    expect((await resolveAIClient({ NODE_ENV: "development" })).mode).toBe("mock");
    expect((await resolveAIClient({ NODE_ENV: "development", OPENAI_API_KEY: "not-a-key" })).mode).toBe("mock");
    expect((await resolveAIClient({ NODE_ENV: "development", OPENAI_API_KEY: "sk-proj-abcdefghijklmnopqrstuvwxyz", AI_MOCK: "1" })).mode).toBe("mock");
  });

  it("never uses the mock in production", async () => {
    await expect(resolveAIClient({ NODE_ENV: "production" })).rejects.toThrow(/production/);
    await expect(resolveAIClient({ NODE_ENV: "production", AI_MOCK: "1" })).rejects.toThrow(/production/);
  });
});
