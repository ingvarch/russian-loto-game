// Landing page at GET / -- the only page a host hits before creating
// a session. Served as a plain static file by the [assets] binding;
// no Worker invocation, no DO touch.

import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";

describe("GET /", () => {
  it("serves the landing page as text/html", async () => {
    const res = await SELF.fetch("https://example.com/");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/html/);
  });

  it("the landing page wires its bootstrap script and that script POSTs to /api/session", async () => {
    // The host clicks a button which POSTs to /api/session and is then
    // redirected to /s/<id>/. The HTML must reference the bootstrap
    // module, and that module must contain the session-create call --
    // otherwise the page is just text and the host can't start a game.
    const html = await (await SELF.fetch("https://example.com/")).text();
    const scriptMatch = html.match(
      /<script[^>]*type="module"[^>]*src="([^"]+)"/,
    );
    expect(scriptMatch).not.toBeNull();
    const scriptPath = scriptMatch![1]!;
    const js = await (
      await SELF.fetch(`https://example.com${scriptPath}`)
    ).text();
    expect(js).toContain("/api/session");
  });
});
