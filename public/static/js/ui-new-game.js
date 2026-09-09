// New-game modal: bank, level percentages, musical pause, card range.

import * as logic from "./logic.js";

export function open(state, cards) {
  // Pre-fill form with current settings (or defaults if none).
  document.getElementById("ng-jackpot").value = state.jackpot || 0;
  document.getElementById("ng-pct1").value = (state.percentages && state.percentages[0]) || 10;
  document.getElementById("ng-pct2").value = (state.percentages && state.percentages[1]) || 25;
  document.getElementById("ng-pct3").value = (state.percentages && state.percentages[2]) || 65;
  document.getElementById("ng-split").checked = state.split === true;
  // The pause is on by default; an empty number would fail validation, so a
  // keg is drawn for it whenever the host has not already picked one.
  document.getElementById("ng-music").checked = true;
  document.getElementById("ng-music-num").value =
      state.musicPause ? state.musicPause.number : logic.pickMusicNumber();
  syncMusicRowVisibility();
  document.getElementById("ng-eggs").checked = state.easterEggs !== false;
  document.getElementById("ng-error").textContent = "";
  const cardsInput = document.getElementById("ng-cards");
  if (state.cardRange) {
      cardsInput.value = state.cardRange[0] + "-" + state.cardRange[1];
  } else {
      cardsInput.value = "";
  }
  const allSeqs = cards.map((c) => c.seq);
  const minSeq = Math.min(...allSeqs);
  const maxSeq = Math.max(...allSeqs);
  document.getElementById("ng-cards-hint").textContent =
      "Загружено: " + logic.formatSeq(minSeq) +
      "–" + logic.formatSeq(maxSeq) +
      ", всего " + cards.length;
  syncPresetActive();
  updateNewGamePreview();
  document.getElementById("new-game-modal").classList.add("open");
}

function closeNewGameModal() {
  document.getElementById("new-game-modal").classList.remove("open");
}

function readNewGameForm() {
  const jackpot = parseInt(document.getElementById("ng-jackpot").value, 10) || 0;
  const pct1 = parseInt(document.getElementById("ng-pct1").value, 10);
  const pct2 = parseInt(document.getElementById("ng-pct2").value, 10);
  const pct3 = parseInt(document.getElementById("ng-pct3").value, 10);
  const split = document.getElementById("ng-split").checked;
  const musicOn = document.getElementById("ng-music").checked;
  const musicNum = parseInt(document.getElementById("ng-music-num").value, 10);
  const cardsRaw = document.getElementById("ng-cards").value.trim();
  return {
    jackpot,
    percentages: [pct1, pct2, pct3],
    split,
    musicPause: musicOn ? { number: musicNum, done: false } : null,
    easterEggs: document.getElementById("ng-eggs").checked,
    cardRange: cardsRaw || null,
  };
}

function syncMusicRowVisibility() {
  const on = document.getElementById("ng-music").checked;
  document.getElementById("ng-music-num-row").classList.toggle("hidden", !on);
}

// Rejects the form with the message the host sees, or accepts it with the
// card range normalised from "1-25" / "7" to a pair of seq numbers.
export function validateForm(form, cards) {
  if (form.jackpot < 0 || isNaN(form.jackpot)) {
    return { error: "Банк должен быть 0 или больше." };
  }
  const pcts = form.percentages;
  if (pcts.some((p) => isNaN(p) || p < 0 || p > 100)) {
    return { error: "Проценты должны быть от 0 до 100." };
  }
  const sum = pcts[0] + pcts[1] + pcts[2];
  if (sum !== 100) {
    return { error: "Сумма процентов должна быть ровно 100 (сейчас " + sum + ")." };
  }
  if (form.musicPause) {
    const n = form.musicPause.number;
    if (isNaN(n) || n < 1 || n > 90) {
      return { error: "Число музыкальной паузы — от 1 до 90." };
    }
  }
  if (form.cardRange) {
      const raw = form.cardRange;
      const rangeMatch = raw.match(/^(\d+)\s*-\s*(\d+)$/);
      const singleMatch = raw.match(/^(\d+)$/);
      if (rangeMatch) {
          const lo = parseInt(rangeMatch[1], 10);
          const hi = parseInt(rangeMatch[2], 10);
          if (lo < 1 || hi < 1 || lo > hi) {
              return { error: "Неверный диапазон карт." };
          }
          form.cardRange = [lo, hi];
      } else if (singleMatch) {
          const n = parseInt(singleMatch[1], 10);
          if (n < 1) {
              return { error: "Номер карты должен быть >= 1." };
          }
          form.cardRange = [n, n];
      } else {
          return { error: "Формат диапазона: 1-25 или одно число." };
      }
      const [lo, hi] = form.cardRange;
      const count = cards.filter((c) => c.seq >= lo && c.seq <= hi).length;
      if (count === 0) {
          return { error: "Ни одной загруженной карты в этом диапазоне." };
      }
  }
  return { form };
}

function validateNewGameForm(cards) {
  const err = document.getElementById("ng-error");
  const result = validateForm(readNewGameForm(), cards);
  if (result.error) {
    err.textContent = result.error;
    return null;
  }
  err.textContent = "";
  return result.form;
}

function updateNewGamePreview() {
  const form = readNewGameForm();
  const preview = document.getElementById("ng-preview");
  if (form.jackpot > 0 && form.percentages.every((p) => !isNaN(p))) {
    const sum = form.percentages[0] + form.percentages[1] + form.percentages[2];
    if (sum === 100) {
      const b1 = Math.floor((form.jackpot * form.percentages[0]) / 100);
      const b2 = Math.floor((form.jackpot * form.percentages[1]) / 100);
      const b3 = form.jackpot - b1 - b2;
      document.getElementById("ng-preview-1").textContent = b1.toLocaleString("ru-RU");
      document.getElementById("ng-preview-2").textContent = b2.toLocaleString("ru-RU");
      document.getElementById("ng-preview-3").textContent = b3.toLocaleString("ru-RU");
      preview.classList.remove("hidden");
      return;
    }
  }
  preview.classList.add("hidden");
}

function applyPreset(btn, cards) {
  const pctStr = btn.dataset.pct;
  if (pctStr) {
    const pcts = pctStr.split(",").map((s) => parseInt(s, 10));
    document.getElementById("ng-pct1").value = pcts[0];
    document.getElementById("ng-pct2").value = pcts[1];
    document.getElementById("ng-pct3").value = pcts[2];
  }
  syncPresetActive();
  updateNewGamePreview();
  validateNewGameForm(cards);
}

function syncPresetActive() {
  const p1 = parseInt(document.getElementById("ng-pct1").value, 10);
  const p2 = parseInt(document.getElementById("ng-pct2").value, 10);
  const p3 = parseInt(document.getElementById("ng-pct3").value, 10);
  const currentPct = [p1, p2, p3].join(",");
  // No preset matching the typed percentages simply leaves none highlighted.
  document.querySelectorAll("#ng-presets button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.pct === currentPct);
  });
}

export function wireNewGameModal({ cards, getState, onStart }) {
  ["ng-jackpot", "ng-pct1", "ng-pct2", "ng-pct3"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
      syncPresetActive();
      updateNewGamePreview();
      validateNewGameForm(cards);
    });
  });
  document.querySelectorAll("#ng-presets button").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      applyPreset(btn, cards);
    });
  });
  document.getElementById("ng-music").addEventListener("change", () => {
    syncMusicRowVisibility();
    validateNewGameForm(cards);
  });
  document.getElementById("ng-music-num").addEventListener("input", () => validateNewGameForm(cards));

  const newGameModalEl = document.getElementById("new-game-modal");
  newGameModalEl.querySelector('[data-action="cancel"]').addEventListener("click", closeNewGameModal);
  newGameModalEl.querySelector('[data-action="confirm"]').addEventListener("click", () => {
    const form = validateNewGameForm(cards);
    if (form === null) return;
    onStart(form);
    closeNewGameModal();
  });
  newGameModalEl.addEventListener("click", (ev) => {
    if (ev.target === newGameModalEl) closeNewGameModal();
  });

  document.getElementById("new-game-btn").addEventListener("click", () => open(getState(), cards));
}
