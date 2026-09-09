// Display page entry point.
//
// The Worker rewrites the `<script type="application/json">` cards blob
// in the HTML shell with this session's deck. We bootstrap the read-only
// UI, fetch the latest snapshot once for late-joining, then keep it in
// sync via SSE with auto-reconnect on disconnect.
//
// API paths are relative so they resolve under the session prefix
// (e.g. /s/<id>/api/events).

import * as displayUI from "./display-ui.js";
import { openShareModal } from "./share-modal.js";
import { registerServiceWorker } from "./pwa.js";
import { installNavProgress } from "./nav-progress.js";
import { loadPrefs, applyTheme } from "./prefs.js";
import { startWakeLock } from "./wake-lock.js";

const CARDS = JSON.parse(document.getElementById("cards-data").textContent);

displayUI.init({ cards: CARDS });

function refetchState() {
  return fetch("./api/state")
    .then((r) => (r.ok ? r.json() : null))
    .then((payload) => {
      if (payload && payload.state) displayUI.render(payload.state);
    })
    .catch(() => {});
}

refetchState();

let currentES = null;

function connectSSE() {
  const es = new EventSource("./api/events");
  currentES = es;

  es.onopen = () => displayUI.setConnected(true);

  es.onmessage = (evt) => {
    try {
      const payload = JSON.parse(evt.data);
      displayUI.render(payload.state || payload);
    } catch (_e) { /* ignore malformed frames */ }
  };

  es.onerror = () => {
    displayUI.setConnected(false);
    es.close();
    if (currentES === es) currentES = null;
    setTimeout(connectSSE, 2000);
  };
}

connectSSE();

// When the tab/screen wakes from sleep, SSE can be stalled with no error fired
// yet. Force a state refetch and reopen the stream so the display catches up
// before the next mutation.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  refetchState();
  if (currentES) {
    currentES.close();
    currentES = null;
  }
  connectSSE();
});

// ---- Share-display sheet -------------------------------------------------
//
// Same sheet the host raises; share-modal.js drops its "open on this device"
// link when it notices it is already on the board.

document.getElementById("share-display-btn").addEventListener("click", openShareModal);

const prefs = loadPrefs();
applyTheme(prefs.theme);
if (prefs.keepAwake) startWakeLock();

registerServiceWorker();
installNavProgress();
