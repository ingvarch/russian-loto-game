// Shared types for the Worker entry and the Durable Object.
//
// Keep this file minimal. Game-state types belong next to the logic that
// produces them (state.js on the client, or game-room.ts on the server).
//
// Bindings are declared straight into `Cloudflare.Env`, the global
// namespace @cloudflare/workers-types exposes for exactly this. The test
// runtime's `env` resolves to that namespace, so one declaration serves
// both src/ and tests/ — no second copy to drift.
//
// Not written as `interface Env extends ...`: TypeScript merges *members*
// across declarations of `Cloudflare.Env` but drops a heritage clause, so
// an `extends` here would silently contribute nothing.
//
// `wrangler types` can generate this file's contents instead, but it
// types SESSION_RATE_LIMITER and ADMIN_PASSWORD as always-present, which
// contradicts the deliberate optionality below.

import type { GameRoom } from "./game-room.js";

declare global {
  namespace Cloudflare {
    interface Env {
      ASSETS: Fetcher;
      GAME_ROOM: DurableObjectNamespace<GameRoom>;

      // Session mirror + game statistics. Written by the Worker only; the
      // GameRoom DO keeps state opaque and needs no D1 access.
      DB: D1Database;

      // Declared under [[ratelimits]] in wrangler.toml. Optional so tests
      // and local dev run without the namespace -- the handler skips the
      // check when unbound.
      SESSION_RATE_LIMITER?: RateLimit;

      // Admin panel password (HTTP Basic). Optional on purpose: an unset
      // secret must fail closed rather than fail to typecheck.
      ADMIN_PASSWORD?: string;
    }
  }
}

export type Env = Cloudflare.Env;
