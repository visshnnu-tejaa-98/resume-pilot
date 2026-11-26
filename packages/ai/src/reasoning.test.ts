import { describe, expect, it } from "vitest";
import { reasoningFor } from "./responses";

describe("reasoningFor", () => {
  it("uses low effort for gpt-5 / mini / nano (incl. dated snapshots)", () => {
    for (const m of ["gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-5-mini-2025-08-07"]) expect(reasoningFor(m)).toEqual({ reasoning: { effort: "low" } });
  });
  it("leaves other models at their default", () => {
    for (const m of ["gpt-5.1", "gpt-4.1-mini", "gpt-4o-mini", "gpt-5-chat-latest"]) expect(reasoningFor(m)).toEqual({});
  });
});

describe("reasoningFor effort", () => {
  it("passes a requested effort through for reasoning models", () => {
    expect(reasoningFor("gpt-5-mini", "medium")).toEqual({ reasoning: { effort: "medium" } });
    expect(reasoningFor("gpt-5.1", "medium")).toEqual({});
  });
});
