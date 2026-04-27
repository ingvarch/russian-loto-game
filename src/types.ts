// Shared types for the Worker entry and the Durable Object.
//
// Keep this file minimal. Game-state types belong next to the logic that
// produces them (state.js on the client, or game-room.ts on the server).

import type { GameRoom } from "./game-room.js";

export interface Env {
  ASSETS: Fetcher;
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
}
