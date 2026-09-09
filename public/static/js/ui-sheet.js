// Bottom sheet: one card, full size, with its closed numbers marked.

import * as logic from "./logic.js";

export function renderStars(level) {
  const filled = "★".repeat(level);
  const empty = "☆".repeat(3 - level);
  return filled + empty;
}

export function openSheet(card, called, level) {
  document.getElementById("sheet-seq").textContent = logic.formatSeq(card.seq);
  document.getElementById("sheet-cid").textContent = card.cid;
  document.getElementById("sheet-stars").textContent = renderStars(level);
  const closed = card.numbers.filter((n) => called.has(n)).length;
  document.getElementById("sheet-progress").textContent = closed + "/15";

  const cardEl = document.getElementById("sheet-card");
  cardEl.innerHTML = "";
  for (let r = 0; r < 3; r++) {
    const row = card.rows[r];
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement("div");
      cell.className = "card-cell";
      const val = row[c];
      if (val === null) {
        cell.classList.add("empty");
      } else {
        cell.textContent = String(val);
        if (called.has(val)) cell.classList.add("closed");
      }
      cardEl.appendChild(cell);
    }
  }

  document.getElementById("sheet-backdrop").classList.add("open");
  document.getElementById("sheet").classList.add("open");
}

export function closeSheet() {
  document.getElementById("sheet").classList.remove("open");
  document.getElementById("sheet-backdrop").classList.remove("open");
}

export function wireBottomSheet() {
  const sheet = document.getElementById("sheet");
  const sheetBackdrop = document.getElementById("sheet-backdrop");

  sheetBackdrop.addEventListener("click", closeSheet);

  // Swipe-down to dismiss
  let touchStartY = null;
  sheet.addEventListener("touchstart", (e) => { touchStartY = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener("touchmove", (e) => {
    if (touchStartY === null) return;
    const dy = e.touches[0].clientY - touchStartY;
    if (dy > 60) { closeSheet(); touchStartY = null; }
  }, { passive: true });
  sheet.addEventListener("touchend", () => { touchStartY = null; });
}
