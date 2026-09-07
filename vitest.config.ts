// Vitest configuration for Worker + Durable Object integration tests.
//
// The pool spawns a real workerd instance, so tests run against the same
// runtime production uses. It reads `wrangler.toml` for bindings — keep
// that file as the single source of truth for DO classes, assets and D1.
//
// The integration was renamed from `@cloudflare/vitest-pool-workers` to
// `@cloudflare/vitest-plugin`, and `defineWorkersConfig` (plus the
// `/config` subpath it lived on) gave way to the `cloudflareTest` Vite
// plugin. The option shape is unchanged; only where it is passed moved.

import path from "node:path";
import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// D1 migrations are not applied automatically. They are read here at
// config time and handed to the test worker as a binding, which
// tests/worker/apply-migrations.ts feeds to applyD1Migrations().
const migrations = await readD1Migrations(
  path.join(import.meta.dirname, "migrations"),
);

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        // Secrets never live in [vars]; the test password is injected
        // here so the suite can exercise both the accept and the reject
        // path of the admin's basic auth.
        bindings: {
          ADMIN_PASSWORD: "test-password",
          TEST_MIGRATIONS: migrations,
        },
      },
    }),
  ],
  test: {
    include: ["tests/worker/**/*.spec.ts"],
    setupFiles: ["./tests/worker/apply-migrations.ts"],
  },
});
