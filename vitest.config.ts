import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    hookTimeout: 30_000,
    testTimeout: 20_000,
    // Integration tests share one real Postgres database (no per-file
    // schema/pool), and each file's beforeEach/afterEach truncates
    // tables via resetDatabase(). Running files in parallel means one
    // file's reset can wipe rows a concurrently-running file just
    // inserted, mid-test — this makes failures flaky and dependent on
    // scheduling rather than actual bugs. Running files sequentially
    // trades a bit of wall-clock time for tests that are actually
    // deterministic.
    fileParallelism: false,
  },
});
