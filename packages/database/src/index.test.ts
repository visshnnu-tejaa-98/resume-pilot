import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("database package", () => {
  it("exposes its package name", () => {
    expect(packageName).toBe("@resume-pilot/database");
  });
});
