// Admin panel DOM rendering.
//
// Takes the summaries produced by admin-logic.js and paints game cards.
// No fetching and no state of its own — main-admin.js owns both.

const LEVEL_NAMES = { 1: "Один ряд", 2: "Два ряда", 3: "Полное лото" };
const TOTAL_KEGS = 90;

const listEl = document.getElementById("game-list");
const emptyEl = document.getElementById("empty");
const countEl = document.getElementById("game-count");
const errorEl = document.getElementById("error");

export function showError(message) {
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}

export function clearError() {
  errorEl.classList.add("hidden");
}

// "8с", "3м", "2ч" — a compact idle marker rather than a clock time, so
// a card answers "is anything happening here" at a glance.
function formatIdle(ms) {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return `${sec}с`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}м`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours}ч`;
  return `${Math.round(hours / 24)}д`;
}

function formatClock(ts) {
  return new Date(ts).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderStatus(summary) {
  if (summary.finished) return el("span", "game-status is-done", "завершена");
  if (summary.live) return el("span", "game-status is-live", "идёт");
  return el("span", "game-status", `тихо ${formatIdle(summary.idleFor)}`);
}

function renderProgress(summary) {
  const wrap = el("div", "game-progress");

  const called = el("div", "game-called");
  called.append(document.createTextNode(String(summary.calledCount)));
  called.append(el("span", "of-total", `/${TOTAL_KEGS}`));
  wrap.append(called);

  const last = el("div", "game-last");
  last.append(el("span", "label", "последний"));
  if (summary.lastNumber === null) {
    last.append(el("span", "ball empty", "—"));
  } else {
    last.append(el("span", "ball", String(summary.lastNumber)));
  }
  wrap.append(last);

  return wrap;
}

function renderLevels(summary) {
  const wrap = el("div", "game-levels");
  for (const level of [1, 2, 3]) {
    const row = el("div", `level-row lvl-${level}`);
    row.append(el("span", "level-name", LEVEL_NAMES[level]));
    const winner = summary.winners[level];
    row.append(
      winner
        ? el("span", "level-winner", `карточка №${winner.seq}`)
        : el("span", "level-winner none", "—"),
    );
    wrap.append(row);
  }
  return wrap;
}

function renderCard(summary) {
  const card = el("article", "game-card");

  const head = el("div", "game-card-head");
  head.append(el("span", "game-id", summary.id));
  head.append(renderStatus(summary));
  card.append(head);

  card.append(
    el("div", "game-meta", `начата в ${formatClock(summary.createdAt)}`),
  );
  card.append(renderProgress(summary));
  card.append(renderLevels(summary));

  if (summary.pending) {
    card.append(el("div", "game-pending", "ждёт подтверждения ведущего"));
  }

  const foot = el("div", "game-foot");
  foot.append(
    el(
      "span",
      "game-jackpot",
      summary.jackpot > 0 ? `банк ${summary.jackpot}` : "без банка",
    ),
  );
  const link = el("a", "game-link", "Табло");
  link.href = `/s/${summary.id}/display`;
  link.target = "_blank";
  link.rel = "noopener";
  foot.append(link);
  card.append(foot);

  return card;
}

export function render(summaries) {
  countEl.textContent = summaries.length > 0 ? String(summaries.length) : "";
  emptyEl.classList.toggle("hidden", summaries.length > 0);

  const next = document.createDocumentFragment();
  for (const summary of summaries) next.append(renderCard(summary));
  listEl.replaceChildren(next);
}
