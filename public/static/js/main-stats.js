// Statistics page bootstrap.
//
// One fetch per period change, no polling: nobody watches an average move.
// The period list comes from stats-logic.js, the same module the Worker uses
// to turn a period into a SQL cutoff, so the two can never disagree.

import { PERIODS, DEFAULT_PERIOD, splitHotCold } from "./stats-logic.js";
import { formatElapsed, formatSeq, TOTAL_KEGS } from "./logic.js";
import { loadPrefs, applyTheme } from "./prefs.js";

const LEVEL_NAMES = { 1: "Один ряд", 2: "Два ряда", 3: "Полное лото" };
const HOT_COLD_COUNT = 5;

const periodEl = document.getElementById("period-choice");
const rangeEl = document.getElementById("stats-range");
const errorEl = document.getElementById("error");
const emptyEl = document.getElementById("empty");
const bodyEl = document.getElementById("stats-body");
const tilesEl = document.getElementById("tiles");
const heatEl = document.getElementById("number-heat");
const hotColdEl = document.getElementById("hot-cold");
const winnersEl = document.getElementById("winner-table");

let period = DEFAULT_PERIOD;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function money(value) {
  return value.toLocaleString("ru-RU");
}

function duration(ms) {
  return ms === null ? "—" : formatElapsed(ms);
}

function renderTiles(totals) {
  const tiles = [
    ["Партий сыграно", String(totals.games)],
    ["Средний банк", totals.games === 0 ? "—" : money(totals.jackpotAvg)],
    ["Банк за период", money(totals.jackpotSum)],
    ["Средняя партия", duration(totals.durationAvgMs)],
    ["Самая короткая", duration(totals.durationMinMs)],
    ["Самая длинная", duration(totals.durationMaxMs)],
    ["Чисел за партию", totals.calledAvg === null ? "—" : String(totals.calledAvg)],
  ];
  tilesEl.replaceChildren(
    ...tiles.map(([label, value]) => {
      const tile = el("div", "stat-tile");
      tile.append(el("div", "stat-tile-label", label));
      tile.append(el("div", "stat-tile-value tnum", value));
      return tile;
    }),
  );
}

// Every keg gets a cell, so a gap reads as "never came up" rather than as a
// missing row. Shade is relative to the most-drawn number of the period.
function renderHeat(numbers) {
  const byNumber = new Map(numbers.map((n) => [n.number, n.count]));
  const max = numbers.reduce((m, n) => Math.max(m, n.count), 0);
  const cells = [];
  for (let n = 1; n <= TOTAL_KEGS; n++) {
    const count = byNumber.get(n) ?? 0;
    const cell = el("div", "heat-cell");
    cell.style.setProperty("--heat", max === 0 ? 0 : count / max);
    cell.title = `${n}: ${count}`;
    cell.append(el("span", "heat-number tnum", String(n)));
    cell.append(el("span", "heat-count tnum", String(count)));
    cells.push(cell);
  }
  heatEl.replaceChildren(...cells);

  const { hot, cold } = splitHotCold(numbers, HOT_COLD_COUNT);
  const column = (title, list) => {
    const wrap = el("div", "hot-cold-col");
    wrap.append(el("div", "section-label", title));
    const row = el("div", "hot-cold-row");
    for (const item of list) {
      const chip = el("span", "hot-chip tnum", `${item.number} · ${item.count}`);
      row.append(chip);
    }
    if (list.length === 0) row.append(el("span", "stat-note", "—"));
    wrap.append(row);
    return wrap;
  };
  hotColdEl.replaceChildren(
    column("Чаще всего", hot),
    column("Реже всего", cold),
  );
}

function renderWinners(winners) {
  if (winners.length === 0) {
    winnersEl.replaceChildren(el("p", "stat-note", "Победителей пока нет."));
    return;
  }
  const rows = winners.map((w) => {
    const row = el("div", "winner-line");
    row.append(el("span", "winner-seq tnum", formatSeq(w.seq)));
    const levels = el("span", "winner-levels");
    for (const level of [1, 2, 3]) {
      const n = w.byLevel[String(level)] ?? 0;
      if (n === 0) continue;
      const tag = el("span", `winner-tag lvl-${level}`, `${LEVEL_NAMES[level]} ${n}`);
      levels.append(tag);
    }
    row.append(levels);
    row.append(el("span", "winner-total tnum", String(w.wins)));
    return row;
  });
  winnersEl.replaceChildren(...rows);
}

function paintPeriod() {
  for (const btn of periodEl.querySelectorAll("button")) {
    btn.classList.toggle("active", btn.dataset.period === period);
  }
  const label = PERIODS.find((p) => p.id === period)?.label ?? "";
  rangeEl.textContent = label.toLowerCase();
}

async function refresh() {
  paintPeriod();
  try {
    const res = await fetch(`/admin/api/stats?period=${encodeURIComponent(period)}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const stats = await res.json();

    errorEl.classList.add("hidden");
    const empty = stats.totals.games === 0;
    emptyEl.classList.toggle("hidden", !empty);
    bodyEl.classList.toggle("hidden", empty);
    if (empty) return;

    renderTiles(stats.totals);
    renderHeat(stats.numbers);
    renderWinners(stats.winners);
  } catch (e) {
    errorEl.textContent = `Не удалось загрузить статистику: ${e.message}`;
    errorEl.classList.remove("hidden");
  }
}

periodEl.addEventListener("click", (ev) => {
  const btn = ev.target.closest("button[data-period]");
  if (btn === null) return;
  period = btn.dataset.period;
  refresh();
});

applyTheme(loadPrefs().theme);
refresh();
