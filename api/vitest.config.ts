import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // GAP-TEST-001 acceptance criterion needs real concurrency
    // (genuinely simultaneous requests racing against the real
    // database) — these are integration tests against a real Postgres
    // instance via Prisma, not mocked unit tests. See tests/helpers.ts
    // for the production-database safety check this depends on.
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false, // tests share one database; running files in parallel would make them race each other, not just the code under test
  },
});
