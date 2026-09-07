// Service worker for the installable app.
//
// It deliberately caches nothing. A browser only offers installation to a
// page that controls a service worker with a fetch handler, so this file
// exists to satisfy that and nothing else: every request passes straight
// through to the network. A live game must never be served a stale board
// or stale JS, and there is no useful offline mode for a game whose whole
// point is a Durable Object telling every device what was just drawn.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Pass through. No respondWith, so the browser performs its default fetch.
});
