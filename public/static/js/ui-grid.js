// The 9x11 number board: layout, cells and their called state.

// Loto column ranges: col 0 = 1..9 (9 numbers), cols 1..7 = 10..79 (10 each),
// col 8 = 80..90 (11 numbers). We use a 9x11 grid; short columns have placeholders
// in the bottom rows. Every number stays in its semantically correct column.
export const GRID_ROWS = 11;
export const GRID_COLS = 9;

export function numberAt(col, row) {
  if (col === 0) return row < 9 ? row + 1 : null;    // 1..9, then 2 placeholders
  if (col === 8) return 80 + row;                     // 80..90, all 11 rows used
  return row < 10 ? col * 10 + row : null;            // 10..19, ..., 70..79, placeholder
}

// The /display board is read-only, so it builds the same cells with no
// handler; only the host passes onCellClick.
export function buildGrid(onCellClick) {
  const gridEl = document.getElementById("number-grid");
  gridEl.innerHTML = "";
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      const value = numberAt(c, r);
      if (value === null) {
        cell.classList.add("placeholder");
      } else {
        cell.textContent = String(value);
        cell.dataset.num = String(value);
        if (onCellClick) cell.addEventListener("click", () => onCellClick(value));
      }
      gridEl.appendChild(cell);
    }
  }
}

export function renderCells(called) {
  const gridEl = document.getElementById("number-grid");
  for (const cell of gridEl.querySelectorAll(".cell[data-num]")) {
    const n = Number(cell.dataset.num);
    cell.classList.toggle("called", called.has(n));
  }
}
