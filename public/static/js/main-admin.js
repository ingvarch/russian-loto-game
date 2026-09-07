// Admin panel bootstrap.
//
// Polls /admin/api/sessions and repaints. Polling rather than SSE: the
// listing spans every game, and subscribing to N rooms to render a
// read-only list would cost far more than a five-second fetch.

import { summarizeSession } from "./admin-logic.js";
import { loadPrefs, applyTheme } from "./prefs.js";
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

// ---- Deleting a game -----------------------------------------------------
//
// Irreversible, so it goes through a dialog that names the game and says
// plainly when the game is still being played.

const listEl = document.getElementById("game-list");
const confirmEl = document.getElementById("confirm-delete");
const confirmIdEl = document.getElementById("confirm-delete-id");
const confirmLiveEl = document.getElementById("confirm-delete-live");

let pendingDelete = null;

function closeConfirm() {
  confirmEl.classList.remove("open");
  pendingDelete = null;
}

listEl.addEventListener("click", (ev) => {
  const btn = ev.target.closest(".game-delete");
  if (btn === null) return;
  pendingDelete = btn.dataset.session;
  confirmIdEl.textContent = pendingDelete;
  const live = btn.closest(".game-card")?.querySelector(".game-status.is-live");
  confirmLiveEl.classList.toggle("hidden", live === null || live === undefined);
  confirmEl.classList.add("open");
});

confirmEl.querySelector('[data-action="cancel"]').addEventListener("click", closeConfirm);
confirmEl.addEventListener("click", (ev) => {
  if (ev.target === confirmEl) closeConfirm();
});

confirmEl.querySelector('[data-action="confirm"]').addEventListener("click", async () => {
  const id = pendingDelete;
  if (id === null) return;
  closeConfirm();
  try {
    const res = await fetch(`/admin/api/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    ui.clearError();
  } catch (e) {
    ui.showError(`Не удалось удалить игру ${id}: ${e.message}`);
  }
  refresh();
});

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

applyTheme(loadPrefs().theme);
