import { describe, expect, it } from "vitest";
import { QUEUE_NAME, REDIS_URL } from "./index.js";

describe("worker constants", () => {
  it("uses the expected queue name", () => {
    expect(QUEUE_NAME).toBe("resume-pilot-jobs");
  });

  it("defaults REDIS_URL to localhost when unset", () => {
    expect(REDIS_URL).toMatch(/^redis:\/\//);
  });
});
