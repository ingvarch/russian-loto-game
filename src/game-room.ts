// GameRoom: one Durable Object instance per game session.
//
// Holds:
//   - ownerToken: secret the admin sends back via cookie on writes.
//   - state:      latest game snapshot the admin pushed. Opaque JSON;
//                 the server is just a relay between admin and display.
//   - subscribers: live SSE streams. Mutations broadcast to everyone.
//
// Storage:
//   SQLite-backed (see [[migrations]] in wrangler.toml). Mutations are
//   mirrored to ctx.storage so a cold start rehydrates. In-memory copies
//   are populated lazily on first access via blockConcurrencyWhile so we
//   never serve a stale read.
//
// Public surface:
//   RPC      init / isInitialized / verifyOwner / getState / setState
//   fetch    GET .../api/events  -- SSE subscription

import { DurableObject } from "cloudflare:workers";
import type { Env } from "./types.js";

const KEY_OWNER_TOKEN = "ownerToken";
const KEY_STATE = "state";
const KEY_CARDS = "cards";

interface Subscriber {
  controller: ReadableStreamDefaultController<Uint8Array>;
  alive: boolean;
}

const ENCODER = new TextEncoder();
const HEARTBEAT_FRAME = ENCODER.encode(": keep-alive\n\n");

// Heartbeat interval. 25s is below the typical 60s idle threshold of
// Cloudflare's edge and most corporate proxies, so an idle SSE
// connection (host stepped away, no state changes) keeps flowing
// instead of being silently dropped. Browsers will reconnect via
// EventSource onerror, but the gap shows up as missed updates if it
// lasts long enough -- the heartbeat avoids that entirely.
const HEARTBEAT_MS = 25_000;

function sseFrame(payload: unknown): Uint8Array {
  return ENCODER.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export class GameRoom extends DurableObject<Env> {
  #ownerToken: string | null = null;
  #state: unknown = null;
  #cards: unknown[] = [];
  #subscribers = new Set<Subscriber>();
  #heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.#ownerToken =
        (await ctx.storage.get<string>(KEY_OWNER_TOKEN)) ?? null;
      this.#state = (await ctx.storage.get<unknown>(KEY_STATE)) ?? null;
      this.#cards = (await ctx.storage.get<unknown[]>(KEY_CARDS)) ?? [];
    });
  }

  // ---- RPC ---------------------------------------------------------------

  async init(ownerToken: string, cards: unknown[]): Promise<void> {
    if (this.#ownerToken !== null && this.#ownerToken !== ownerToken) {
      throw new Error("GameRoom already initialised with a different token");
    }
    if (this.#ownerToken === null) {
      this.#ownerToken = ownerToken;
      this.#cards = cards;
      await this.ctx.storage.put(KEY_OWNER_TOKEN, ownerToken);
      await this.ctx.storage.put(KEY_CARDS, cards);
    }
  }

  async getCards(): Promise<unknown[]> {
    return this.#cards;
  }

  async isInitialized(): Promise<boolean> {
    return this.#ownerToken !== null;
  }

  // Constant-time comparison so a side-channel timing attack can't peel
  // off the token byte by byte.
  async verifyOwner(token: string): Promise<boolean> {
    if (this.#ownerToken === null) return false;
    if (token.length !== this.#ownerToken.length) return false;
    let diff = 0;
    for (let i = 0; i < token.length; i++) {
      diff |= token.charCodeAt(i) ^ this.#ownerToken.charCodeAt(i);
    }
    return diff === 0;
  }

  async getState(): Promise<unknown> {
    return this.#state;
  }

  async setState(state: unknown): Promise<void> {
    this.#state = state;
    await this.ctx.storage.put(KEY_STATE, state);
    this.#broadcast();
  }

  // ---- HTTP (SSE only) ---------------------------------------------------

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/api/events")) {
      return this.#subscribe();
    }
    return new Response("not found", { status: 404 });
  }

  #subscribe(): Response {
    let sub: Subscriber | null = null;

    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        sub = { controller, alive: true };
        this.#subscribers.add(sub);
        // Send the current state so a late-joining display rehydrates
        // without an extra GET round-trip.
        controller.enqueue(sseFrame({ state: this.#state }));
        this.#startHeartbeat();
      },
      cancel: () => {
        if (sub) {
          sub.alive = false;
          this.#subscribers.delete(sub);
        }
        if (this.#subscribers.size === 0) this.#stopHeartbeat();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  }

  #broadcast(): void {
    const frame = sseFrame({ state: this.#state });
    this.#fanOut(frame);
  }

  // Push a pre-encoded frame to every live subscriber, pruning any whose
  // controller throws (consumer disconnected between ticks). Used by both
  // state broadcasts and heartbeat pings.
  #fanOut(frame: Uint8Array): void {
    const dead: Subscriber[] = [];
    for (const sub of this.#subscribers) {
      if (!sub.alive) {
        dead.push(sub);
        continue;
      }
      try {
        sub.controller.enqueue(frame);
      } catch {
        sub.alive = false;
        dead.push(sub);
      }
    }
    for (const sub of dead) this.#subscribers.delete(sub);
  }

  #startHeartbeat(): void {
    if (this.#heartbeatTimer !== null) return;
    this.#heartbeatTimer = setInterval(() => {
      this.#fanOut(HEARTBEAT_FRAME);
      // Stop the timer once the room has emptied; the next subscribe()
      // will restart it. Avoids holding the DO open just to send pings
      // into the void.
      if (this.#subscribers.size === 0) this.#stopHeartbeat();
    }, HEARTBEAT_MS);
  }

  #stopHeartbeat(): void {
    if (this.#heartbeatTimer === null) return;
    clearInterval(this.#heartbeatTimer);
    this.#heartbeatTimer = null;
  }
}
