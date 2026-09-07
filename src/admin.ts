// Admin panel: everything under /admin, behind HTTP Basic.
//
// Read-only for now -- the panel lists games, it does not run them. The
// data comes from the D1 mirror rather than from the Durable Objects, so
// one query answers the whole listing instead of a fan-out to N rooms.

import { basicAuthChallenge, checkBasicAuth } from "./auth.js";
import { listSessions } from "./sessions-db.js";
import type { Env } from "./types.js";

// A game the host walked away from is still a row in D1 (sessions are
// never deleted). Anything untouched for this long is treated as over
// when the panel asks for active games only.
const ACTIVE_WINDOW_MS = 60 * 60 * 1000;

export async function handleAdmin(request: Request, env: Env): Promise<Response> {
  if (!checkBasicAuth(request.headers.get("Authorization"), env.ADMIN_PASSWORD)) {
    return basicAuthChallenge();
  }

  const path = new URL(request.url).pathname;

  if (path === "/admin" || path === "/admin/" || path === "/admin.html") {
    return serveShell(request, env);
  }
  if (path === "/admin/api/sessions") {
    return handleSessionsList(request, env);
  }
  return new Response("not found", { status: 404 });
}

// The shell lives in the assets bucket like every other page. Fetching it
// through the ASSETS binding does not re-enter the router, so listing
// /admin.html under run_worker_first cannot loop.
async function serveShell(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  url.pathname = "/admin.html";
  const res = await env.ASSETS.fetch(new Request(url, { method: "GET" }));
  if (!res.ok) {
    return new Response("admin shell missing", { status: 500 });
  }
  return res;
}

async function handleSessionsList(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return new Response("method not allowed", {
      status: 405,
      headers: { Allow: "GET" },
    });
  }
  const url = new URL(request.url);
  const opts =
    url.searchParams.get("activeOnly") === "1"
      ? { updatedAfter: Date.now() - ACTIVE_WINDOW_MS }
      : {};

  const rows = await listSessions(env.DB, opts);
  return new Response(JSON.stringify(rows), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // A stale listing is worse than a slow one.
      "Cache-Control": "no-store",
    },
  });
}
