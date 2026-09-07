// Admin panel bootstrap.
//
// Polls /admin/api/sessions and repaints. Polling rather than SSE: the
// listing spans every game, and subscribing to N rooms to render a
// read-only list would cost far more than a five-second fetch.

import { summarizeSession } from "./admin-logic.js";
import * as ui from "./admin-ui.js";

const POLL_MS = 5000;

const activeOnlyEl = document.getElementById("active-only");
const refreshEl = document.getElementById("refresh-btn");

let timer = null;

async function refresh() {
  const query = activeOnlyEl.checked ? "?activeOnly=1" : "";
  try {
    const res = await fetch(`/admin/api/sessions${query}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    const now = Date.now();
    ui.render(rows.map((row) => summarizeSession(row, now)));
    ui.clearError();
  } catch (e) {
    // Keep the last good listing on screen; a dropped poll is not a
    // reason to blank the page.
    ui.showError(`Не удалось обновить список: ${e.message}`);
  }
}

function startPolling() {
  stopPolling();
  timer = setInterval(refresh, POLL_MS);
}

function stopPolling() {
  if (timer !== null) clearInterval(timer);
  timer = null;
}

activeOnlyEl.addEventListener("change", refresh);
refreshEl.addEventListener("click", refresh);

// A hidden tab does not need to poll, and a phone waking from sleep
// should catch up immediately rather than after the next tick.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    refresh();
    startPolling();
  } else {
    stopPolling();
  }
});

refresh();
startPolling();
