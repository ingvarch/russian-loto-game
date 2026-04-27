// Server-rendered QR code for the session's display URL. Lets the host
// point the table phone's camera at the admin screen instead of typing
// in the long shareable URL.

import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";

async function createSession(): Promise<{ sessionId: string }> {
  const res = await SELF.fetch("https://example.com/api/session", {
    method: "POST",
  });
  return (await res.json()) as { sessionId: string };
}

describe("/s/<id>/qr.svg", () => {
  it("returns 404 for an unknown session", async () => {
    const res = await SELF.fetch(
      "https://example.com/s/UNKNOWN999/qr.svg",
    );
    expect(res.status).toBe(404);
  });

  it("returns an SVG QR code for the display URL", async () => {
    const { sessionId } = await createSession();
    const res = await SELF.fetch(
      `https://example.com/s/${sessionId}/qr.svg`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^image\/svg\+xml/);
    const body = await res.text();
    expect(body).toMatch(/^<\?xml/);
    expect(body).toContain("<svg");
    // QR encodes the absolute display URL; that string isn't literal in
    // the SVG (it's encoded as modules), so we can't grep for it.
    // Sanity-check by length: a real QR has hundreds of path commands;
    // a blank or error SVG would be tiny.
    expect(body.length).toBeGreaterThan(500);
    expect(body).toMatch(/<path[^>]*\sd="[^"]{200,}"/);
  });

  it("sets a cache header so repeat visits don't re-render", async () => {
    const { sessionId } = await createSession();
    const res = await SELF.fetch(
      `https://example.com/s/${sessionId}/qr.svg`,
    );
    expect(res.headers.get("Cache-Control")).toMatch(/max-age=\d+/);
  });
});
