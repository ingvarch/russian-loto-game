// Test-only additions to the worker environment.
//
// The project's real bindings are declared in src/types.ts, straight into
// `Cloudflare.Env`. @cloudflare/vitest-plugin dropped the `ProvidedEnv`
// interface that used to carry them, so `env` now resolves to that same
// namespace and nothing needs re-stating here.
//
// No top-level import: that would make this a module and turn the
// namespace declaration local, silently stopping the merge.

declare namespace Cloudflare {
  interface Env {
    // Injected by vitest.config.ts, consumed by apply-migrations.ts.
    TEST_MIGRATIONS: D1Migration[];
  }
}
