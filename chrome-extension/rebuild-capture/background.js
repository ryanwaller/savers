const PREVIEW_ORIGIN = "https://savers-rebuild-preview-production.up.railway.app";
const MENU_PAGE = "savers-preview-page";
const MENU_LINK = "savers-preview-link";
const MENU_IMAGE = "savers-preview-image";
const MENU_QUOTE = "savers-preview-quote";

function webUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}

function capturableImageUrl(value) {
  const remote = webUrl(value);
  if (remote) return remote;
  return typeof value === "string" && value.length < 27_000_000 && /^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,/i.test(value) ? value : null;
}

async function showStatus(tabId, state, message, capture, theme) {
  if (tabId == null) return;
  try { await chrome.tabs.sendMessage(tabId, { type: "SAVERS_CAPTURE_STATUS", state, message, capture, theme }); }
  catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      await chrome.tabs.sendMessage(tabId, { type: "SAVERS_CAPTURE_STATUS", state, message, capture, theme });
    } catch { /* Restricted tabs still get toolbar badge feedback. */ }
  }
}

async function badge(state) {
  await chrome.action.setBadgeBackgroundColor({ color: state === "error" ? "#a33d3d" : "#b9ff69" });
  await chrome.action.setBadgeText({ text: state === "error" ? "!" : "✓" });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2500);
}

function isPreviewAppTab(tab) {
  try {
    const url = new URL(tab?.url);
    return url.origin === PREVIEW_ORIGIN && (url.pathname === "/" || url.pathname === "/rebuild" || url.pathname === "/rebuild/");
  } catch { return false; }
}

async function previewTab() {
  const open = await chrome.tabs.query({ url: `${PREVIEW_ORIGIN}/*` });
  const appTabs = open.filter(isPreviewAppTab);
  const existing = appTabs.sort((a, b) => Number(b.active) - Number(a.active) || Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0))[0];
  if (existing?.id != null) return existing;
  return chrome.tabs.create({ url: PREVIEW_ORIGIN, active: true });
}

async function sendToPreview(tabId, message) {
  const requestId = crypto.randomUUID();
  let injected = false;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    let result;
    try {
      result = await chrome.tabs.sendMessage(tabId, { type: "SAVERS_CAPTURE_BRIDGE", requestId, ...message });
    } catch (error) {
      if (!injected && /receiving end does not exist|could not establish connection/i.test(String(error?.message || error))) {
        try { await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }); } catch { /* The preview may still be loading. */ }
        injected = true;
      }
    }
    if (result?.ok) return result;
    if (result?.error && result.error !== "Preview is loading.") throw new Error(result.error);
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error("Open the Savers preview tab, then try again.");
}

async function capture(payload, sourceTabId) {
  if (!webUrl(payload.sourceUrl || payload.url)) {
    await showStatus(sourceTabId, "error", "Open a web page to save it.");
    return;
  }
  await showStatus(sourceTabId, "saving", `Saving ${payload.kind === "note" ? "text" : payload.kind}…`);
  try {
    const tab = await previewTab();
    const result = await sendToPreview(tab.id, { action: "save", payload });
    const label = payload.kind === "note" ? "Text saved" : payload.kind === "image" ? "Image saved" : "Link saved";
    await showStatus(sourceTabId, "saved", label, { cardId: result.cardId, previewTabId: tab.id, sourceUrl: payload.sourceUrl }, result.theme);
    await badge("saved");
  } catch (error) {
    await showStatus(sourceTabId, "error", error?.message || "Could not save to Savers.");
    await badge("error");
  }
}

function payloadForMenu(info, tab) {
  const sourceUrl = webUrl(info.pageUrl || tab?.url);
  if (!sourceUrl) return null;
  if (info.menuItemId === MENU_IMAGE) {
    const imageUrl = capturableImageUrl(info.srcUrl);
    if (!imageUrl) return null;
    const filename = imageUrl.startsWith("data:") ? "Saved image" : new URL(imageUrl).pathname.split("/").pop() || "Saved image";
    let title = filename;
    try { title = decodeURIComponent(filename); } catch { /* Keep malformed filenames as-is. */ }
    return { kind: "image", sourceUrl, imageUrl, title };
  }
  if (info.menuItemId === MENU_QUOTE) {
    const text = String(info.selectionText || "").trim();
    return text ? { kind: "note", sourceUrl, text, title: tab?.title || "Saved text" } : null;
  }
  if (info.menuItemId === MENU_LINK) {
    const url = webUrl(info.linkUrl);
    return url ? { kind: "link", url, sourceUrl, title: new URL(url).hostname } : null;
  }
  return { kind: "link", url: sourceUrl, sourceUrl, title: tab?.title || new URL(sourceUrl).hostname };
}

function installMenus() {
  chrome.contextMenus.removeAll(() => {
    const patterns = ["http://*/*", "https://*/*"];
    chrome.contextMenus.create({ id: MENU_PAGE, title: "Save page to Savers", contexts: ["page"], documentUrlPatterns: patterns });
    chrome.contextMenus.create({ id: MENU_LINK, title: "Save link to Savers", contexts: ["link"], documentUrlPatterns: patterns });
    chrome.contextMenus.create({ id: MENU_IMAGE, title: "Save image to Savers", contexts: ["image"], documentUrlPatterns: patterns });
    chrome.contextMenus.create({ id: MENU_QUOTE, title: "Save selection to Savers", contexts: ["selection"], documentUrlPatterns: patterns });
  });
}

chrome.runtime.onInstalled.addListener(installMenus);
chrome.runtime.onStartup.addListener(installMenus);
chrome.action.onClicked.addListener((tab) => {
  const payload = payloadForMenu({ menuItemId: MENU_PAGE, pageUrl: tab.url }, tab);
  if (payload) void capture(payload, tab.id);
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const payload = payloadForMenu(info, tab);
  if (payload) void capture(payload, tab?.id);
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "SAVERS_CAPTURE_SELECTION") {
    const sourceUrl = webUrl(sender.tab?.url);
    if (sourceUrl && String(message.text || "").trim()) void capture({ kind: "note", sourceUrl, text: String(message.text).trim(), title: sender.tab?.title || "Saved text" }, sender.tab.id);
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type === "SAVERS_CAPTURE_ACTION") {
    void (async () => {
      try {
        const { cardId, previewTabId } = message.capture || {};
        if (!cardId) throw new Error("Capture is no longer available.");
        let tab;
        try {
          tab = await chrome.tabs.get(previewTabId);
          if (!isPreviewAppTab(tab)) tab = null;
        } catch { tab = null; }
        if (!tab) tab = await previewTab();
        if (message.action === "edit") {
          tab = await chrome.tabs.update(tab.id, { active: true });
          if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
        }
        const result = await sendToPreview(tab.id, { action: message.action, cardId });
        sendResponse(result);
      } catch (error) { sendResponse({ ok: false, error: error?.message || "Action failed." }); }
    })();
    return true;
  }
  return false;
});
