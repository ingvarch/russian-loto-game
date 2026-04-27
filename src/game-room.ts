// Durable Object: one instance per game session.
//
// Holds the authoritative game state in memory, mirrors every mutation
// to SQLite-backed storage, and fans out state updates to all SSE
// subscribers for this session.
//
// This file is intentionally a stub. The real implementation lands
// test-first in tests/worker/game-room.spec.ts.

import { DurableObject } from "cloudflare:workers";
import type { Env } from "./types.js";

export class GameRoom extends DurableObject<Env> {
  override async fetch(_request: Request): Promise<Response> {
    return new Response("GameRoom: not implemented", { status: 501 });
  }
}
