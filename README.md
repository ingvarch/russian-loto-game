# russian-loto-game

Live Russian Loto game server on Cloudflare Workers with Durable Objects
for per-session state and SSE fan-out to the display screen.

## Status

Early scaffolding. Client JS is being ported from the sibling Python
project `russian-loto`; the Worker and Durable Object are being built
from scratch.

## Quick start

```bash
npm install
npm run dev                   # local Workers dev on :8787
```

Open `http://localhost:8787/` for the admin page. Create a session,
then open the display URL on a second device.

## Scripts

- `npm run dev` — Wrangler local dev (Worker + DO + static assets).
- `npm run test` — pure logic unit tests via Node's built-in runner.
- `npm run test:worker` — Worker + DO tests via Vitest.
- `npm run typecheck` — TypeScript check without emit.
- `npm run deploy` — deploy to production.
- `npm run deploy:staging` — deploy to the `staging` environment.

## Config

Deployment is configured in `wrangler.toml`. That file is the source of
truth; do not edit settings in the Cloudflare dashboard.

## Architecture

See `CLAUDE.md` for the full design: Worker routing, Durable Object
session model, SSE fan-out, auth, and testing strategy.

## Related

- `../russian-loto` — CLI that generates card packs (PDF for paper,
  STL for 3D printing). This project consumes its JSON card shape.
