import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // These are integration tests against one shared Postgres. Some change
    // global state (pricing.test.ts switches the active pricing config),
    // which other files read; running files in parallel made the credit and
    // ledger suites flaky. Files run one at a time; tests within a file
    // (including the deliberate concurrency tests) are unaffected.
    fileParallelism: false,
  },
});
