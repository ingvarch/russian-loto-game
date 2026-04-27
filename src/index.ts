// Worker entry point.
//
// Path dispatch:
//   /api/*          - top-level endpoints (currently only /api/session)
//   /s/<id>/api/*   - session-scoped API, forwarded to the GameRoom DO
//   everything else - handled by the Workers Assets binding, served
//                     straight from public/ with html_handling.
//
// Static assets under run_worker_first do not reach this handler, see
// wrangler.toml. The router implementation lands test-first.

import type { Env } from "./types.js";

export { GameRoom } from "./game-room.js";

export default {
  async fetch(_request: Request, _env: Env, _ctx: ExecutionContext): Promise<Response> {
    return new Response("russian-loto-game: not implemented", { status: 501 });
  },
} satisfies ExportedHandler<Env>;
