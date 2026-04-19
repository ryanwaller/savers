const DEFAULT_APP_URL = "https://savers-production.up.railway.app";
const LEGACY_LOCALHOST_URL = "http://localhost:3000";
const SAVE_PAGE_MENU_ID = "save-page-to-savers";

/** Rewrite the stored localhost default to the Railway URL for existing installs. */
async function migrateAppUrl() {
  const stored = await chrome.storage.sync.get(["saversAppUrl"]);
  if (stored.saversAppUrl === LEGACY_LOCALHOST_URL) {
    await chrome.storage.sync.set({ saversAppUrl: DEFAULT_APP_URL });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void migrateAppUrl();
  void ensureContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  void migrateAppUrl();
  void ensureContextMenus();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== SAVE_PAGE_MENU_ID) return;
  await savePageFromTab(tab);
});

async function ensureContextMenus() {
  await new Promise((resolve) => {
    chrome.contextMenus.removeAll(() => resolve());
  });

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

async function getStoredAppUrl() {
  const stored = await chrome.storage.sync.get(["saversAppUrl"]);
  return normalizeAppUrl(stored.saversAppUrl || DEFAULT_APP_URL);
}

async function setBadge(text, color, title) {
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
  if (title) {
    await chrome.action.setTitle({ title });
  }
}

async function clearBadge() {
  await chrome.action.setBadgeText({ text: "" });
  await chrome.action.setTitle({ title: "Save to Savers" });
}

async function savePageFromTab(tab) {
  const url = tab?.url;
  if (!url || !/^https?:/i.test(url)) {
    await flashBadge("ERR", "#8b1e1e", "Savers: this page can’t be saved");
    return;
  }

  await setBadge("...", "#4a4a4a", "Savers: saving page…");

  try {
    const appUrl = await getStoredAppUrl();
    const metadata = await fetchBestEffortMetadata(appUrl, tab);

    await apiFetch(appUrl, "/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        title: metadata.title || tab?.title || url,
        description: metadata.description,
        og_image: metadata.og_image,
        favicon: metadata.favicon,
        tags: [],
        notes: null,
        collection_id: null,
      }),
    });

    await flashBadge("OK", "#1f6f43", "Savers: page saved");
  } catch (error) {
    console.error("Save page to Savers failed:", error);
    await flashBadge("ERR", "#8b1e1e", "Savers: save failed");
  }
}

async function fetchBestEffortMetadata(appUrl, tab) {
  const url = tab?.url || "";
  const fallback = {
    title: tab?.title || url,
    description: null,
    og_image: null,
    favicon: tab?.favIconUrl || null,
  };

  try {
    const fetched = await apiFetch(
      appUrl,
      `/api/metadata?url=${encodeURIComponent(url)}`,
      { method: "GET" }
    );

    return {
      title: fetched?.title || fallback.title,
      description: fetched?.description || null,
      og_image: fetched?.og_image || null,
      favicon: fetched?.favicon || fallback.favicon,
    };
  } catch {
    return fallback;
  }
}

async function apiFetch(appUrl, path, options) {
  const response = await fetch(`${appUrl}${path}`, {
    credentials: "include",
    ...options,
  });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}

function normalizeAppUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  return raw || DEFAULT_APP_URL;
}

async function flashBadge(text, color, title) {
  await setBadge(text, color, title);
  setTimeout(() => {
    void clearBadge();
  });
}
