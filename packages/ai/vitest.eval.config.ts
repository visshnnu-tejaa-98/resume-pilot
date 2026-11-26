import { defineConfig } from "vitest/config";

/** Real-model eval (eval/run.eval.ts) — separate from the unit tests. */
export default defineConfig({
  test: {
    include: ["eval/**/*.eval.ts"],
    testTimeout: 60 * 60 * 1000,
    hookTimeout: 60_000,
  },
});
