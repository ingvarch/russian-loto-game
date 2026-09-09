// Admin page UI: DOM rendering and event handlers.
//
// Holds two pieces of mutable module state:
//   CARDS    -- immutable for the session (loaded from bootstrap JSON)
//   current  -- the live game state; mutated in place by state.js mutators
//               and reassigned on "new game" when the whole state is replaced
//
// All business logic lives in logic.js (pure) and state.js (mutators).
// This module only touches the DOM.
//
// Each screen surface lives in its own ui-*.js sibling. This module is the
// composition root: it owns the state, wires the surfaces to handlers and
// fans render() out to them.

import * as logic from "./logic.js";
import * as state from "./state.js";
import { updatePrefs } from "./prefs.js";
import { formatAmount } from "./ui-format.js";
import { buildGrid, renderCells } from "./ui-grid.js";
import * as log from "./ui-log.js";
import { renderPayout } from "./ui-payout.js";
import * as newGame from "./ui-new-game.js";
import * as modals from "./ui-modals.js";
import * as sheet from "./ui-sheet.js";

let CARDS = [];
let current = null;
let onSaveHook = null;   // optional callback fired after every persist()

function active() { return logic.activeCards(CARDS, current.cardRange); }
function calledSet() { return logic.calledSet(current.called); }
function payouts() { return logic.computePayouts(current, active()); }

// Single choke-point for writing state: localStorage first (always synchronous
// and fast), then the optional hook which callers (main-game.js) use to push
// to the server so the /display page stays in sync.
function persist() {
  state.saveState(current);
  if (onSaveHook) {
    try { onSaveHook(current); } catch (_e) { /* hook errors must not break UI */ }
  }
}

// ---- Public entry point --------------------------------------------------

// Replace the entire UI state with one received from the server (e.g.
// the host opened admin in a second tab/device, or the other admin
// pushed a change). The remote payload is treated as authoritative:
// we save it to localStorage so a refresh persists, but we do NOT
// fire onSaveHook -- otherwise we'd echo it straight back to the
// server and create a feedback loop. recompute() runs defensively in
// case the payload was pushed by an older client whose cardLevel was
// stale; on a healthy state it's a no-op.
export function applyRemoteState(remoteState) {
  if (!remoteState || typeof remoteState !== "object") return;
  current = remoteState;
  state.saveState(current);
  state.recompute(current, active(), state.nowHHMM());
  render();
}

export function init({ cards, initialState, onSave, autoOpenNewGame }) {
  CARDS = cards;
  current = initialState;
  onSaveHook = onSave || null;

  buildGrid(onCellClick);
  wireUncallModal();
  wireWinContinueModal();
  newGame.wireNewGameModal({ cards: CARDS, getState: () => current, onStart: startNewGame });
  log.wireLog(() => current.events.length);
  wireCloseHelp();
  wireWinOverlay();
  wireMusicPause();
  sheet.wireBottomSheet();

  // Reconcile stored state on load: cardLevel may be stale if CARDS changed
  // (e.g. the server restarted with a different registry). Any level
  // crossings found during reconciliation are emitted as pending events
  // exactly like during normal play -- the admin confirms them via the
  // same modal.
  state.recompute(current, active(), state.nowHHMM());
  persist();
  render();

  // First visit from the landing page: open the new-game modal so the
  // host can pick bank/percentages/range before the first call. The
  // existing modal handler does the rest -- no extra wiring here.
  if (autoOpenNewGame) newGame.open(current, CARDS);
}

// ---- Grid ----------------------------------------------------------------

function onCellClick(n) {
  // The grid is set `.blocked` while any pending event or unresolved tiebreak
  // exists, but clicks can still arrive via keyboard events etc. -- double
  // guard here.
  if (logic.hasPendingEvents(current)) return;
  if (logic.nextTiebreakBatch(current, active())) return;
  if (current.called.includes(n)) {
    modals.askUncall(n, current, active());
  } else {
    state.applyCallNumber(current, n, active());
    persist();
    render();
    // Level-3 events that were auto-confirmed by this call (because
    // levelAutoConfirm[3] was already true) don't go through the confirm
    // modal and therefore miss the win-overlay trigger there; fire it
    // here. If the batch needs tiebreak resolution first, the overlay
    // fires after the host picks -- see resolveTiebreak().
    maybeShowAutoWin();
  }
}

function maybeShowAutoWin() {
  const callCount = current.called.length;
  const freshWinners = (current.events || []).filter(
    (e) => e.level === 3 && e.callCount === callCount && e.status === "confirmed",
  );
  if (freshWinners.length === 0) return;
  const tb = logic.nextTiebreakBatch(current, active());
  if (tb && tb.level === 3 && tb.callCount === callCount) return;
  freshWinners.sort((a, b) => a.seq - b.seq);
  const winner = CARDS.find((c) => c.cid === freshWinners[0].cid);
  if (winner) showWin(winner);
}

// ---- Render --------------------------------------------------------------

function render() {
  renderCells(calledSet());
  renderWinners();
  renderClose();
  renderPayout(payouts(), openSheet);
  renderCounters();
  log.renderLog(current, { onEventClick: openSheet, onReopen: reopenEvent });
  modals.maybeShowConfirmation(current, active(), {
    onSeqClick: openSheet,
    onResolve: resolvePendingEvent,
  });
  modals.maybeShowTiebreak(current, active(), {
    onSeqClick: openSheet,
    onPick: resolveTiebreak,
  });
  maybeShowMusicPause();
}

function renderCounters() {
  document.getElementById("counter-called").textContent = String(current.called.length);
  document.getElementById("card-count").textContent = active().length + " карт";
}

// Mirror of the /display winners panel: each level row shows once the host
// has confirmed it, via resolveLevel so host-picked tiebreak winners surface.
// Whole section hidden until at least one level is decided.
function renderWinners() {
  const section = document.getElementById("winners-section");
  if (!section) return;
  const cards = active();
  let shown = 0;
  for (const lvl of [1, 2, 3]) {
    const row = document.getElementById("winner-" + lvl);
    if (!row) continue;
    const seqEl = row.querySelector(".winner-seq");
    const r = logic.resolveLevel(current, cards, lvl);
    const decided = r.status === "decided" && r.winners.length >= 1;
    row.classList.toggle("hidden", !decided);
    row.classList.toggle("won", decided);
    if (decided) {
      seqEl.textContent = "";
      r.winners.forEach((c, i) => {
        if (i > 0) seqEl.appendChild(document.createTextNode(", "));
        const item = document.createElement("span");
        item.className = "winner-seq-item";
        item.textContent = logic.formatSeq(c.seq);
        item.addEventListener("click", () => openSheet(c.cid));
        seqEl.appendChild(item);
      });
      shown += 1;
    } else {
      seqEl.textContent = "—";
    }
  }
  section.classList.toggle("hidden", shown === 0);
}

const TARGET_LABELS = { 1: "одной линии", 2: "двум линиям", 3: "полному лото" };

// "Близки к ..." panel: cards a single call from the level the game is chasing
// next. Once one line is won the count switches to cards close to two lines,
// then to полное лото. Hidden when the game is over or no card is close.
function renderClose() {
  const called = calledSet();
  const section = document.getElementById("close-section");
  const label = document.getElementById("close-label");
  const list = document.getElementById("close-list");
  const target = logic.nextTargetLevel(current, active());
  const close = target === null ? [] : logic.closeCardsForLevel(active(), called, target);
  if (close.length === 0) {
    section.classList.add("hidden");
    list.innerHTML = "";
    return;
  }
  section.classList.remove("hidden");
  label.textContent = "Близки к " + TARGET_LABELS[target] + " (" + close.length + ")";
  close.sort((a, b) => a.seq - b.seq);
  list.innerHTML = "";
  for (const card of close) {
    const chip = document.createElement("span");
    chip.className = "close-chip";
    chip.textContent = logic.formatSeq(card.seq);
    chip.addEventListener("click", () => openSheet(card.cid));
    list.appendChild(chip);
  }
}

function wireCloseHelp() {
  const btn = document.getElementById("close-help-btn");
  const help = document.getElementById("close-help");
  if (!btn || !help) return;
  btn.addEventListener("click", () => help.classList.toggle("hidden"));
}

// ---- Event resolution ----------------------------------------------------

function wireUncallModal() {
  modals.wireUncallModal((n) => {
    state.applyUncallNumber(current, n, active());
    persist();
    render();
  });
}

function reopenEvent(event) {
  state.applyReopenEvent(current, {
    cid: event.cid, level: event.level, callCount: event.callCount,
  });
  persist();
  render();
  modals.maybeShowConfirmation(current, active(), {
    onSeqClick: openSheet,
    onResolve: resolvePendingEvent,
  });
}

function resolvePendingEvent(event, resolution) {
  state.applyResolveEvent(current, event, resolution);
  persist();
  // If that was the last pending event in a level-3 batch and at least one
  // card in the batch was confirmed, fire the win overlay. We recompute the
  // batch identity from `event` since the modal may close between the last
  // confirmation and the next render.
  const batchCleared = !(current.events || []).some(
    (e) =>
      e.status === "pending" && e.level === event.level && e.callCount === event.callCount,
  );
  render();
  if (batchCleared && event.level === 3) {
    // Skip the overlay if a tiebreak is still required for this batch --
    // it fires after the host picks (see resolveTiebreak).
    const tb = logic.nextTiebreakBatch(current, active());
    if (tb && tb.level === 3 && tb.callCount === event.callCount) return;
    const confirmed = (current.events || [])
      .filter(
        (e) => e.level === 3 && e.callCount === event.callCount && e.status === "confirmed",
      )
      .sort((a, b) => a.seq - b.seq);
    if (confirmed.length > 0) {
      const winner = CARDS.find((c) => c.cid === confirmed[0].cid);
      if (winner) showWin(winner);
    }
  }
}

function resolveTiebreak(level, callCount, cid) {
  state.applyResolveTiebreak(current, { level, callCount }, cid);
  persist();
  render();
  if (level === 3) {
    const winner = CARDS.find((c) => c.cid === cid);
    if (winner) showWin(winner);
  }
}

// ---- New game ------------------------------------------------------------

function startNewGame(form) {
  // The form is the other half of the settings screen's eggs switch: what
  // the host picks here is what the next game starts with.
  updatePrefs({ easterEggs: form.easterEggs });
  current = state.freshState(form);
  persist();
  render();
  closeWin();
}

// ---- Win overlay ---------------------------------------------------------

function showWin(card) {
  document.getElementById("win-seq").textContent = logic.formatSeq(card.seq);
  document.getElementById("win-cid").textContent = card.cid;

  const amountEl = document.getElementById("win-amount");
  const amountValueEl = document.getElementById("win-amount-value");
  const noteEl = document.getElementById("win-amount-note");
  const p = payouts();
  if (
    p.status === "active" &&
    p.level3.status === "paid" &&
    p.level3.winners.some((w) => w.cid === card.cid)
  ) {
    let amount = p.level3.perPerson;
    if (
      p.level3.absorbFinalRemainder &&
      p.level3.remainder > 0 &&
      p.level3.winners[0].cid === card.cid
    ) {
      amount += p.level3.remainder;
    }
    amountValueEl.textContent = formatAmount(amount);
    if (p.level3.winners.length > 1) {
      const others = p.level3.winners.length - 1;
      noteEl.textContent = "Ничья, доля из " + formatAmount(p.level3.base) +
        " (ещё " + others + " победител" + (others === 1 ? "ь" : "ей") + ")";
      noteEl.classList.remove("hidden");
    } else {
      noteEl.classList.add("hidden");
    }
    amountEl.classList.remove("hidden");
  } else {
    amountEl.classList.add("hidden");
  }

  document.getElementById("win-backdrop").classList.add("open");
}

function closeWin() {
  document.getElementById("win-backdrop").classList.remove("open");
}

function wireWinContinueModal() {
  modals.setupModal("confirm-win-continue", closeWin);
}

function wireWinOverlay() {
  document.getElementById("win-continue-btn").addEventListener("click", () => {
    document.getElementById("confirm-win-continue").classList.add("open");
  });
  document.getElementById("win-new-game-btn").addEventListener("click", () => {
    newGame.open(current, CARDS);
  });
}

// ---- Musical pause -------------------------------------------------------
//
// Driven purely by state so it opens on every admin tab via the shared SSE
// stream and closes everywhere once any admin presses continue.

function maybeShowMusicPause() {
  document.getElementById("music-backdrop").classList.toggle("open", logic.musicPauseActive(current));
}

function wireMusicPause() {
  document.getElementById("music-continue-btn").addEventListener("click", () => {
    state.applyMusicPauseContinue(current);
    persist();
    render();
  });
}

// ---- Bottom sheet --------------------------------------------------------

function openSheet(cid) {
  const card = CARDS.find((c) => c.cid === cid);
  if (!card) return;
  sheet.openSheet(card, calledSet(), current.cardLevel[cid] || 0);
}
