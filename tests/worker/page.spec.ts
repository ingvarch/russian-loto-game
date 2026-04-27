// Page serving for session-scoped admin and display URLs. The Worker
// pulls the static HTML shell from the [assets] binding and rewrites
// the two `<script type="application/json">` blobs (cards + range)
// with values from the session's GameRoom DO.

import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";

async function createSession(): Promise<{ sessionId: string }> {
  const res = await SELF.fetch("https://example.com/api/session", {
    method: "POST",
  });
  return (await res.json()) as { sessionId: string };
}

// Extract the inline JSON payload of <script type="application/json"
// id="<id>">...</script>. Returns the parsed value or throws if the
// element is missing or its content is not valid JSON.
function extractInlineJSON(html: string, id: string): unknown {
  const re = new RegExp(
    `<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/script>`,
  );
  const m = html.match(re);
  if (!m) throw new Error(`script#${id} not found in HTML`);
  return JSON.parse(m[1]!);
}

describe("/s/<id>/ (admin page)", () => {
  it("returns 404 for an unknown session", async () => {
    const res = await SELF.fetch("https://example.com/s/UNKNOWN999/");
    expect(res.status).toBe(404);
  });

  it("serves the admin HTML with cards-data and server-range injected", async () => {
    const { sessionId } = await createSession();
    const res = await SELF.fetch(`https://example.com/s/${sessionId}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/html/);

    const html = await res.text();
    // Placeholders must be replaced -- otherwise the client JS would
    // fail to parse them as JSON on load.
    expect(html).not.toContain("{{CARDS_JSON}}");
    expect(html).not.toContain("{{SERVER_RANGE}}");

    const cards = extractInlineJSON(html, "cards-data");
    expect(Array.isArray(cards)).toBe(true);

    const range = extractInlineJSON(html, "server-range");
    // Default sessions have no server-side range filter.
    expect(range).toBeNull();
  });
});

describe("/s/<id>/display (display page)", () => {
  it("returns 404 for an unknown session", async () => {
    const res = await SELF.fetch(
      "https://example.com/s/UNKNOWN999/display",
    );
    expect(res.status).toBe(404);
  });

  it("serves the display HTML with cards-data and server-range injected", async () => {
    const { sessionId } = await createSession();
    const res = await SELF.fetch(
      `https://example.com/s/${sessionId}/display`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/html/);

    const html = await res.text();
    expect(html).not.toContain("{{CARDS_JSON}}");
    expect(html).not.toContain("{{SERVER_RANGE}}");

    const cards = extractInlineJSON(html, "cards-data");
    expect(Array.isArray(cards)).toBe(true);
  });
});
