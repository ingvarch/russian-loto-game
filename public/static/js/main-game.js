// Admin page entry point.
//
// The Worker rewrites the two `<script type="application/json">` blobs
// in the HTML shell with this session's cards and range. We read them,
// resolve the initial state (server snapshot wins over local cache wins
// over fresh state), hand everything to the UI module, and subscribe
// to the same SSE stream the display uses so two admin views in two
// browsers stay in lockstep.
//
// API paths are relative so they resolve under the session prefix
// (e.g. /s/<id>/api/state). The owner cookie is scoped to that prefix
// and is sent automatically by the browser on same-origin POSTs.

import * as state from "./state.js";
import * as ui from "./ui.js";

const CARDS = JSON.parse(document.getElementById("cards-data").textContent);
const SERVER_RANGE = JSON.parse(document.getElementById("server-range").textContent);

const sessionMatch = location.pathname.match(/^\/s\/([^/]+)\//);
state.setSession(sessionMatch ? sessionMatch[1] : null);

const autoOpenNewGame =
  new URLSearchParams(location.search).get("new") === "1";
if (autoOpenNewGame) {
  history.replaceState(null, "", location.pathname + location.hash);
}

function pushToServer(s) {
  fetch("./api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(s),
  }).catch(() => {});
}

async function fetchRemoteState() {
  try {
    const res = await fetch("./api/state");
    if (!res.ok) return null;
    const body = await res.json();
    return body && body.state ? body.state : null;
  } catch {
    return null;
  }
}

// Subscribe to the same SSE stream the display uses so a second admin
// (e.g. host on phone + laptop) sees every change made on the other
// device. applyRemoteState is intentionally one-way -- it doesn't
// re-push received state, so admin POSTs don't echo into a loop.
function connectSSE() {
  const es = new EventSource("./api/events");
  es.onmessage = (evt) => {
    try {
      const payload = JSON.parse(evt.data);
      if (payload && payload.state) ui.applyRemoteState(payload.state);
    } catch (_e) { /* ignore malformed frames */ }
  };
  es.onerror = () => {
    es.close();
    setTimeout(connectSSE, 2000);
  };
}

const remoteState = await fetchRemoteState();
const initialState =
  remoteState
  || state.loadState()
  || state.freshState({ cardRange: SERVER_RANGE });

ui.init({ cards: CARDS, initialState, onSave: pushToServer, autoOpenNewGame });
connectSSE();

// ---- Share-display modal: QR + copyable URL ------------------------------

const shareModal = document.getElementById("share-display-modal");
const qrImg = document.getElementById("qr-img");
const qrUrlEl = document.getElementById("qr-url");
const displayUrl = new URL("display", location.href).toString();
qrUrlEl.textContent = displayUrl;

document.getElementById("share-display-btn").addEventListener("click", () => {
  // Lazy-load the QR: only fetched when the host actually opens the
  // modal, so admin pages that never share don't pay for the render.
  if (!qrImg.src) qrImg.src = "qr.svg";
  shareModal.classList.add("open");
});

shareModal.querySelector('[data-action="cancel"]').addEventListener("click", () => {
  shareModal.classList.remove("open");
});
shareModal.addEventListener("click", (ev) => {
  if (ev.target === shareModal) shareModal.classList.remove("open");
});

document.getElementById("qr-copy-btn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(displayUrl);
    const btn = document.getElementById("qr-copy-btn");
    const prev = btn.textContent;
    btn.textContent = "Скопировано";
    setTimeout(() => { btn.textContent = prev; }, 1200);
  } catch {
    // Clipboard may be denied; fall back to selecting the text.
    const range = document.createRange();
    range.selectNodeContents(qrUrlEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
});
