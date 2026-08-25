# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project Overview

Russian Loto live-game server, deployed to Cloudflare Workers + Durable Objects.

The admin (host) runs the game from `/` and is mirrored in real time on
`/display` — a read-only board shown on a TV or projector. Every game is
its own session identified by a short code in the URL (`/s/ABC123/`). One
Durable Object instance per session holds the authoritative state and
the set of SSE subscribers. Sessions are ephemeral: they live as long as
they are in use, keep a snapshot in DO storage so page reloads rehydrate,
and can be reset (new game) any number of times without creating a new
session.

This project is intentionally split from the sibling `russian-loto` CLI
(card generation, PDF/STL rendering): that tool is Python + CadQuery and
produces the cards once; this tool is the live web game and is deployed
continuously. They only share the JSON shape of a card
(`{ seq, cid, numbers, rows }`). Default cards travel with the
deployment as a static JSON bundle; hosts can also upload a custom pack
for a single session.

## Non-negotiable principles

These come from the user's global policy. Violating any of them is a
rework, not a patch.

### Test-Driven Development

No feature or bugfix code lands without a failing test first.

1. Write a failing test that describes the expected behaviour.
2. Watch it fail for the right reason.
3. Write the minimum code to make it pass.
4. Refactor with the test green.

There are no "too simple to test" exceptions. Pure logic goes into
`public/static/js/logic.js` and is covered by Node's built-in
`node --test`. Worker + Durable Object behaviour is covered with
Vitest + `@cloudflare/vitest-pool-workers` so it runs against the real
Workers runtime.

### Root cause only

Forbidden:

- "Temporarily disable this" — nothing is temporary.
- "Add a flag to skip it" — flags to bypass broken behaviour are never
  solutions.
- "Suppress the warning" — warnings exist for a reason.
- "Comment it out for now" — dead code is not a fix.

When stuck more than two or three attempts, stop and explain to the
user what fails, what was tried, and what information is missing.
Never ship a workaround labelled as a fix.

### Impact analysis, vertical and horizontal

Before touching code, trace:

- Vertical — who calls this, and what does this call? What depends on
  the return value or side effects?
- Horizontal — what sibling modules or components live at the same
  layer? A schema change, a renamed symbol, a new field on state — all
  of these hit siblings.

Write findings down before writing code. If the blast radius is large,
flag it and confirm scope before proceeding.

### Clean code

- KISS: simplest solution that works, no clever tricks.
- DRY: extract when the same logic appears twice. Do not pre-extract.
- YAGNI: build only what the current task requires. Do not add
  parameters, flags, or abstractions "for the future".
- Single responsibility: one function, one job.
- Composition over inheritance.
- Dead code is deleted, not commented out.
- If a function needs a comment to explain what it does, rename or
  split it.

### Apple Human Interface Guidelines

All UI decisions follow Apple HIG. The display page is optimised for a
projector (dark, high-contrast, large type, tabular numerals). The
admin page reads on phone and laptop.

### Git

- Conventional Commits only. Scope examples: `web`, `worker`, `do`,
  `ui`, `assets`, `config`, `tests`.
- The user always runs git commands. Claude proposes the commit
  message; the user runs it.
- Never skip hooks (`--no-verify`, `--no-gpg-sign`) unless explicitly
  asked.

### Documents

No emojis in any document (`README.md`, `CLAUDE.md`, comments in
config files, etc.).

## Architecture

```
Browser (admin at /s/<id>/)         Browser (display at /s/<id>/display)
        |                                          |
        | POST /api/state  (JSON)                  | GET /api/events (SSE)
        | GET  /api/state                          |
        v                                          v
                Cloudflare Worker (src/index.ts)
                       router + auth
                              |
                              v
           Durable Object  GameRoom  (one per session)
             - state snapshot (in memory + SQLite storage)
             - Set<WritableStreamDefaultWriter>  for SSE fan-out
             - owner token check for writes
```

### Request flow

- `GET /` — serves `public/index.html` from Assets. No session yet.
  Landing page offers "new game" (default cards) or "upload cards".
- `POST /api/session` — Worker picks a short session id, creates the
  GameRoom DO for it, installs the cards JSON (default or uploaded),
  returns `{ sessionId, ownerToken }`. Owner token is set in an
  `HttpOnly; Secure; Path=/s/<id>/` cookie.
- `GET /s/<id>/` — serves `index.html`, bootstrap JSON is fetched
  client-side from `/s/<id>/api/state` which returns the cards + the
  latest state.
- `GET /s/<id>/display` — serves `display.html`. No auth. Reads via
  `/s/<id>/api/state` and subscribes to `/s/<id>/api/events` for live
  updates.
- `POST /s/<id>/api/state` — admin pushes new state. Requires owner
  cookie. The DO stores it and broadcasts to all SSE subscribers.
- `GET /s/<id>/api/events` — SSE stream. Initial state on connect,
  then every `setState`. `: keep-alive\n\n` heartbeat every 25 seconds
  while at least one subscriber is active (auto-stops on empty room).
  Subscribers removed on disconnect.
- `GET /s/<id>/qr.svg` — server-rendered SVG QR code of the display
  URL. Cached by the edge for 1h via `Cache-Control: max-age=3600`.

### Session lifecycle

- A session is a DO instance, keyed by session id.
- DO keeps state in memory and snapshots to SQLite storage on every
  write so a cold start rehydrates last state.
- New game inside the session resets state but keeps the session id.
- No explicit delete — sessions age out with DO idle eviction. That is
  fine for this use case.

### Auth

- Admin writes require the owner cookie created at `POST /api/session`.
- Display and read endpoints are anonymous — anyone with the session
  URL can watch.
- The session id is unguessable (minimum 8 URL-safe chars). That is the
  entire access-control surface; anyone with the URL can watch, only
  the cookie holder can write.

### Rate limiting

`POST /api/session` is throttled per client IP via the optional
`SESSION_RATE_LIMITER` binding (Cloudflare's built-in rate-limit API,
configured under `[[unsafe.bindings]]` in `wrangler.toml`). Default
limit is 60 sessions per minute per IP. Tests skip the check when the
binding isn't bound, so local dev and CI run unconstrained.

## Tech stack

- Cloudflare Workers runtime, TypeScript for the server code.
- Durable Objects with SQLite storage class.
- Static assets served from `public/` via the Workers Assets binding.
  No bundler for client code — native ES modules. Wrangler bundles
  the Worker; client code ships as-is.
- Wrangler for dev and deploy. Config is TOML (`wrangler.toml`).
- `compatibility_date` is pinned; bump it when a runtime feature we
  want lands.
- Bun is the local toolchain: package install, script runner, and
  test runner. The Worker still runs on `workerd` in production —
  Bun never touches the runtime, only the host tooling.
- Tests: `bun test` for pure client logic (uses `bun:test`), Vitest +
  `@cloudflare/vitest-pool-workers` for Worker + DO behaviour. Vitest
  is invoked via `bun run vitest` and spawns a real `workerd` under
  the hood, so test fidelity matches production.

## Directory structure

```
russian-loto-game/
├── CLAUDE.md
├── README.md
├── wrangler.toml                  # deployment config (TOML)
├── package.json
├── tsconfig.json
├── .gitignore
├── src/
│   ├── index.ts                   # Worker entry: router + dispatch
│   ├── router.ts                  # path -> handler table
│   ├── session.ts                 # session id generation, cookie helpers
│   ├── game-room.ts               # Durable Object class
│   ├── auth.ts                    # owner-token parsing
│   ├── session-id.ts              # session id + owner token generation
│   ├── default-cards.ts           # bundled default deck (currently empty)
│   └── types.ts                   # shared Env interface
├── public/
│   ├── index.html                 # landing page (new game / upload deck)
│   ├── admin.html                 # admin shell, served via HTMLRewriter
│   ├── display.html               # display shell, served via HTMLRewriter
│   └── static/
│       ├── css/
│       │   ├── base.css
│       │   ├── landing.css
│       │   ├── game.css
│       │   └── display.css
│       └── js/
│           ├── logic.js           # pure game logic (portable, tested)
│           ├── state.js           # state shape + mutators
│           ├── ui.js              # admin DOM rendering
│           ├── main-game.js       # admin bootstrap
│           ├── display-ui.js      # display DOM rendering
│           ├── main-display.js    # display bootstrap
│           └── landing.js         # landing-page session creation
├── cards/
│   └── printed.json               # default deck, exported from the
│                                  # sibling Python CLI (`russian-loto`)
└── tests/
    ├── js/
    │   ├── logic.test.mjs         # Bun via node:test
    │   └── state.test.mjs
    └── worker/
        └── game-room.spec.ts      # Vitest + workers pool
```

## Development workflow

```bash
bun install
bun run dev               # wrangler dev — local Workers + DO + assets
bun test tests/js/        # pure logic, runs under Bun
bun run test:worker       # vitest against workers pool (real workerd)
bun run typecheck         # tsc --noEmit on src/ and tests/
```

`bun.lock` is committed (Bun's text lockfile). Do not also generate a
`package-lock.json`; pick one tool.

Wrangler v3.91.0+ also supports JSON/JSONC for config; this project
deliberately uses TOML because the user asked for it.

Local dev hot-reloads both the Worker and static assets. Durable
Object storage in `wrangler dev` persists under `.wrangler/state/`; to
reset a local session, delete that directory.

## Deployment

```bash
bun run deploy            # wrangler deploy
bun run deploy:staging    # wrangler deploy --env staging
```

Production deploys to the `name` in `wrangler.toml`. Secrets (if any)
go through `wrangler secret put <NAME>`. Never commit secrets; never
put sensitive values under `[vars]`.

The first deploy applies the `[[migrations]]` to create the
`GameRoom` Durable Object class. Every later change to that class —
rename, add new DO class, delete — must add a new migration entry
with a fresh `tag`. Do not modify an already-applied migration.

## Cloudflare guidance

### Durable Objects

- One DO class, `GameRoom`, backed by SQLite storage. SQLite-backed
  DOs are the modern default; use `new_sqlite_classes` in migrations.
- Do not create a new DO per request. Obtain the stub with
  `env.GAME_ROOM.idFromName(sessionId)` and `env.GAME_ROOM.get(id)`.
- Keep hot state in memory on the DO instance. Persist the latest
  snapshot to `ctx.storage` on every mutation so a reboot rehydrates.
- SSE subscribers are held as in-memory writers. A DO eviction drops
  them; clients must reconnect with backoff (already implemented in
  the sibling repo — port it).

### Server-Sent Events on Workers

- Return a `ReadableStream` with `Content-Type: text/event-stream`,
  `Cache-Control: no-cache`, `Connection: keep-alive`.
- Emit a heartbeat comment (`: keep-alive`) every 15 seconds to keep
  intermediaries from closing the connection.
- Do not rely on `close`-detection on the server; prune dead writers
  when a `write` throws.

### Assets

- `public/` is served through the Assets binding. The Worker script
  sees only the paths listed in `assets.run_worker_first`
  (i.e. `/api/*`). Everything else is served as a static file without
  billing a Worker invocation.
- `html_handling = "auto-trailing-slash"` resolves `/display` to
  `public/display.html` and `/` to `public/index.html`.
- For session-scoped URLs (`/s/<id>/` and `/s/<id>/display`), the
  Worker script rewrites to the base HTML and injects the session id
  at runtime. See `src/router.ts`.

### Compatibility date

Pinned in `wrangler.toml`. To adopt a newer runtime feature, bump the
date and update this document with what changed. Do not bump casually.

## Testing strategy

- Pure logic in `public/static/js/logic.js` — mandatory `bun test`
  coverage. Tests live in `tests/js/` and use the `bun:test` API
  (`import { test, expect } from "bun:test"`).
- State mutators in `public/static/js/state.js` — same.
- Worker routes and DO behaviour — Vitest + `@cloudflare/vitest-pool-workers`.
  Tests live in `tests/worker/` and run against a real `workerd`
  instance with its own SQLite-backed DO storage. Vitest is invoked
  with `bun run vitest`; Bun runs the Vitest binary just fine, the
  test fidelity comes from the pool spawning workerd, not from the
  runner.
- Two TS configs:
  - `tsconfig.json` — `src/` only, types `["@cloudflare/workers-types"]`.
    Worker code must not see Bun globals.
  - `tsconfig.test.json` — `tests/` only, types
    `["@types/bun", "@cloudflare/workers-types"]`. Test files can use
    `bun:test` and Workers types where they overlap with vitest.
- Never mock what you can test for real. No stubs of the Durable
  Object — spin up the real one under Vitest.

## Ported from the Python repo

The client JS — `logic.js`, `state.js`, `ui.js`, `display-ui.js`, and
the two bootstraps — is being moved from the `russian-loto` Python
repo essentially verbatim. Behaviour stays the same. Only the
transport changes: POST `/api/state` to a Worker instead of a Python
`http.server`, and SSE comes from a Durable Object instead of a
`StateStore` with `queue.Queue`.

The migration plan, with status:

1. [done] Port `logic.js`, `state.js`, and their tests. Pure modules,
   landed unchanged. 61 tests run via `bun test` (the runner accepts
   the existing `node:test` API natively).
2. [done] Port `ui.js`, `display-ui.js`, `main-game.js`,
   `main-display.js`, and the HTML/CSS. The two bootstraps now hit
   relative `./api/state` and `./api/events` so they resolve under
   the session prefix; `state.js` namespaces localStorage by session id.
3. [done] Implement `src/game-room.ts` (DO) and `src/index.ts`
   (Worker). Vitest + workers pool covers session creation, state
   GET/POST with auth, SSE fan-out, and HTMLRewriter bootstrap
   injection (26 tests).
4. [done] `POST /api/session` accepts an optional `{ cards: [...] }`
   body for custom decks and a 1 MB cap. Landing page (`/`) lets the
   host either start with the default deck or upload a JSON file.
5. [done] Default deck imported from `cards/printed.json` (the
   registry the sibling Python CLI writes after generating cards).
   `src/default-cards.ts` strips registry-only fields
   (`printed_at`, `formats`, `recovered`) and surfaces a flat array
   of `{ seq, cid, numbers, rows }` sorted by seq. Refresh the deck
   by overwriting `cards/printed.json` with the latest CLI output.
6. [done] Deployed and smoke-tested on a real session with two
   devices. Polish that landed alongside: SSE heartbeat (25s, idle
   connections survive proxies), per-IP rate limit on session
   creation (60/min), shareable QR code at `/s/<id>/qr.svg` with
   modal in admin header, custom-deck upload validation (server +
   client mirror), `printed.json` registry shape auto-detected on
   upload, multi-admin sync via the same SSE stream the display uses.

## Gotchas

- A Durable Object can be evicted at any time. Do not store
  authoritative state only in memory. Snapshot to `ctx.storage` on
  every mutation. Treat memory as a cache of storage.
- SSE clients disconnect silently on mobile (screen lock, network
  switch). Always include auto-reconnect with backoff on the client.
- Workers have a per-invocation CPU-ms limit. The game logic is fast;
  if a hot path ever grows, profile it, do not add a worker-level cap.
- The `assets` binding refuses to serve files under `run_worker_first`
  patterns. Any path we want the Worker to own must match that list.
- The owner cookie is scoped to the session path — a host opening two
  sessions in the same browser gets two independent cookies.

## Commit prompt

When the user asks for a commit, reply with one line and nothing else:

```
git commit -m "feat(worker): <what and why>"
```

Scopes commonly used here: `worker`, `do`, `web`, `ui`, `assets`,
`config`, `tests`, `docs`, `deps`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
