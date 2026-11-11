const SAVERS_PREVIEW_ORIGIN = "https://savers-rebuild-preview-production.up.railway.app";

if (location.origin === SAVERS_PREVIEW_ORIGIN) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "SAVERS_CAPTURE_BRIDGE") return false;
    const requestId = message.requestId || crypto.randomUUID();
    const onResult = (event) => {
      if (event.source !== window || event.origin !== location.origin || event.data?.type !== "SAVERS_PREVIEW_CAPTURE_RESULT" || event.data.requestId !== requestId) return;
      cleanup();
      sendResponse(event.data);
    };
    const cleanup = () => { clearTimeout(timer); window.removeEventListener("message", onResult); };
    const timer = setTimeout(() => { cleanup(); sendResponse({ ok: false, error: "Preview is loading." }); }, 5000);
    window.addEventListener("message", onResult);
    window.postMessage({ type: "SAVERS_PREVIEW_CAPTURE", action: message.action, payload: message.payload, cardId: message.cardId, requestId }, location.origin);
    return true;
  });
} else {
  let toastHost = null;
  let toastTimer = null;
  let selectionHost = null;

  function dismissToast() {
    if (toastTimer) clearTimeout(toastTimer);
    toastHost?.remove();
    toastHost = null;
  }

  let lastTheme = "light";

  function showStatus(state, message, capture, theme) {
    if (theme === "light" || theme === "dark") lastTheme = theme;
    dismissToast();
    const host = document.createElement("div");
    host.dataset.theme = lastTheme;
    host.style.cssText = "position:fixed;top:18px;right:18px;z-index:2147483647;max-width:calc(100vw - 36px)";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>
      :host{--surface:#fcfcfc;--ink:#252525;--muted:#858585;--control:#f1f1f1;--edge:#e7e7e7;--green:#b9ff69}
      :host([data-theme="dark"]){--surface:#262626;--ink:#f3f3f3;--muted:#aaa;--control:#393939;--edge:#494949}
      *{box-sizing:border-box}
      .toast{display:grid;grid-template-columns:38px minmax(0,1fr) 32px;gap:10px;align-items:start;width:min(365px,calc(100vw - 36px));padding:13px;border:1px solid var(--edge);border-radius:22px;background:var(--surface);color:var(--ink);box-shadow:0 16px 50px #0003;font:14px/1.35 Arial,system-ui,sans-serif}
      .mark{display:grid;place-items:center;width:38px;height:38px;border-radius:13px;background:#202820;color:var(--green);font-size:27px;line-height:1}
      .body{min-width:0;padding-top:1px}.title{display:block;font-size:15px;font-weight:600}.subtitle{display:block;margin-top:2px;overflow:hidden;color:var(--muted);font-size:12px;text-overflow:ellipsis;white-space:nowrap}
      .actions{display:flex;gap:7px;margin-top:11px}.actions:empty{display:none}
      button{height:34px;padding:0 13px;border:0;border-radius:999px;background:var(--control);color:var(--ink);font:inherit;cursor:pointer}
      button:hover{background:var(--green);color:#202820}.actions button:last-child{background:var(--green);color:#202820}.actions button:last-child:hover{background:#a5ed57}
      button:disabled{opacity:.55;cursor:wait}.close{display:grid;place-items:center;width:32px;height:32px;padding:0;border-radius:11px;color:var(--muted);font-size:20px}
    </style><div class="toast" role="status" aria-live="polite"><span class="mark" aria-hidden="true">✳</span><div class="body"><strong class="title"></strong><span class="subtitle"></span><div class="actions"></div></div><button class="close" aria-label="Close">×</button></div>`;
    shadow.querySelector(".title").textContent = message;
    const subtitle = shadow.querySelector(".subtitle");
    let domain = "";
    try { domain = new URL(capture?.sourceUrl || location.href).hostname.replace(/^www\./, ""); } catch { /* No page domain available. */ }
    subtitle.textContent = message === "Save undone" ? "Removed from your library" : state === "saved" ? `${domain || "Page"} · Saved to your library` : state === "saving" ? "Saving to your library" : state === "error" ? "Try again from this page" : "";
    shadow.querySelector(".close").addEventListener("click", dismissToast);
    if (state === "saved" && capture) {
      const actions = shadow.querySelector(".actions");
      for (const action of ["undo", "edit"]) {
        const button = document.createElement("button");
        button.textContent = action === "undo" ? "Undo" : "Edit card";
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            const result = await chrome.runtime.sendMessage({ type: "SAVERS_CAPTURE_ACTION", action, capture });
            if (!result?.ok) throw new Error(result?.error || "Action failed.");
            if (action === "undo") showStatus("saved", "Save undone");
            else dismissToast();
          } catch (error) { showStatus("error", error?.message || "Action failed."); }
        });
        actions.appendChild(button);
      }
    }
    document.documentElement.appendChild(host);
    toastHost = host;
    if (state !== "saving") toastTimer = setTimeout(dismissToast, state === "saved" ? 9000 : 6000);
  }

  function dismissSelection() { selectionHost?.remove(); selectionHost = null; }

  function showSelectionAction() {
    dismissSelection();
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text || text.length < 2 || !selection.rangeCount) return;
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    const host = document.createElement("div");
    const top = Math.max(8, Math.min(window.innerHeight - 48, rect.bottom + 8));
    const left = Math.max(8, Math.min(window.innerWidth - 110, rect.left));
    host.style.cssText = `position:fixed;top:${top}px;left:${left}px;z-index:2147483647`;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>button{display:flex;align-items:center;gap:7px;border:0;border-radius:999px;padding:10px 15px;background:#b9ff69;color:#202820;box-shadow:0 8px 24px #0004;font:500 13px Arial,system-ui,sans-serif;cursor:pointer}button:hover{background:#a8f45a}.mark{font-size:17px;line-height:.7}</style><button type="button" aria-label="Save selected text to Savers"><span class="mark" aria-hidden="true">✳</span> Save text</button>`;
    shadow.querySelector("button").addEventListener("click", () => {
      dismissSelection();
      void chrome.runtime.sendMessage({ type: "SAVERS_CAPTURE_SELECTION", text });
    });
    document.documentElement.appendChild(host);
    selectionHost = host;
  }

  document.addEventListener("mouseup", () => setTimeout(showSelectionAction, 0));
  document.addEventListener("keyup", (event) => { if (event.key === "Escape") dismissSelection(); else setTimeout(showSelectionAction, 0); });
  document.addEventListener("mousedown", (event) => { if (!selectionHost?.contains(event.target)) dismissSelection(); }, true);
  window.addEventListener("scroll", dismissSelection, true);
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "SAVERS_CAPTURE_STATUS") return false;
    showStatus(message.state, message.message, message.capture, message.theme);
    sendResponse({ ok: true });
    return false;
  });
}
