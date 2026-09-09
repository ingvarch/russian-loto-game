// The winners panel, shared by the host board and the /display board.
//
// Both pages mount the same three level rows and must agree on when a row
// appears, so the visibility rule lives here once; only the winner cell
// differs, and each page passes its own renderSeq for it.

import * as logic from "./logic.js";

// The cards a level row shows, or null while the level is undecided.
export function decidedWinners(gameState, cards, level) {
  const r = logic.resolveLevel(gameState, cards, level);
  return r.status === "decided" && r.winners.length >= 1 ? r.winners : null;
}

// Paints the three rows and hides the whole section while no level is decided.
// renderSeq(seqEl, winners) fills the winner cell of a decided row.
export function renderWinnersPanel(gameState, cards, renderSeq) {
  const section = document.getElementById("winners-section");
  if (!section) return;
  let shown = 0;
  for (const lvl of [1, 2, 3]) {
    const row = document.getElementById("winner-" + lvl);
    if (!row) continue;
    const seqEl = row.querySelector(".winner-seq");
    const winners = decidedWinners(gameState, cards, lvl);
    const decided = winners !== null;
    row.classList.toggle("hidden", !decided);
    row.classList.toggle("won", decided);
    if (decided) {
      renderSeq(seqEl, winners);
      shown += 1;
    } else {
      seqEl.textContent = "—";
    }
  }
  section.classList.toggle("hidden", shown === 0);
}
