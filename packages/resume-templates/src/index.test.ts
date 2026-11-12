import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("resume-templates package", () => {
  it("exposes its package name", () => {
    expect(packageName).toBe("@resume-pilot/resume-templates");
  });
});
