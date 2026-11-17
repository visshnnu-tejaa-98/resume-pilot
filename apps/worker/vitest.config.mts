import { defineConfig } from "vitest/config";

// e2e/ holds Playwright specs (`pnpm test:visual`), not Vitest tests.
export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });
