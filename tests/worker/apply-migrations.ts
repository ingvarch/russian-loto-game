// Applies migrations to the test D1 instance before any spec runs.
//
// The pool gives each test file its own isolated storage, so this runs
// per file. `TEST_MIGRATIONS` is injected by vitest.config.ts, which
// reads the migration directory at config time.

import { applyD1Migrations, env } from "cloudflare:test";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
