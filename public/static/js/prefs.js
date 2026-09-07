// Per-device preferences.
//
// These are not game state: they never travel to the Durable Object and are
// not shared between the host's phone and the board on the wall. They live in
// this browser only, under one key, so a corrupt or partial blob can always
// be normalised back to something the app can render.
//
//   theme      "system" | "light" | "dark"
//              "system" follows prefers-color-scheme everywhere except the
//              display, which stays dark: a white projector wall is unusable.
//   keepAwake  hold a screen wake lock while a page is open
//   easterEggs default for the new-game form's meme toasts. The form writes
//              its own choice back here, so the two never drift.

export const PREFS_KEY = "loto-prefs";

// The display used to own a private dark/light flag before preferences
// existed. Read once, then folded into `theme`.
export const LEGACY_DISPLAY_THEME_KEY = "loto-display-theme";

export const THEMES = ["system", "light", "dark"];

export const DEFAULT_PREFS = Object.freeze({
  theme: "system",
  keepAwake: false,
  easterEggs: true,
});

function bool(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizePrefs(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_PREFS };
  }
  return {
    theme: THEMES.includes(raw.theme) ? raw.theme : DEFAULT_PREFS.theme,
    keepAwake: bool(raw.keepAwake, DEFAULT_PREFS.keepAwake),
    easterEggs: bool(raw.easterEggs, DEFAULT_PREFS.easterEggs),
  };
}

// Only an untouched theme is migrated: once someone picks a theme in the
// settings screen, the old display flag has nothing left to say.
export function migrateDisplayTheme(prefs, legacyValue) {
  if (prefs.theme !== "system" || legacyValue !== "light") return prefs;
  return { ...prefs, theme: "light" };
}

export function readPrefs(storage) {
  let parsed = null;
  try {
    parsed = JSON.parse(storage.getItem(PREFS_KEY));
  } catch (_e) {
    parsed = null;
  }
  let prefs = normalizePrefs(parsed);
  try {
    prefs = migrateDisplayTheme(prefs, storage.getItem(LEGACY_DISPLAY_THEME_KEY));
  } catch (_e) {
    // Storage can throw outright in a locked-down browser; defaults are fine.
  }
  return prefs;
}

export function writePrefs(storage, prefs) {
  try {
    storage.setItem(PREFS_KEY, JSON.stringify(normalizePrefs(prefs)));
  } catch (_e) {
    // Private mode: the choice applies to this page and is simply not kept.
  }
}

// The document element carries the choice so CSS can answer it without JS.
// "system" removes the attribute and lets prefers-color-scheme decide.
export function applyTheme(theme, root = document.documentElement) {
  if (theme === "light" || theme === "dark") root.dataset.theme = theme;
  else delete root.dataset.theme;
}

export function loadPrefs() {
  return readPrefs(localStorage);
}

export function savePrefs(prefs) {
  writePrefs(localStorage, prefs);
}

export function updatePrefs(patch) {
  const next = normalizePrefs({ ...loadPrefs(), ...patch });
  savePrefs(next);
  return next;
}
