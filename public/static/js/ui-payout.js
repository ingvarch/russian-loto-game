// Payout table: what each level is worth and who has claimed it.

import * as logic from "./logic.js";
import { formatAmount } from "./ui-format.js";

export function renderPayout(p, onCardClick) {
  const section = document.getElementById("payout-section");
  if (p.status !== "active") {
    section.classList.add("hidden");
    return;
  }
  section.classList.remove("hidden");

  const total = p.base1 + p.base2 + p.base3;
  document.getElementById("payout-total").textContent = formatAmount(total);

  const grid = document.getElementById("payout-grid");
  grid.innerHTML = "";
  grid.appendChild(renderPayoutRow(1, "одна линия", p.level1, onCardClick));
  grid.appendChild(renderPayoutRow(2, "две линии", p.level2, onCardClick));
  grid.appendChild(renderPayoutRow(3, "полное лото", p.level3, onCardClick));
}

function renderPayoutRow(level, label, info, onCardClick) {
  const row = document.createElement("div");
  row.className = "payout-row level-" + level;

  const levelEl = document.createElement("div");
  levelEl.className = "payout-level";
  levelEl.textContent = label;

  const winnersEl = document.createElement("div");
  winnersEl.className = "payout-winners";

  const amountEl = document.createElement("div");
  amountEl.className = "payout-amount";

  if (info.status === "unclaimed") {
    row.classList.add("unclaimed");
    winnersEl.textContent = "ждёт";
    amountEl.textContent = formatAmount(info.base);
  } else if (info.status === "pending-tiebreak") {
    row.classList.add("unclaimed");
    winnersEl.textContent = "ничья, жду выбора";
    amountEl.textContent = formatAmount(info.base);
  } else if (info.status === "paid") {
    info.winners.forEach((card) => {
      const chip = document.createElement("span");
      chip.className = "chip-sm";
      chip.textContent = logic.formatSeq(card.seq);
      chip.addEventListener("click", () => onCardClick(card.cid));
      winnersEl.appendChild(chip);
    });
    const perPersonText = formatAmount(info.perPerson);
    if (info.winners.length > 1) {
      amountEl.textContent = perPersonText + " × " + info.winners.length;
    } else {
      // Single winner: they get perPerson + remainder (at final level) or just base
      const amt = info.perPerson + (info.absorbFinalRemainder ? info.remainder : 0);
      amountEl.textContent = formatAmount(amt);
    }
    if (info.absorbFinalRemainder && info.winners.length > 1 && info.remainder > 0) {
      // First winner gets the remainder bonus
      const note = document.createElement("div");
      note.style.fontSize = "11px";
      note.style.color = "var(--text-dim)";
      note.style.marginTop = "2px";
      note.textContent = logic.formatSeq(info.winners[0].seq) + " +" + info.remainder;
      amountEl.appendChild(note);
    }
  }

  row.appendChild(levelEl);
  row.appendChild(winnersEl);
  row.appendChild(amountEl);
  return row;
}
