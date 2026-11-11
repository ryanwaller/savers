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

  function showStatus(state, message, capture) {
    dismissToast();
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;top:16px;right:16px;z-index:2147483647;max-width:calc(100vw - 32px)";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>
      .toast{box-sizing:border-box;display:flex;align-items:center;gap:12px;max-width:min(420px,calc(100vw - 32px));padding:12px 14px;border-radius:16px;background:#222;color:#f5f5f5;box-shadow:0 12px 36px #0005;font:14px/1.35 system-ui,sans-serif}
      .message{min-width:0;flex:1}.actions{display:flex;align-items:center;gap:4px}
      button{border:0;border-radius:999px;padding:7px 10px;background:#393939;color:#fff;font:inherit;cursor:pointer}
      button:hover{background:#b9ff69;color:#202820}.close{padding:5px 8px;background:transparent;color:#bbb}
    </style><div class="toast" role="status" aria-live="polite"><span class="message"></span><div class="actions"></div><button class="close" aria-label="Close">×</button></div>`;
    shadow.querySelector(".message").textContent = message;
    shadow.querySelector(".close").addEventListener("click", dismissToast);
    if (state === "saved" && capture) {
      const actions = shadow.querySelector(".actions");
      for (const action of ["undo", "edit"]) {
        const button = document.createElement("button");
        button.textContent = action === "undo" ? "Undo" : "Edit";
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
    shadow.innerHTML = `<style>button{border:0;border-radius:999px;padding:9px 14px;background:#b9ff69;color:#202820;box-shadow:0 8px 24px #0004;font:600 13px system-ui,sans-serif;cursor:pointer}button:hover{background:#a8f45a}</style><button type="button" aria-label="Save selected text to Savers">Save text</button>`;
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
    showStatus(message.state, message.message, message.capture);
    sendResponse({ ok: true });
    return false;
  });
}
