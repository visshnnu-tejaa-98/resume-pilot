import { describe, expect, it } from "vitest";
import { describeAiFailure } from "./ai-errors";

describe("describeAiFailure", () => {
  it("token limit in generation: clear message + admin hint naming Generation", () => {
    const f = describeAiFailure("Model output incomplete: max_output_tokens", "generation");
    expect(f.kind).toBe("token_limit");
    expect(f.message).toMatch(/limit/);
    expect(f.adminHint).toContain("Generation → Max output tokens");
  });

  it("token limit inside the JD-analysis step points the admin at JD analysis, not generation", () => {
    const f = describeAiFailure("The job analysis didn't finish, so the resume wasn't generated: Model output incomplete: max_output_tokens", "generation");
    expect(f.kind).toBe("token_limit");
    expect(f.adminHint).toContain("JD analysis → Max output tokens");
  });

  it("token limit in scoring names ATS scoring", () => {
    expect(describeAiFailure("Model output incomplete: max_output_tokens", "ats_scoring").adminHint).toContain("ATS scoring → Max output tokens");
  });

  it("timeouts and a busy provider get retry advice, no admin hint", () => {
    const t = describeAiFailure("OpenAI request failed: Request timed out.", "generation");
    expect(t.kind).toBe("timeout");
    expect(t.adminHint).toBeUndefined();
    expect(describeAiFailure("OpenAI request failed (HTTP 429): rate limit", "ats_scoring").kind).toBe("busy");
    expect(describeAiFailure("OpenAI request failed (HTTP 503): overloaded", "generation").kind).toBe("busy");
  });

  it("keeps the existing grounding / deleted / analysis messages", () => {
    expect(describeAiFailure("Grounding check failed after retry (1 violations: term_not_in_source×1)", "generation").kind).toBe("grounding");
    expect(describeAiFailure("The source resume was deleted", "generation").kind).toBe("deleted");
    expect(describeAiFailure("The job analysis didn't finish, so the resume wasn't generated", "generation").kind).toBe("analysis");
  });

  it("anything else (or nothing) falls back without leaking internals", () => {
    expect(describeAiFailure("Pricing config v9 not found", "generation")).toMatchObject({ kind: "unknown", message: "Something went wrong on our side." });
    expect(describeAiFailure(null, "generation").kind).toBe("unknown");
  });
});
