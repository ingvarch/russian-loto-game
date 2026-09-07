// Share sheet: QR code plus a copyable link to this session's display.
//
// The host board raises it from the header, the display raises it from its
// own corner button, so the markup is built here instead of being duplicated
// into two HTML shells. Both URLs are relative to the current page and
// resolve identically from /s/<id>/ and from /s/<id>/display, so neither
// caller has to pass anything in.

const MARKUP = `
  <div class="modal modal-wide">
    <p class="modal-title">Открыть табло</p>
    <p class="modal-text">
      Отсканируй QR-код камерой телефона или открой ссылку напрямую.
      Можно открыть на любом устройстве — таблица read-only, никаких
      паролей.
    </p>
    <div class="qr-wrap">
      <img id="qr-img" alt="QR-код ссылки на табло">
    </div>
    <div class="qr-url-row">
      <code class="qr-url" id="qr-url"></code>
      <button type="button" class="btn-confirm" id="qr-copy-btn">Копировать</button>
    </div>
    <div class="modal-actions">
      <a href="display" target="_blank" rel="noopener" class="display-open-link" id="display-open-link">Открыть на этом устройстве</a>
      <button type="button" class="btn-cancel" data-action="cancel">Закрыть</button>
    </div>
  </div>
`;

let modal = null;
let qrImg = null;

function onDisplayPage() {
  return location.pathname.replace(/\/$/, "").endsWith("/display");
}

function copyLink(url, urlEl, btn) {
  navigator.clipboard.writeText(url).then(
    () => {
      const prev = btn.textContent;
      btn.textContent = "Скопировано";
      setTimeout(() => { btn.textContent = prev; }, 1200);
    },
    () => {
      // Clipboard may be denied; fall back to selecting the text.
      const range = document.createRange();
      range.selectNodeContents(urlEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    },
  );
}

function build() {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.id = "share-display-modal";
  backdrop.innerHTML = MARKUP;
  document.body.append(backdrop);

  const url = new URL("display", location.href).toString();
  const urlEl = backdrop.querySelector("#qr-url");
  urlEl.textContent = url;
  qrImg = backdrop.querySelector("#qr-img");

  // Already looking at the board — offering to open it here says nothing.
  if (onDisplayPage()) backdrop.querySelector("#display-open-link").remove();

  const close = () => backdrop.classList.remove("open");
  backdrop.querySelector('[data-action="cancel"]').addEventListener("click", close);
  backdrop.addEventListener("click", (ev) => {
    if (ev.target === backdrop) close();
  });

  const copyBtn = backdrop.querySelector("#qr-copy-btn");
  copyBtn.addEventListener("click", () => copyLink(url, urlEl, copyBtn));

  return backdrop;
}

export function openShareModal() {
  if (!modal) modal = build();
  // Lazy-load the QR: only fetched when someone actually opens the sheet,
  // so pages that never share don't pay for the render.
  if (!qrImg.getAttribute("src")) qrImg.src = "qr.svg";
  modal.classList.add("open");
}
