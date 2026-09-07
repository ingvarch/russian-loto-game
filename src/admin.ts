// Admin panel: everything under /admin, behind HTTP Basic.
//
// The panel lists games and can delete them; it does not run them. The
// listing comes from the D1 mirror rather than from the Durable Objects, so
// one query answers the whole thing instead of a fan-out to N rooms.

import { basicAuthChallenge, checkBasicAuth } from "./auth.js";
import { deleteSession, listSessions, sessionExists } from "./sessions-db.js";
import { readStats } from "./stats-db.js";
import { DEFAULT_PERIOD, isPeriod } from "../public/static/js/stats-logic.js";
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
  // The shell lives under /admin/ so run_worker_first already covers it:
  // a file at the site root would be served straight off the assets binding,
  // password and all bypassed.
  if (path === "/admin/stats" || path === "/admin/stats/") {
    return serveShell(request, env, "/admin/stats.html");
  }
  if (path === "/admin/api/sessions") {
    return handleSessionsList(request, env);
  }
  if (path === "/admin/api/stats") {
    return handleStats(request, env);
  }
  const item = SESSION_ITEM_RE.exec(path);
  if (item !== null) {
    return handleSessionItem(request, env, item[1]!);
  }
  return new Response("not found", { status: 404 });
}

// Session ids are short and URL-safe; anything else is not one of ours and
// never reaches the database.
const SESSION_ITEM_RE = /^\/admin\/api\/sessions\/([A-Za-z0-9_-]{1,64})$/;

// The shell lives in the assets bucket like every other page. Fetching it
// through the ASSETS binding does not re-enter the router, so listing
// /admin.html under run_worker_first cannot loop.
async function serveShell(
  request: Request,
  env: Env,
  assetPath = "/admin.html",
): Promise<Response> {
  const url = new URL(request.url);
  url.pathname = assetPath;
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

// Deleting reaches both stores, room first. If the row delete then failed,
// the game is dead but still listed and the operator can press delete again;
// the reverse order would hide a session that is still very much alive.
async function handleSessionItem(
  request: Request,
  env: Env,
  sessionId: string,
): Promise<Response> {
  if (request.method !== "DELETE") {
    return new Response("method not allowed", {
      status: 405,
      headers: { Allow: "DELETE" },
    });
  }

  if (!(await sessionExists(env.DB, sessionId))) {
    return new Response("not found", { status: 404 });
  }

  const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(sessionId));
  await stub.destroy();
  await deleteSession(env.DB, sessionId);

  return new Response(null, { status: 204 });
}

async function handleStats(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return new Response("method not allowed", {
      status: 405,
      headers: { Allow: "GET" },
    });
  }
  const asked = new URL(request.url).searchParams.get("period");
  const period = isPeriod(asked) ? asked! : DEFAULT_PERIOD;

  const stats = await readStats(env.DB, period, Date.now());
  return new Response(JSON.stringify(stats), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
