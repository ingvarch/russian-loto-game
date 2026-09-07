// Vitest configuration for Worker + Durable Object integration tests.
//
// `@cloudflare/vitest-pool-workers` spawns a real workerd instance per
// test file, so tests run against the same runtime that production uses.
// The pool reads `wrangler.toml` for bindings — keep that file as the
// single source of truth for DO classes, assets, and env vars.

import path from "node:path";
import {
  defineWorkersConfig,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";

// D1 migrations are not applied automatically. They are read here at
// config time and handed to the test worker as a binding, which
// tests/worker/apply-migrations.ts feeds to applyD1Migrations().
const migrations = await readD1Migrations(
  path.join(__dirname, "migrations"),
);

export default defineWorkersConfig({
  test: {
    include: ["tests/worker/**/*.spec.ts"],
    setupFiles: ["./tests/worker/apply-migrations.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          // Secrets never live in [vars]; the test password is injected
          // here so the suite can exercise both the accept and the
          // reject path of the admin's basic auth.
          bindings: {
            ADMIN_PASSWORD: "test-password",
            TEST_MIGRATIONS: migrations,
          },
        },
      },
    },
  },
});
