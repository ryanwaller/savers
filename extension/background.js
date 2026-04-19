const DEFAULT_API_BASE = "https://savers-production.up.railway.app";
const LEGACY_LOCALHOST_BASE = "http://localhost:3000";
const MENU_ID = "save-page-to-savers";

function normalizeBaseUrl(input) {
  const value = (input || "").trim();
  if (!value) return DEFAULT_API_BASE;
  return value.replace(/\/+$/, "");
}

/** Rewrite the stored localhost default to the Railway URL for existing installs. */
async function migrateApiBase() {
  const { saversApiBase } = await chrome.storage.sync.get({ saversApiBase: null });
  if (saversApiBase === LEGACY_LOCALHOST_BASE) {
    await chrome.storage.sync.set({ saversApiBase: DEFAULT_API_BASE });
  }
}

async function getApiBase() {
  const stored = await chrome.storage.sync.get({ saversApiBase: DEFAULT_API_BASE });
  return normalizeBaseUrl(stored.saversApiBase);
}

async function fetchJson(url, options = {}) {
  return fetch(url, {
    credentials: "include",
    ...options,
  });
}

async function ensureContextMenu() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Save page to Savers",
    contexts: ["page"],
  });
}

chrome.runtime.onInstalled.addListener(() => {
  void migrateApiBase();
  void ensureContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  void migrateApiBase();
  void ensureContextMenu();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.url) return;
  void saveCurrentPage(tab);
});

async function saveCurrentPage(tab) {
  const apiBase = await getApiBase();

  try {
    let meta = { title: null, description: null, og_image: null, favicon: null };
    const metaRes = await fetchJson(`${apiBase}/api/metadata?url=${encodeURIComponent(tab.url)}`);
    if (metaRes.status === 401) {
      await chrome.tabs.create({ url: apiBase });
      return;
    }
    if (metaRes.ok) {
      meta = await metaRes.json();
    }

    const bookmarkRes = await fetchJson(`${apiBase}/api/bookmarks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: tab.url,
        title: tab.title || meta.title,
        description: meta.description,
        og_image: meta.og_image,
        favicon: meta.favicon,
        notes: null,
        tags: [],
        collection_id: null,
      }),
    });

    if (bookmarkRes.status === 401) {
      await chrome.tabs.create({ url: apiBase });
      return;
    }

    if (!bookmarkRes.ok) {
      throw new Error(`Bookmark save failed (${bookmarkRes.status})`);
    }

    const { bookmark } = await bookmarkRes.json();

    try {
      const collectionRes = await fetchJson(`${apiBase}/api/collections`);
      const collections = await collectionRes.json();
      const categorizeRes = await fetchJson(`${apiBase}/api/categorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: bookmark.url,
          title: bookmark.title,
          description: bookmark.description,
          collections: collections.collections || [],
        }),
      });
      const categorizeData = await categorizeRes.json();
      const suggestion = categorizeData.suggestion;

      if (suggestion?.collection_id && suggestion.confidence !== "low") {
        await fetchJson(`${apiBase}/api/bookmarks`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: bookmark.id,
            collection_id: suggestion.collection_id,
          }),
        });
      }
    } catch {
      // Background save should stay quiet if categorization fails.
    }
  } catch (error) {
    console.error("Save page to Savers failed", error);
  }
}
