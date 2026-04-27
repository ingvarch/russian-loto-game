// Display page entry point.
//
// The Worker rewrites the two `<script type="application/json">` blobs
// in the HTML shell with this session's cards and range. We bootstrap
// the read-only UI, fetch the latest snapshot once for late-joining,
// then keep it in sync via SSE with auto-reconnect on disconnect.
//
// API paths are relative so they resolve under the session prefix
// (e.g. /s/<id>/api/events).

import * as displayUI from "./display-ui.js";

const CARDS = JSON.parse(document.getElementById("cards-data").textContent);
const SERVER_RANGE = JSON.parse(document.getElementById("server-range").textContent);

displayUI.init({ cards: CARDS, range: SERVER_RANGE });

fetch("./api/state")
  .then((r) => (r.ok ? r.json() : null))
  .then((payload) => {
    if (payload && payload.state) displayUI.render(payload.state);
  })
  .catch(() => {});

function connectSSE() {
  const es = new EventSource("./api/events");

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
    setTimeout(connectSSE, 2000);
  };
}

connectSSE();
