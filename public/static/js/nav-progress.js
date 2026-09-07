// Loading overlay for switching between the game, the display and the
// settings screens.
//
// The three screens are separate documents, so every tab tap is a full page
// load: the old screen sits there unchanged until the new one paints, and on
// a phone over a hall's wifi that reads as a dead tap. The overlay dims the
// leaving screen and spins, so the tap has an answer immediately.
//
// It appears only after SHOW_DELAY_MS. A load that finishes sooner would
// otherwise flash a spinner nobody had time to read.

const SHOW_DELAY_MS = 120;

// The Lucide loader-circle, at the app's weight. Reference copy lives in
// static/img/icons/lucide/loader-circle.svg -- change both or they drift.
const SPINNER_SVG = `
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" stroke-width="1.75" stroke-linecap="round"
       stroke-linejoin="round" aria-hidden="true">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>`;

/**
 * Whether a click is a screen switch this document should cover.
 *
 * True only for clicks that actually unload this document: a primary,
 * unmodified click on a same-origin link that lands on another page.
 */
export function shouldShowNavProgress(click) {
  if (click.defaultPrevented) return false;
  if (click.button !== 0) return false;
  if (click.modifier) return false;
  if (click.download) return false;
  if (click.target && click.target !== "_self") return false;

  let url;
  let current;
  try {
    url = new URL(click.href);
    current = new URL(click.currentHref);
  } catch {
    return false;
  }

  if (url.origin !== current.origin) return false;
  // Same page, hash or not: a jump within this document, or nothing at all.
  if (url.pathname === current.pathname && url.search === current.search) {
    return false;
  }
  return true;
}

function createOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "nav-progress";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = SPINNER_SVG;
  document.body.append(overlay);
  return overlay;
}

export function installNavProgress() {
  let overlay = null;
  let timer = 0;

  function hide() {
    clearTimeout(timer);
    timer = 0;
    if (overlay) overlay.classList.remove("is-visible");
  }

  function show() {
    if (!overlay) overlay = createOverlay();
    // Force a reflow so the class change animates on the first switch too.
    void overlay.offsetWidth;
    overlay.classList.add("is-visible");
  }

  document.addEventListener("click", (ev) => {
    const anchor = ev.target.closest?.("a[href]");
    if (!anchor) return;
    const wanted = shouldShowNavProgress({
      href: anchor.href,
      currentHref: location.href,
      target: anchor.target,
      download: anchor.hasAttribute("download"),
      button: ev.button,
      modifier: ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey,
      defaultPrevented: ev.defaultPrevented,
    });
    if (!wanted) return;
    clearTimeout(timer);
    timer = setTimeout(show, SHOW_DELAY_MS);
  });

  // Going back restores this document from the bfcache exactly as it was
  // left -- overlay included. Clear it, or the screen comes back frozen.
  window.addEventListener("pageshow", hide);
}
