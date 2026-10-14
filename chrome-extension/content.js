/**
 * Content script — runs in an isolated world on every page.
 * Extracts metadata from the DOM for the background service worker.
 */

function extractMetadata() {
  const getMeta = (name) => {
    const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
    return el?.content?.trim() || "";
  };

  const canonical =
    document.querySelector('link[rel="canonical"]')?.href?.trim() || location.href;

  return {
    url: location.href,
    title: document.title || "",
    description:
      getMeta("description") || getMeta("og:description") || "",
    ogImage: getMeta("og:image") || "",
    canonical,
    domain: location.hostname,
    favicon: findFavicon(),
  };
}

function findFavicon() {
  const link = document.querySelector(
    'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
  );
  if (link?.href) {
    try {
      return new URL(link.href, location.origin).href;
    } catch {
      return link.href;
    }
  }
  // Fallback to /favicon.ico
  try {
    return new URL("/favicon.ico", location.origin).href;
  } catch {
    return "";
  }
}

let saveToast = null;
let saveToastTimer = null;

function showSaveToast(state, message) {
  if (saveToastTimer) clearTimeout(saveToastTimer);
  if (!saveToast) {
    const host = document.createElement("div");
    host.id = "savers-extension-toast";
    host.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:calc(100vw - 24px);pointer-events:none";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        .toast { box-sizing:border-box;display:flex;align-items:center;gap:8px;max-width:360px;padding:9px 12px;border-radius:9px;background:#111;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.24);font:13px/1.35 system-ui,sans-serif;pointer-events:auto }
        .message { min-width:0;flex:1 }
        button { border:0;padding:0 2px;background:transparent;color:#fff;font:18px/1 system-ui,sans-serif;cursor:pointer }
      </style>
      <div class="toast" role="status" aria-live="polite"><span class="message"></span><button type="button" title="Close" aria-label="Close">×</button></div>
    `;
    shadow.querySelector("button").addEventListener("click", () => {
      host.remove();
      saveToast = null;
    });
    document.documentElement.appendChild(host);
    saveToast = host;
  }
  saveToast.shadowRoot.querySelector(".message").textContent = message;
  if (state === "saved" || state === "queued") {
    saveToastTimer = setTimeout(() => {
      saveToast?.remove();
      saveToast = null;
    }, state === "saved" ? 1400 : 3500);
  }
}

// Listen for metadata requests from the background worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "EXTRACT_METADATA") {
    sendResponse(extractMetadata());
  }
  if (message.type === "SHOW_SAVE_STATUS") {
    showSaveToast(message.state, message.message);
    sendResponse({ ok: true });
  }
  // Return false — we sent the response synchronously
  return false;
});
