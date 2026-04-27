# russian-loto-game

Live Russian Loto game server on Cloudflare Workers with Durable Objects
for per-session state and SSE fan-out to the display screen.

## Status

Early scaffolding. Client JS is being ported from the sibling Python
project `russian-loto`; the Worker and Durable Object are being built
from scratch.

## Quick start

```bash
bun install
bun run dev                   # local Workers dev on :8787
```

Open `http://localhost:8787/` for the admin page. Create a session,
then open the display URL on a second device.

## Scripts

- `bun run dev` — Wrangler local dev (Worker + DO + static assets).
- `bun test tests/js/` — pure logic unit tests under Bun.
- `bun run test:worker` — Worker + DO tests via Vitest + workerd pool.
- `bun run typecheck` — TypeScript check without emit (src + tests).
- `bun run deploy` — deploy to production.
- `bun run deploy:staging` — deploy to the `staging` environment.

Bun is the local toolchain (install, scripts, tests). The Worker
itself runs on `workerd` in production — Bun never touches the
runtime.

## Config

Deployment is configured in `wrangler.toml`. That file is the source of
truth; do not edit settings in the Cloudflare dashboard.

## Architecture

See `CLAUDE.md` for the full design: Worker routing, Durable Object
session model, SSE fan-out, auth, and testing strategy.

## Related

- `../russian-loto` — CLI that generates card packs (PDF for paper,
  STL for 3D printing). This project consumes its JSON card shape.
