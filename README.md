# russian-loto-game

Live Russian Loto game server on Cloudflare Workers + Durable Objects.
The host controls the game on `/s/<id>/`; players watch the same state
on a TV at `/s/<id>/display`. State syncs in real time via SSE.

## How to host

1. From the landing page (`/`) pick **Новая игра** to start with the
   bundled deck, or **Загрузить свою колоду** to pass a JSON file
   (raw array, `{ cards: [...] }`, or the registry written by the
   sibling `russian-loto` Python CLI). The `?` button next to the
   uploader shows the expected JSON shape.
2. The new-game modal opens automatically: pick the bank, the level
   percentages (Классика / Без 1-й линии / custom), the active card
   range, and whether ties split or are picked by the host.
3. Click **Табло** in the admin header to share the display URL with
   the table screen — modal shows a QR code, the full URL, and a
   one-click copy.
4. Open the display URL on the second device. State syncs on every
   number called.

Multiple admin views (host on phone + laptop) sync too: each admin
subscribes to the same SSE stream as the display, so any change made
on one device appears on the other within a tick.

## How to deploy

```bash
bun install
bun run deploy            # production
bun run deploy:staging    # `staging` env
```

Wrangler reads `wrangler.toml` for everything: Durable Object class,
static assets, rate-limit binding, observability. Don't change those
in the Cloudflare dashboard -- the next deploy will overwrite them.

The default deck is bundled from `cards/printed.json`. Refresh it by
overwriting that file with the latest output of the Python CLI's
`gen` command (which writes `~/.russian-loto/printed.json`); rebuild
picks it up automatically.

## Scripts

- `bun run dev` — Wrangler local dev (Worker + DO + static assets) on `:8787`.
- `bun test tests/js/` — pure logic unit tests under Bun.
- `bun run test:worker` — Worker + DO tests via Vitest + workerd pool.
- `bun run test:all` — both suites.
- `bun run typecheck` — TypeScript check without emit.
- `bun run deploy` / `bun run deploy:staging` — production / staging deploy.

Bun is the local toolchain (install, scripts, tests). The Worker
itself runs on `workerd` in production -- Bun never touches the
runtime.

## Architecture

See `CLAUDE.md` for the full design: Worker routing, Durable Object
session model, SSE fan-out + heartbeat, owner-cookie auth, custom-deck
upload validation, and testing strategy.

## Related

- `../russian-loto` — CLI that generates card packs (PDF for paper,
  STL for 3D printing). This project consumes the same JSON card
  shape the CLI writes to `~/.russian-loto/printed.json`.
