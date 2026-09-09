// Modal surfaces of the host page: the uncall guard, the confirmation of a
// level crossing and the tiebreak pick.

import * as logic from "./logic.js";
import { LEVEL_LABELS, LEVEL_LABELS_ACCUSATIVE } from "./ui-format.js";

export function setupModal(id, onConfirm) {
  const modal = document.getElementById(id);
  modal.querySelector('[data-action="cancel"]').addEventListener("click", () => {
    modal.classList.remove("open");
  });
  modal.querySelector('[data-action="confirm"]').addEventListener("click", () => {
    modal.classList.remove("open");
    onConfirm();
  });
  modal.addEventListener("click", (ev) => {
    if (ev.target === modal) modal.classList.remove("open");
  });
}

// ---- Confirm-uncall modal ------------------------------------------------

let pendingUncall = null;

export function askUncall(n, state, cards) {
  pendingUncall = n;
  document.getElementById("confirm-uncall-num").textContent = String(n);
  const warnEl = document.getElementById("confirm-uncall-warning");
  const confirmBtn = document.querySelector('#confirm-uncall [data-action="confirm"]');
  const locked = logic.winnersLockedNumbers(state, cards);
  if (locked.has(n)) {
    const where = locked
      .get(n)
      .map((w) => logic.formatSeq(w.seq) + " (" + LEVEL_LABELS[w.level] + ")")
      .join(", ");
    warnEl.textContent = "Это число закрывает выигрышную линию: " + where + ". Отжатие отменит победу.";
    warnEl.classList.remove("hidden");
    confirmBtn.classList.add("btn-danger");
  } else {
    warnEl.classList.add("hidden");
    confirmBtn.classList.remove("btn-danger");
  }
  document.getElementById("confirm-uncall").classList.add("open");
}

export function wireUncallModal(onConfirm) {
  setupModal("confirm-uncall", () => {
    if (pendingUncall !== null) {
      onConfirm(pendingUncall);
      pendingUncall = null;
    }
  });
}

// ---- Confirmation modal --------------------------------------------------
//
// Fires whenever any event in state is pending. For a singular crossing
// (one card, the common case) shows a yes/no confirmation. For simultaneous
// crossings (multiple cards at the same callCount -- the old tiebreak
// scenario) shows all candidates with per-card [Играет]/[Не в игре]
// buttons; the modal stays open until every candidate is marked.
//
// When the last pending event of a level-3 batch is confirmed, fires the
// win overlay for the first confirmed card (by seq).

export function maybeShowConfirmation(state, cards, { onSeqClick, onResolve }) {
  const modal = document.getElementById("confirm-line-modal");
  const grid = document.getElementById("number-grid");
  const batch = logic.nextPendingBatch(state, cards);

  if (!batch) {
    modal.classList.remove("open");
    grid.classList.remove("blocked");
    return;
  }

  const levelLabelAcc = LEVEL_LABELS_ACCUSATIVE[batch.level];
  const titleEl = document.getElementById("confirm-line-title");
  const hintEl = document.getElementById("confirm-line-hint");
  titleEl.textContent = batch.candidates.length === 1
    ? "Карточка закрыла " + levelLabelAcc
    : batch.candidates.length + " карточки закрыли " + levelLabelAcc + " одновременно";
  hintEl.textContent = batch.candidates.length === 1
    ? "Игрок с этой карточкой подтверждает?"
    : "Отметь каждую: играет или нет.";

  const listEl = document.getElementById("confirm-line-candidates");
  listEl.innerHTML = "";
  for (const { event, card } of batch.candidates) {
    const row = document.createElement("div");
    row.className = "confirm-candidate";

    const label = document.createElement("div");
    label.className = "confirm-candidate-label";
    const seqSpan = document.createElement("span");
    seqSpan.className = "confirm-candidate-seq";
    seqSpan.textContent = logic.formatSeq(card.seq);
    seqSpan.addEventListener("click", () => onSeqClick(card.cid));
    label.appendChild(seqSpan);
    const cidSpan = document.createElement("span");
    cidSpan.className = "confirm-candidate-cid";
    cidSpan.textContent = card.cid;
    label.appendChild(cidSpan);

    const actions = document.createElement("div");
    actions.className = "confirm-candidate-actions";
    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "btn-confirm-play";
    confirmBtn.textContent = "Играет";
    confirmBtn.addEventListener("click", () => onResolve(event, "confirmed"));
    const absentBtn = document.createElement("button");
    absentBtn.type = "button";
    absentBtn.className = "btn-confirm-absent";
    absentBtn.textContent = "Не в игре";
    absentBtn.addEventListener("click", () => onResolve(event, "absent"));
    actions.appendChild(confirmBtn);
    actions.appendChild(absentBtn);

    row.appendChild(label);
    row.appendChild(actions);
    listEl.appendChild(row);
  }

  modal.classList.add("open");
  grid.classList.add("blocked");
}

// ---- Tiebreak modal (split=false only) -----------------------------------
//
// Fires when `nextTiebreakBatch` reports an unresolved tie: the host ran a
// mini-game at the table and taps the winning card. After the pick, if the
// tie was at level 3 we fire the win overlay (same as resolvePendingEvent).

export function maybeShowTiebreak(state, cards, { onSeqClick, onPick }) {
  const modal = document.getElementById("tiebreak-modal");
  const grid = document.getElementById("number-grid");
  const batch = logic.nextTiebreakBatch(state, cards);
  if (!batch) {
    modal.classList.remove("open");
    // Only remove .blocked if no confirmation modal is up either.
    if (!logic.hasPendingEvents(state)) grid.classList.remove("blocked");
    return;
  }

  const titleEl = document.getElementById("tiebreak-title");
  const levelText = LEVEL_LABELS_ACCUSATIVE[batch.level];
  titleEl.textContent = "Ничья: " + batch.candidates.length + " карт закрыли " + levelText;

  const listEl = document.getElementById("tiebreak-candidates");
  listEl.innerHTML = "";
  for (const card of batch.candidates) {
    const row = document.createElement("div");
    row.className = "confirm-candidate";

    const label = document.createElement("div");
    label.className = "confirm-candidate-label";
    const seqSpan = document.createElement("span");
    seqSpan.className = "confirm-candidate-seq";
    seqSpan.textContent = logic.formatSeq(card.seq);
    seqSpan.addEventListener("click", () => onSeqClick(card.cid));
    label.appendChild(seqSpan);
    const cidSpan = document.createElement("span");
    cidSpan.className = "confirm-candidate-cid";
    cidSpan.textContent = card.cid;
    label.appendChild(cidSpan);

    const actions = document.createElement("div");
    actions.className = "confirm-candidate-actions tiebreak-pick";
    const pickBtn = document.createElement("button");
    pickBtn.type = "button";
    pickBtn.className = "btn-confirm-play";
    pickBtn.textContent = "Победитель";
    pickBtn.addEventListener("click", () =>
      onPick(batch.level, batch.callCount, card.cid),
    );
    actions.appendChild(pickBtn);

    row.appendChild(label);
    row.appendChild(actions);
    listEl.appendChild(row);
  }

  modal.classList.add("open");
  grid.classList.add("blocked");
}
