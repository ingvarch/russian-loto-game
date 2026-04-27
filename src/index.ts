// Worker entry point. Routing is intentionally a flat dispatcher: the
// surface is small enough that a real router would just be ceremony.
//
// Path layout:
//   POST /api/session          -- create a new session, set owner cookie
//   GET  /s/<id>/              -- admin page with bootstrap injected
//   GET  /s/<id>/display       -- display page with bootstrap injected
//   GET  /s/<id>/api/state     -- last posted snapshot (or null)
//   POST /s/<id>/api/state     -- store a new snapshot (owner cookie)
//   GET  /s/<id>/api/events    -- SSE stream of state updates
//   everything else            -- handled by the [assets] binding;
//                                 run_worker_first in wrangler.toml limits
//                                 Worker invocations to /api/* and /s/*.

import { readOwnerToken } from "./auth.js";
import { DEFAULT_CARDS } from "./default-cards.js";
import { newOwnerToken, newSessionId } from "./session-id.js";
import type { Env } from "./types.js";

export { GameRoom } from "./game-room.js";

const SESSION_PATH_RE = /^\/s\/([^/]+)\/(.*)$/;

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/session") {
      return handleSessionCreate(request, env);
    }

    const m = SESSION_PATH_RE.exec(url.pathname);
    if (m) {
      const sessionId = m[1]!;
      const rest = m[2]!;
      return handleSessionScoped(request, env, sessionId, rest);
    }

    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

async function handleSessionCreate(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("method not allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  const sessionId = newSessionId();
  const ownerToken = newOwnerToken();

  const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(sessionId));
  await stub.init(ownerToken, DEFAULT_CARDS);

  // Owner cookie is scoped to the session path so two sessions in the same
  // browser don't collide. HttpOnly keeps the token out of JS; the admin
  // doesn't need to read it -- the cookie is sent automatically on writes.
  const cookie = [
    `owner_token=${ownerToken}`,
    `Path=/s/${sessionId}/`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Max-Age=86400",
  ].join("; ");

  return new Response(JSON.stringify({ sessionId }), {
    status: 201,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookie,
    },
  });
}

async function handleSessionScoped(
  request: Request,
  env: Env,
  sessionId: string,
  rest: string,
): Promise<Response> {
  const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(sessionId));
  // Reject session-scoped traffic targeting an uninitialised room. Without
  // this guard a stranger could create a DO instance just by guessing a
  // path -- the room would happily reply, polluting storage.
  if (!(await stub.isInitialized())) {
    return new Response("not found", { status: 404 });
  }

  if (rest === "" || rest === "index.html") {
    return handlePage(request, env, stub, "/");
  }
  if (rest === "display" || rest === "display.html") {
    return handlePage(request, env, stub, "/display");
  }
  if (rest === "api/state") {
    return handleState(request, stub);
  }
  if (rest === "api/events") {
    return stub.fetch(request);
  }

  return new Response("not found", { status: 404 });
}

async function handleState(
  request: Request,
  stub: DurableObjectStub<import("./game-room.js").GameRoom>,
): Promise<Response> {
  if (request.method === "GET") {
    const state = await stub.getState();
    return jsonResponse({ state }, 200);
  }
  if (request.method === "POST") {
    const token = readOwnerToken(request);
    if (token === null || !(await stub.verifyOwner(token))) {
      return new Response("unauthorized", { status: 401 });
    }
    let parsed: unknown;
    try {
      parsed = await request.json();
    } catch {
      return new Response("invalid JSON", { status: 400 });
    }
    await stub.setState(parsed);
    return new Response(null, { status: 200 });
  }
  return new Response("method not allowed", {
    status: 405,
    headers: { Allow: "GET, POST" },
  });
}

// ---- Page rendering ------------------------------------------------------
//
// /s/<id>/ and /s/<id>/display serve the shared HTML shells from the
// [assets] binding, with the two `<script type="application/json">`
// blobs (cards + range) rewritten to the session's actual values. The
// shells live at /index.html and /display.html in the assets bucket.

class InjectJSON {
  constructor(private readonly value: unknown) {}
  element(el: Element): void {
    el.setInnerContent(JSON.stringify(this.value), { html: false });
  }
}

async function handlePage(
  request: Request,
  env: Env,
  stub: DurableObjectStub<import("./game-room.js").GameRoom>,
  assetPath: string,
): Promise<Response> {
  const cards = await stub.getCards();
  const url = new URL(request.url);
  url.pathname = assetPath;
  const assetRes = await env.ASSETS.fetch(new Request(url, request));
  if (!assetRes.ok) {
    return new Response("page asset missing", { status: 500 });
  }
  return new HTMLRewriter()
    .on("script#cards-data", new InjectJSON(cards))
    .on("script#server-range", new InjectJSON(null))
    .transform(assetRes);
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
