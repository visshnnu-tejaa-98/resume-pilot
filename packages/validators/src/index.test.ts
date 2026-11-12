import { describe, expect, it } from "vitest";
import { pingInputSchema } from "./index.js";

describe("pingInputSchema", () => {
  it("accepts a valid message", () => {
    const result = pingInputSchema.parse({ message: "hello" });
    expect(result.message).toBe("hello");
  });

  it("rejects an empty message", () => {
    expect(() => pingInputSchema.parse({ message: "" })).toThrow();
  });
});
