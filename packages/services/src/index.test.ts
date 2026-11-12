import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("services package", () => {
  it("exposes its package name", () => {
    expect(packageName).toBe("@resume-pilot/services");
  });
});
