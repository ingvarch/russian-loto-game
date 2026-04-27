// Shared types for the Worker entry and the Durable Object.
//
// Keep this file minimal. Game-state types belong next to the logic that
// produces them (state.js on the client, or game-room.ts on the server).

import type { GameRoom } from "./game-room.js";

// Cloudflare Workers rate-limit binding. Optional so tests can run
// without configuring it -- the handler falls through when the binding
// is absent. Bound in wrangler.toml under [[unsafe.bindings]].
export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  ASSETS: Fetcher;
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
  SESSION_RATE_LIMITER?: RateLimit;
}
