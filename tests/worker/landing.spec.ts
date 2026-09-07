// Landing page at GET / -- the only page a host hits before creating
// a session. Served as a plain static file by the [assets] binding;
// no Worker invocation, no DO touch.
//
// That split is asserted from both sides: the Worker must not claim `/`
// (it is absent from run_worker_first, so a 404 from the Worker is the
// correct answer), and the assets binding must serve the file. `SELF` is
// the Worker's own entrypoint and does not perform asset routing, so
// static paths are fetched through `env.ASSETS` directly.

import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";

const ORIGIN = "https://example.com";

function asset(path: string): Promise<Response> {
  return env.ASSETS.fetch(new Request(`${ORIGIN}${path}`));
}

describe("GET /", () => {
  it("is not claimed by the Worker", async () => {
    const res = await SELF.fetch(`${ORIGIN}/`);
    expect(res.status).toBe(404);
  });

  it("serves the landing page as text/html", async () => {
    const res = await asset("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/html/);
  });

  it("the landing page wires its bootstrap script and that script POSTs to /api/session", async () => {
    // The host clicks a button which POSTs to /api/session and is then
    // redirected to /s/<id>/. The HTML must reference the bootstrap
    // module, and that module must contain the session-create call --
    // otherwise the page is just text and the host can't start a game.
    const html = await (await asset("/")).text();
    const scriptMatch = html.match(
      /<script[^>]*type="module"[^>]*src="([^"]+)"/,
    );
    expect(scriptMatch).not.toBeNull();
    const scriptPath = scriptMatch![1]!;
    const js = await (await asset(scriptPath)).text();
    expect(js).toContain("/api/session");
  });
});
