// Landing page bootstrap.
//
// Entry points:
//   "Новая игра"            -> POST /api/session (no body, default deck)
//   "Загрузить свою колоду" -> file picker -> validate locally ->
//                              POST /api/session with `{ cards }` body
//   "?"                     -> opens a modal with the expected JSON shape
//
// On success the page navigates to /s/<id>/?new=1 so the admin shell
// opens its new-game modal for bank/percentages/range pickup.

import { validateCards } from "./validate-cards.js";

const errEl = document.getElementById("error");

function showError(msg) {
  errEl.textContent = msg;
  errEl.classList.remove("hidden");
}

async function createSession(body) {
  const init = { method: "POST" };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = body;
  }
  const res = await fetch("/api/session", init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  const { sessionId } = await res.json();
  if (!sessionId) throw new Error("server returned no sessionId");
  // ?new=1 tells the admin shell to open the new-game modal on first
  // load so the host can pick bank, percentages, and the active card
  // range before the first number is called.
  location.assign(`/s/${sessionId}/?new=1`);
}

document.getElementById("new-default-btn").addEventListener("click", async () => {
  errEl.classList.add("hidden");
  try {
    await createSession();
  } catch (e) {
    showError(e.message || "не удалось создать сессию");
  }
});

// Accept all three shapes the host might paste in:
//   1. raw array            [{seq, cid, numbers, rows}, ...]
//   2. wrapped              { cards: [{...}, ...] }
//   3. CLI registry         { "<cid>": {seq, numbers, rows, ...}, ... }
//      (the file at ~/.russian-loto/printed.json) -- cid is the key,
//      so we lift it onto each entry.
function normalizeDeck(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return null;
  if (Array.isArray(parsed.cards)) return parsed.cards;

  const entries = Object.entries(parsed);
  const looksLikeRegistry = entries.length > 0 && entries.every(
    ([, v]) => v && typeof v === "object" && typeof v.seq === "number"
                && Array.isArray(v.numbers) && Array.isArray(v.rows),
  );
  if (looksLikeRegistry) {
    return entries.map(([cid, v]) => ({
      seq: v.seq,
      cid,
      numbers: v.numbers,
      rows: v.rows,
    }));
  }
  return null;
}

document.getElementById("custom-cards-input").addEventListener("change", async (ev) => {
  errEl.classList.add("hidden");
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("файл не похож на JSON");
    }
    const candidate = normalizeDeck(parsed);
    if (candidate === null) {
      throw new Error(
        "не удалось распознать формат: ожидается массив карточек, "
        + "{ cards: [...] } или registry из printed.json",
      );
    }
    const result = validateCards(candidate);
    if (!result.ok) throw new Error(result.error);
    await createSession(JSON.stringify({ cards: result.cards }));
  } catch (e) {
    showError(e.message || "не удалось загрузить колоду");
  } finally {
    // Reset so picking the same file again re-fires change.
    ev.target.value = "";
  }
});

// ---- Format help modal ---------------------------------------------------

const helpModal = document.getElementById("format-help-modal");
document.getElementById("format-help-btn").addEventListener("click", () => {
  helpModal.classList.add("open");
});
helpModal.addEventListener("click", (ev) => {
  if (ev.target === helpModal) helpModal.classList.remove("open");
});
document.getElementById("format-help-close").addEventListener("click", () => {
  helpModal.classList.remove("open");
});
