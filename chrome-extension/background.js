const DEFAULT_APP_URL = "https://savers-production.up.railway.app";
const LEGACY_LOCALHOST_URL = "http://localhost:3000";
const SAVE_PAGE_MENU_ID = "save-page-to-savers";
const ALARM_RETRY = "retry-queue";
const MAX_QUEUE_SIZE = 50;
const QUEUE_STORAGE_KEY = "saversOfflineQueue";

/* ── App URL ── */

async function getStoredAppUrl() {
  const stored = await chrome.storage.sync.get(["saversAppUrl"]);
  return normalizeAppUrl(stored.saversAppUrl || DEFAULT_APP_URL);
}

function normalizeAppUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  return raw || DEFAULT_APP_URL;
}

async function migrateAppUrl() {
  const stored = await chrome.storage.sync.get(["saversAppUrl"]);
  if (stored.saversAppUrl === LEGACY_LOCALHOST_URL) {
    await chrome.storage.sync.set({ saversAppUrl: DEFAULT_APP_URL });
  }
}

/* ── Badge ── */

async function syncBadge() {
  const queue = await loadQueue();
  if (queue.length > 0) {
    await chrome.action.setBadgeBackgroundColor({ color: "#b8860b" });
    await chrome.action.setBadgeText({ text: String(queue.length) });
    await chrome.action.setTitle({ title: `Savers: ${queue.length} unsaved` });
  } else {
    await chrome.action.setBadgeText({ text: "" });
    await chrome.action.setTitle({ title: "Save to Savers" });
  }
}

function badgeSaving(title) {
  return Promise.all([
    chrome.action.setBadgeBackgroundColor({ color: "#4a4a4a" }),
    chrome.action.setBadgeText({ text: "…" }),
    chrome.action.setTitle({ title: title || "Saving…" }),
  ]);
}

function badgeFlashOk() {
  chrome.action.setBadgeBackgroundColor({ color: "#1f6f43" });
  chrome.action.setBadgeText({ text: "OK" });
  chrome.action.setTitle({ title: "Saved to Savers" });
  // Clear after 2s — syncBadge will restore queue count if any remain
  setTimeout(syncBadge, 2000);
}

function badgeFlashErr() {
  chrome.action.setBadgeBackgroundColor({ color: "#8b1e1e" });
  chrome.action.setBadgeText({ text: "!" });
  chrome.action.setTitle({ title: "Save failed" });
  setTimeout(syncBadge, 2000);
}

/* ── Offline Queue ── */

async function loadQueue() {
  const stored = await chrome.storage.local.get([QUEUE_STORAGE_KEY]);
  return Array.isArray(stored[QUEUE_STORAGE_KEY]) ? stored[QUEUE_STORAGE_KEY] : [];
}

async function saveQueue(queue) {
  await chrome.storage.local.set({ [QUEUE_STORAGE_KEY]: queue });
}

async function enqueueFailed(payload) {
  const queue = await loadQueue();
  if (queue.length >= MAX_QUEUE_SIZE) {
    // Drop oldest to stay under the limit
    queue.shift();
  }
  queue.push({ payload, timestamp: Date.now() });
  await saveQueue(queue);
  await syncBadge();
}

async function processRetryQueue() {
  const queue = await loadQueue();
  if (queue.length === 0) return;

  const appUrl = await getStoredAppUrl();

  // Process one at a time — if successful, remove from queue
  const remaining = [];
  for (const entry of queue) {
    try {
      await apiFetch(appUrl, "/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry.payload),
      });
      // Success — this one is saved, don't re-add
    } catch {
      remaining.push(entry);
    }
  }

  await saveQueue(remaining);
  await syncBadge();
}

/* ── Message from popup to retry queue ── */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "ENQUEUE") {
    enqueueFailed(message.payload).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "RETRY_QUEUE") {
    processRetryQueue().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "GET_QUEUE_COUNT") {
    loadQueue().then((q) => sendResponse({ count: q.length }));
    return true;
  }
  if (message.type === "SAVE_PAYLOAD") {
    savePayloadFromPopup(message.payload).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

/* ── Content Script Metadata ── */

async function extractMetadataFromTab(tab) {
  // Try the content script first (fast, client-side, works offline)
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_METADATA" });
    if (response && response.url) return response;
  } catch {
    // Content script may not be injected (e.g. chrome:// pages, store pages)
  }

  // Fallback: best-effort from tab properties
  return {
    url: tab.url || "",
    title: tab.title || "",
    description: "",
    ogImage: "",
    canonical: tab.url || "",
    domain: tab.url ? new URL(tab.url).hostname : "",
    favicon: tab.favIconUrl || "",
  };
}

async function fetchServerMetadata(appUrl, url) {
  try {
    const fetched = await apiFetch(
      appUrl,
      `/api/metadata?url=${encodeURIComponent(url)}`,
      { method: "GET" }
    );
    return {
      title: fetched?.title || "",
      description: fetched?.description || null,
      ogImage: fetched?.og_image || null,
      favicon: fetched?.favicon || null,
    };
  } catch {
    return { title: "", description: null, ogImage: null, favicon: null };
  }
}

/* ── Save Flow ── */

async function savePayloadFromPopup(payload) {
  await badgeSaving("Saving bookmark…");

  try {
    const appUrl = await getStoredAppUrl();

    // Check for duplicate first
    try {
      const check = await apiFetch(
        appUrl,
        `/api/bookmarks/check?url=${encodeURIComponent(payload.url)}`,
        { method: "GET" }
      );
      if (check?.exists) {
        await chrome.action.setBadgeBackgroundColor({ color: "#4a4a4a" });
        await chrome.action.setBadgeText({ text: "" });
        await chrome.action.setTitle({
          title: check.bookmark
            ? `Already saved as "${check.bookmark.title || payload.url}"`
            : "Already saved",
        });
        setTimeout(syncBadge, 3000);
        return;
      }
    } catch {
      // Check failed — continue to save anyway
    }

    await apiFetch(appUrl, "/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    await badgeFlashOk();
  } catch (error) {
    console.error("Save bookmark from popup failed:", error);
    if (
      error instanceof TypeError ||
      error?.message?.includes("fetch") ||
      error?.message?.includes("Network")
    ) {
      await enqueueFailed(payload);
    }
    await badgeFlashErr();
  }
}

async function savePageFromTab(tab) {
  const url = tab?.url;
  if (!url || !/^https?:/i.test(url)) {
    await badgeFlashErr();
    return;
  }

  await badgeSaving("Saving page…");

  try {
    const appUrl = await getStoredAppUrl();

    // Check for duplicate first
    const appUrlBase = appUrl;
    try {
      const check = await apiFetch(
        appUrlBase,
        `/api/bookmarks/check?url=${encodeURIComponent(url)}`,
        { method: "GET" }
      );
      if (check?.exists) {
        await chrome.action.setBadgeBackgroundColor({ color: "#4a4a4a" });
        await chrome.action.setBadgeText({ text: "" });
        await chrome.action.setTitle({
          title: check.bookmark
            ? `Already saved as "${check.bookmark.title || url}"`
            : "Already saved",
        });
        setTimeout(syncBadge, 3000);
        return;
      }
    } catch {
      // Check failed — continue to save anyway
    }

    // Extract metadata from content script
    const meta = await extractMetadataFromTab(tab);

    // Enrich with server-side metadata
    const serverMeta = await fetchServerMetadata(appUrl, url);

    const payload = {
      url,
      title: serverMeta.title || meta.title || tab?.title || url,
      description: serverMeta.description || meta.description || null,
      og_image: serverMeta.ogImage || meta.ogImage || null,
      favicon: serverMeta.favicon || meta.favicon || null,
      tags: [],
      notes: null,
      collection_id: null,
      source: "extension",
    };

    await apiFetch(appUrl, "/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    await badgeFlashOk();
  } catch (error) {
    console.error("Save page to Savers failed:", error);
    // Queue for retry if it looks like a network error
    if (
      error instanceof TypeError ||
      error?.message?.includes("fetch") ||
      error?.message?.includes("Network")
    ) {
      try {
        const meta = await extractMetadataFromTab(tab);
        await enqueueFailed({
          url,
          title: meta.title || tab?.title || url,
          description: meta.description || null,
          og_image: meta.ogImage || null,
          favicon: meta.favicon || null,
          tags: [],
          notes: null,
          collection_id: null,
          source: "extension",
        });
      } catch {
        // Can't even extract metadata — nothing to queue
      }
    }
    await badgeFlashErr();
  }
}

async function showPageStatus(tabId, state, message) {
  if (!tabId) return;
  const payload = { type: "SHOW_SAVE_STATUS", state, message };
  try {
    await chrome.tabs.sendMessage(tabId, payload);
  } catch {
    // Tabs open before this extension was installed may lack the content script.
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      await chrome.tabs.sendMessage(tabId, payload);
    } catch {
      // Restricted pages still get the toolbar badge feedback.
    }
  }
}

async function quickSavePageFromTab(tab) {
  const url = tab?.url;
  if (!url || !/^https?:/i.test(url)) {
    badgeFlashErr();
    return;
  }

  const payload = {
    url,
    title: tab.title || new URL(url).hostname,
    collection_id: null,
    quick_save: true,
  };
  void badgeSaving("Saving to Unsorted…");
  await showPageStatus(tab.id, "saving", "Saving to Unsorted…");

  try {
    const appUrl = await getStoredAppUrl();
    await apiFetch(appUrl, "/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    badgeFlashOk();
    await showPageStatus(tab.id, "saved", "Saved to Unsorted");
  } catch (error) {
    console.error("Quick save failed:", error);
    const isNetworkError = error instanceof TypeError || /fetch|network/i.test(error?.message || "");
    if (isNetworkError) {
      await enqueueFailed(payload);
      await showPageStatus(tab.id, "queued", "Could not reach Savers. Queued to retry.");
    } else {
      const message = /401|unauthorized/i.test(error?.message || "")
        ? "Add an extension token in Savers and the extension Options."
        : error?.message || "Could not save this page.";
      await showPageStatus(tab.id, "error", message);
    }
    badgeFlashErr();
  }
}

/* ── API Helpers ── */

async function apiFetch(appUrl, path, options) {
  const headers = new Headers(options?.headers);
  const stored = await chrome.storage.local.get(["saversApiToken"]);
  const token = String(stored.saversApiToken || "").trim();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${appUrl}${path}`, {
    credentials: "include",
    ...options,
    headers,
  });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {}
    throw new Error(message);
  }
  // 204 No Content = success with no body
  if (response.status === 204) return null;
  return response.json();
}

/* ── Context Menu ── */

async function ensureContextMenus() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create(
    {
      id: SAVE_PAGE_MENU_ID,
      title: "Save page to Savers",
      contexts: ["page"],
      documentUrlPatterns: ["http://*/*", "https://*/*"],
    },
    () => {
      if (chrome.runtime.lastError) {
        console.error("Context menu create failed:", chrome.runtime.lastError.message);
      }
    }
  );
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== SAVE_PAGE_MENU_ID) return;
  await savePageFromTab(tab);
});

chrome.action.onClicked.addListener((tab) => {
  void quickSavePageFromTab(tab);
});

/* ── Alarms (periodic retry) ── */

chrome.alarms.create(ALARM_RETRY, { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_RETRY) {
    processRetryQueue();
  }
});

/* ── Lifecycle ── */

chrome.runtime.onInstalled.addListener(() => {
  void migrateAppUrl();
  void ensureContextMenus();
  void syncBadge();
});

chrome.runtime.onStartup.addListener(() => {
  void migrateAppUrl();
  void ensureContextMenus();
  void syncBadge();
  void processRetryQueue();
});
