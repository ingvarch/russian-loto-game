// Shared types for the Worker entry and the Durable Object.
//
// Keep this file minimal. Game-state types belong next to the logic that
// produces them (state.js on the client, or game-room.ts on the server).

import type { GameRoom } from "./game-room.js";

export interface Env {
  ASSETS: Fetcher;
  GAME_ROOM: DurableObjectNamespace<GameRoom>;

  // Declared under [[ratelimits]] in wrangler.toml. `RateLimit` comes
  // from @cloudflare/workers-types. Optional so tests and local dev run
  // without the namespace -- the handler skips the check when unbound.
  SESSION_RATE_LIMITER?: RateLimit;

  // Session mirror + game statistics. Written by the Worker only; the
  // GameRoom DO keeps state opaque and needs no D1 access.
  DB: D1Database;

  // Admin panel password (HTTP Basic). Optional on purpose: an unset
  // secret must fail closed rather than fail to typecheck.
  ADMIN_PASSWORD?: string;
}
