// Admin page entry point.
//
// The Worker rewrites the two `<script type="application/json">` blobs
// in the HTML shell with this session's cards and range. We read them,
// restore any locally-saved state, and hand everything to the UI module.
// All pure logic lives in logic.js, all state management in state.js --
// this file is just wiring.
//
// API paths are relative so they resolve under the session prefix
// (e.g. /s/<id>/api/state). The owner cookie is scoped to that prefix
// and is sent automatically by the browser on same-origin POSTs.

import * as state from "./state.js";
import * as ui from "./ui.js";

const CARDS = JSON.parse(document.getElementById("cards-data").textContent);
const SERVER_RANGE = JSON.parse(document.getElementById("server-range").textContent);

// Scope localStorage by session id (parsed from /s/<id>/...) so two
// sessions in the same browser don't share a single saved game.
const sessionMatch = location.pathname.match(/^\/s\/([^/]+)\//);
state.setSession(sessionMatch ? sessionMatch[1] : null);

const initialState = state.loadState()
  || state.freshState({ cardRange: SERVER_RANGE });

function pushToServer(s) {
  fetch("./api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(s),
  }).catch(() => {});
}

// `?new=1` is set by the landing page when the host just created a fresh
// session. Strip the query before booting the UI so a refresh doesn't
// re-open the modal indefinitely.
const autoOpenNewGame =
  new URLSearchParams(location.search).get("new") === "1";
if (autoOpenNewGame) {
  history.replaceState(null, "", location.pathname + location.hash);
}

ui.init({ cards: CARDS, initialState, onSave: pushToServer, autoOpenNewGame });
