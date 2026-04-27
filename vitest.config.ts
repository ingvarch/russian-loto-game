// Vitest configuration for Worker + Durable Object integration tests.
//
// `@cloudflare/vitest-pool-workers` spawns a real workerd instance per
// test file, so tests run against the same runtime that production uses.
// The pool reads `wrangler.toml` for bindings — keep that file as the
// single source of truth for DO classes, assets, and env vars.

import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    include: ["tests/worker/**/*.spec.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
      },
    },
  },
});
