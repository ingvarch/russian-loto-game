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

function sseFrame(payload: unknown): Uint8Array {
  return ENCODER.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export class GameRoom extends DurableObject<Env> {
  #ownerToken: string | null = null;
  #state: unknown = null;
  #cards: unknown[] = [];
  #subscribers = new Set<Subscriber>();

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
      },
      cancel: () => {
        if (sub) {
          sub.alive = false;
          this.#subscribers.delete(sub);
        }
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
    const dead: Subscriber[] = [];
    for (const sub of this.#subscribers) {
      if (!sub.alive) {
        dead.push(sub);
        continue;
      }
      try {
        sub.controller.enqueue(frame);
      } catch {
        // Controller may be closed if the consumer disconnected between
        // ticks. Mark the subscriber for removal.
        sub.alive = false;
        dead.push(sub);
      }
    }
    for (const sub of dead) this.#subscribers.delete(sub);
  }
}
