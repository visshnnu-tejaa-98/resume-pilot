import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("file-processing package", () => {
  it("exposes its package name", () => {
    expect(packageName).toBe("@resume-pilot/file-processing");
  });
});
