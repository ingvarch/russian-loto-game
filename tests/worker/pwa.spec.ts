// PWA shell: the web app manifest and the service worker.
//
// Both are plain static files under public/, so the assets binding serves
// them and the Worker must not claim either path. As in landing.spec.ts,
// `SELF` does no asset routing, so the files are fetched through
// `env.ASSETS` and the Worker is asserted to 404 on them.

import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";

const ORIGIN = "https://example.com";

function asset(path: string): Promise<Response> {
  return env.ASSETS.fetch(new Request(`${ORIGIN}${path}`));
}

describe("web app manifest", () => {
  it("is not claimed by the Worker", async () => {
    const res = await SELF.fetch(`${ORIGIN}/manifest.webmanifest`);
    expect(res.status).toBe(404);
  });

  it("is served and parses as JSON", async () => {
    const res = await asset("/manifest.webmanifest");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toBeTypeOf("object");
  });

  it("declares what a browser needs to offer installation", async () => {
    const res = await asset("/manifest.webmanifest");
    const manifest = (await res.json()) as {
      name: string;
      short_name: string;
      start_url: string;
      display: string;
      icons: { src: string; sizes: string; type: string; purpose?: string }[];
    };

    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");

    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
  });

  it("points at icons that actually exist", async () => {
    const manifest = (await (await asset("/manifest.webmanifest")).json()) as {
      icons: { src: string }[];
    };
    for (const icon of manifest.icons) {
      const res = await asset(icon.src);
      expect(res.status, `${icon.src} should be served`).toBe(200);
    }
  });
});

describe("service worker", () => {
  it("is not claimed by the Worker", async () => {
    const res = await SELF.fetch(`${ORIGIN}/sw.js`);
    expect(res.status).toBe(404);
  });

  it("is served as JavaScript from the site root", async () => {
    const res = await asset("/sw.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/javascript/);
  });
});
