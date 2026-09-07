// Registers the service worker that makes the app installable.
//
// Registration is best-effort: an unsupported browser, a private window or
// an insecure origin all just mean no install prompt, never a broken page.
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
