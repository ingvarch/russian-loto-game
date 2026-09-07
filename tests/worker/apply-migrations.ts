// Applies migrations to the test D1 instance, and keeps the schema
// intact for every test in the file.
//
// `TEST_MIGRATIONS` is injected by vitest.config.ts, which reads the
// migration directory at config time.
//
// The plugin used to roll storage back between tests (`isolatedStorage`),
// so a spec could drop a table to simulate D1 being down and the next
// test would still find the schema. That option is gone as of the 0.22
// rewrite, so the guarantee is restored here instead: before each test,
// re-apply the migrations if the schema is missing. `applyD1Migrations`
// skips work it has already recorded, hence dropping its bookkeeping
// table first.

import { applyD1Migrations, env } from "cloudflare:test";
import { beforeEach } from "vitest";

async function schemaExists(): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions'",
  ).first();
  return row !== null;
}

async function applyMigrations(): Promise<void> {
  await env.DB.exec("DROP TABLE IF EXISTS d1_migrations");
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
}

await applyMigrations();

beforeEach(async () => {
  if (!(await schemaExists())) await applyMigrations();
});
