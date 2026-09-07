// Keeps the screen on while a page is open, when the host asked for it.
//
// A wake lock is dropped by the browser whenever the page is hidden, so it
// has to be re-taken on the way back. Everything here is best-effort: the
// API is missing on some browsers and refused on others (low battery), and
// neither case is worth telling the host about mid-game.

let lock = null;
let wanted = false;

async function acquire() {
  if (!wanted || lock || !("wakeLock" in navigator)) return;
  try {
    lock = await navigator.wakeLock.request("screen");
    lock.addEventListener("release", () => { lock = null; });
  } catch (_e) {
    lock = null;
  }
}

function onVisibility() {
  if (document.visibilityState === "visible") acquire();
}

export function startWakeLock() {
  if (wanted) return;
  wanted = true;
  document.addEventListener("visibilitychange", onVisibility);
  acquire();
}

export function stopWakeLock() {
  wanted = false;
  document.removeEventListener("visibilitychange", onVisibility);
  if (lock) {
    lock.release().catch(() => {});
    lock = null;
  }
}

export function wakeLockSupported() {
  return "wakeLock" in navigator;
}
