import { describe, expect, it } from "vitest";
import { estimateStub } from "./index.js";

describe("estimateStub", () => {
  it("echoes the action with a zero estimate", () => {
    expect(estimateStub("generation")).toEqual({
      action: "generation",
      estimatedCredits: 0,
    });
  });
});
