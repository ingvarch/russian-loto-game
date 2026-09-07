// Applies migrations to the test D1 instance, and keeps the schema
// intact for every test in the file.
//
// `TEST_MIGRATIONS` is injected by vitest.config.ts, which reads the
// migration directory at config time.
//
// The plugin used to roll storage back between tests (`isolatedStorage`),
// so a spec could drop a table to simulate D1 being down and the next
// test would still find the schema. That option is gone as of the 0.22
// rewrite, so the guarantee is restored here instead.
//
// Re-applying has to start from an empty database rather than from
// whatever a spec left behind: a test that drops one table would
// otherwise leave the others in place, and the next migration to create
// one of them fails with "table already exists". So the reset drops
// every table it finds, children first, and replays the whole history.

import { applyD1Migrations, env } from "cloudflare:test";
import { beforeEach } from "vitest";

// Every table the migrations create, in an order that never drops a
// parent before its children.
const TABLES = ["draws", "wins", "games", "sessions"];

async function schemaIsWhole(): Promise<boolean> {
  const { results } = await env.DB.prepare(
    `SELECT name FROM sqlite_master
      WHERE type = 'table' AND name IN (${TABLES.map(() => "?").join(", ")})`,
  )
    .bind(...TABLES)
    .all<{ name: string }>();
  return results.length === TABLES.length;
}

async function applyMigrations(): Promise<void> {
  for (const table of TABLES) {
    await env.DB.exec(`DROP TABLE IF EXISTS ${table}`);
  }
  await env.DB.exec("DROP TABLE IF EXISTS d1_migrations");
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
}

await applyMigrations();

beforeEach(async () => {
  if (!(await schemaIsWhole())) await applyMigrations();
});
