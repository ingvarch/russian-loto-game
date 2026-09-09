// Event log: one row per level crossing, with the rollback affordance while
// the game has not yet moved on.

import * as logic from "./logic.js";
import { LEVEL_LABELS } from "./ui-format.js";

const LOG_VISIBLE = 5;
// How many balls may be drawn after an event before its rollback locks. The
// undo is a misclick guard, not a free rewind -- once the game has moved on a
// few draws, the resolution is final and the row greys out.
const REOPEN_WINDOW = 5;
const eventKey = (e) => e.cid + ":" + e.level + ":" + e.callCount;
const isReopenable = (state, e, calledCount) =>
  logic.isEventReopenable(state, e, calledCount, REOPEN_WINDOW);
// Rebuild the log only when something visible changed, so unrelated state
// pushes (an SSE heartbeat) don't reflow and flicker the list. The signature
// folds in each row's reopenable flag so the button vanishes on the exact draw
// that closes its window. Only rows whose key is new since the last build animate.
let lastLogSig = null;
let prevLogKeys = new Set();

export function logSignature(state) {
  const calledCount = state.called.length;
  return state.events
    .map((e) => eventKey(e) + (e.status || "") + (isReopenable(state, e, calledCount) ? "r" : "l"))
    .join("|");
}

export function renderLog(state, { onEventClick, onReopen }) {
  const logEl = document.getElementById("log");
  const events = state.events;
  const calledCount = state.called.length;
  const sig = logSignature(state);
  if (sig === lastLogSig) return;
  lastLogSig = sig;

  if (events.length === 0) {
    logEl.innerHTML = '<div class="log-empty">Событий пока нет</div>';
    prevLogKeys = new Set();
    renderLogToggle(0);
    return;
  }

  logEl.innerHTML = "";
  const keys = new Set();
  events.forEach((e, i) => {
    const key = eventKey(e);
    keys.add(key);
    const status = e.status || "confirmed";
    const row = document.createElement("div");
    row.className = "log-entry level-" + e.level + " status-" + status;
    if (i >= LOG_VISIBLE) row.classList.add("log-overflow");
    if (!prevLogKeys.has(key)) row.classList.add("log-new");
    const levelText = LEVEL_LABELS[e.level];
    let suffix = "";
    if (status === "pending") suffix = " · ждёт подтверждения";
    else if (status === "absent") suffix = " · не в игре";
    row.innerHTML =
      '<span class="ts">' + e.ts + '</span>' +
      '<span class="seq">' + logic.formatSeq(e.seq) + '</span>' +
      '<span class="level">' + levelText + suffix + '</span>';
    row.addEventListener("click", () => onEventClick(e.cid));
    if (isReopenable(state, e, calledCount)) {
      const reopenBtn = document.createElement("button");
      reopenBtn.type = "button";
      reopenBtn.className = "log-reopen";
      reopenBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /> <path d="M3 3v5h5" /></svg>';
      reopenBtn.title = "Вернуть к подтверждению";
      reopenBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onReopen(e);
      });
      row.appendChild(reopenBtn);
    } else if (status === "confirmed" || status === "absent") {
      row.classList.add("locked");
    }
    logEl.appendChild(row);
  });
  prevLogKeys = keys;
  renderLogToggle(events.length);
}

// "Показать все" controls: one in the header (collapse without scrolling),
// one at the bottom of the list. Both reflect and flip the same .log-expanded
// state on the section, which survives re-renders (SSE pushes, resolutions).
// Hidden entirely when events fit in LOG_VISIBLE.
function renderLogToggle(total) {
  const section = document.getElementById("log-section");
  const btn = document.getElementById("log-toggle");
  const top = document.getElementById("log-toggle-top");
  if (!section || !btn || !top) return;
  if (total <= LOG_VISIBLE) {
    btn.classList.add("hidden");
    top.classList.add("hidden");
    section.classList.remove("log-expanded");
    return;
  }
  btn.classList.remove("hidden");
  top.classList.remove("hidden");
  const expanded = section.classList.contains("log-expanded");
  btn.textContent = expanded ? "Свернуть" : "Показать все (" + total + ")";
  top.textContent = expanded ? "Свернуть" : "Развернуть";
}

export function wireLog(getEventCount) {
  const section = document.getElementById("log-section");
  if (!section) return;
  const toggle = () => {
    section.classList.toggle("log-expanded");
    renderLogToggle(getEventCount());
  };
  for (const id of ["log-toggle", "log-toggle-top"]) {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", toggle);
  }
}
