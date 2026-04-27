// Landing page bootstrap.
//
// Two entry points:
//   "Новая игра"            -> POST /api/session (no body, default deck)
//   "Загрузить свою колоду" -> file picker -> POST /api/session with the
//                              uploaded JSON as the body
// On success the page navigates to /s/<id>/ where the admin shell loads.

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
  location.assign(`/s/${sessionId}/`);
}

document.getElementById("new-default-btn").addEventListener("click", async () => {
  errEl.classList.add("hidden");
  try {
    await createSession();
  } catch (e) {
    showError(e.message || "не удалось создать сессию");
  }
});

document.getElementById("custom-cards-input").addEventListener("change", async (ev) => {
  errEl.classList.add("hidden");
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    // Validate locally so the user gets a friendlier error than a 400.
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("файл не похож на JSON");
    }
    const cards = Array.isArray(parsed) ? parsed : parsed && parsed.cards;
    if (!Array.isArray(cards)) {
      throw new Error("ожидается массив карточек или объект { cards: [...] }");
    }
    await createSession(JSON.stringify({ cards }));
  } catch (e) {
    showError(e.message || "не удалось загрузить колоду");
  } finally {
    // Reset the file input so picking the same file again re-fires change.
    ev.target.value = "";
  }
});
