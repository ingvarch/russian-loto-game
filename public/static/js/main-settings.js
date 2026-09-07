// Settings page entry point.
//
// Everything here is per-device: the page never talks to the session's
// Durable Object. It reads and writes the preferences blob, applies the
// theme immediately so the choice is visible while making it, and raises
// the same share sheet the board and the display use.

import { loadPrefs, updatePrefs, applyTheme } from "./prefs.js";
import { startWakeLock, stopWakeLock, wakeLockSupported } from "./wake-lock.js";
import { openShareModal } from "./share-modal.js";
import { registerServiceWorker } from "./pwa.js";

const themeChoice = document.getElementById("theme-choice");
const keepAwakeEl = document.getElementById("pref-keep-awake");
const eggsEl = document.getElementById("pref-eggs");

let prefs = loadPrefs();

function paintTheme() {
  for (const btn of themeChoice.querySelectorAll("button")) {
    btn.classList.toggle("active", btn.dataset.themeValue === prefs.theme);
  }
}

applyTheme(prefs.theme);
paintTheme();
keepAwakeEl.checked = prefs.keepAwake;
eggsEl.checked = prefs.easterEggs;

if (!wakeLockSupported()) {
  document.getElementById("wake-lock-unsupported").classList.remove("hidden");
}

themeChoice.addEventListener("click", (ev) => {
  const btn = ev.target.closest("button[data-theme-value]");
  if (!btn) return;
  prefs = updatePrefs({ theme: btn.dataset.themeValue });
  applyTheme(prefs.theme);
  paintTheme();
});

keepAwakeEl.addEventListener("change", () => {
  prefs = updatePrefs({ keepAwake: keepAwakeEl.checked });
  if (prefs.keepAwake) startWakeLock();
  else stopWakeLock();
});

eggsEl.addEventListener("change", () => {
  prefs = updatePrefs({ easterEggs: eggsEl.checked });
});

document.getElementById("open-share").addEventListener("click", openShareModal);

if (prefs.keepAwake) startWakeLock();

registerServiceWorker();
