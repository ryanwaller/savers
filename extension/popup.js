const DEFAULT_API_BASE = "https://savers-production.up.railway.app";

const urlInput = document.getElementById("url");
const titleInput = document.getElementById("title");
const notesInput = document.getElementById("notes");
const collectionSelect = document.getElementById("collection");
const apiBaseInput = document.getElementById("apiBase");
const statusEl = document.getElementById("status");
const form = document.getElementById("form");
const cancelBtn = document.getElementById("cancel");
const saveBtn = document.getElementById("save");
const resultEl = document.getElementById("result");

let collectionPaths = [];
let apiBase = DEFAULT_API_BASE;

function normalizeBaseUrl(input) {
  const value = (input || "").trim();
  if (!value) return DEFAULT_API_BASE;
  return value.replace(/\/+$/, "");
}

function fetchJson(url, options = {}) {
  return fetch(url, {
    credentials: "include",
    ...options,
  });
}

async function loadConfig() {
  const stored = await chrome.storage.sync.get({ saversApiBase: DEFAULT_API_BASE });
  apiBase = normalizeBaseUrl(stored.saversApiBase);
  apiBaseInput.value = apiBase;
}

async function saveConfig() {
  apiBase = normalizeBaseUrl(apiBaseInput.value);
  apiBaseInput.value = apiBase;
  await chrome.storage.sync.set({ saversApiBase: apiBase });
}

function buildPaths(tree, parent = "") {
  const out = [];
  for (const c of tree) {
    const p = parent ? `${parent} / ${c.name}` : c.name;
    out.push({ id: c.id, path: p });
    if (c.children && c.children.length) {
      out.push(...buildPaths(c.children, p));
    }
  }
  return out;
}

async function openSavers(message) {
  statusEl.textContent = message;
  await chrome.tabs.create({ url: apiBase });
}

async function loadCollections() {
  collectionSelect.innerHTML = '<option value="">Unsorted</option>';
  statusEl.textContent = "Loading…";

  const res = await fetchJson(`${apiBase}/api/collections`);
  if (res.status === 401) {
    await openSavers("Sign in on Savers first");
    return false;
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();
  collectionPaths = buildPaths(data.collections || []).sort((a, b) =>
    a.path.localeCompare(b.path)
  );

  for (const c of collectionPaths) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.path;
    collectionSelect.appendChild(opt);
  }

  statusEl.textContent = "";
  return true;
}

async function init() {
  try {
    await loadConfig();

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      urlInput.value = tab.url || "";
      titleInput.value = tab.title || "";
    }

    await loadCollections();
  } catch (e) {
    console.error(e);
    statusEl.textContent = e.message || "Could not connect";
  }
}

async function save(ev) {
  ev.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;

  await saveConfig();

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";
  statusEl.textContent = "";

  try {
    let meta = { title: null, description: null, og_image: null, favicon: null };
    try {
      const metaRes = await fetchJson(
        `${apiBase}/api/metadata?url=${encodeURIComponent(url)}`
      );
      if (metaRes.status === 401) {
        await openSavers("Sign in on Savers first");
        saveBtn.disabled = false;
        saveBtn.textContent = "Save";
        return;
      }
      if (metaRes.ok) meta = await metaRes.json();
    } catch {}

    const body = {
      url,
      title: titleInput.value.trim() || meta.title,
      description: meta.description,
      og_image: meta.og_image,
      favicon: meta.favicon,
      notes: notesInput.value.trim() || null,
      tags: [],
      collection_id: collectionSelect.value || null,
    };

    const res = await fetchJson(`${apiBase}/api/bookmarks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.status === 401) {
      await openSavers("Sign in on Savers first");
      saveBtn.disabled = false;
      saveBtn.textContent = "Save";
      return;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const { bookmark } = await res.json();

    let suggestionLine = "";
    if (!collectionSelect.value) {
      try {
        const colRes = await fetchJson(`${apiBase}/api/collections`);
        const colData = await colRes.json();
        const catRes = await fetchJson(`${apiBase}/api/categorize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: bookmark.url,
            title: bookmark.title,
            description: bookmark.description,
            collections: colData.collections || [],
          }),
        });
        const catData = await catRes.json();
        const s = catData.suggestion;
        if (s && s.confidence !== "low" && s.collection_id) {
          await fetchJson(`${apiBase}/api/bookmarks`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: bookmark.id, collection_id: s.collection_id }),
          });
          suggestionLine = `AI filed it under ${s.collection_path}.`;
        } else {
          suggestionLine = "Saved to Unsorted.";
        }
      } catch {
        suggestionLine = "Saved to Unsorted.";
      }
    } else {
      const chosen = collectionPaths.find((c) => c.id === collectionSelect.value);
      suggestionLine = `Saved to ${chosen ? chosen.path : "collection"}.`;
    }

    form.hidden = true;
    resultEl.hidden = false;
    resultEl.textContent = `Saved. ${suggestionLine}`;
    setTimeout(() => window.close(), 1600);
  } catch (e) {
    console.error(e);
    statusEl.textContent = e.message || "Save failed";
    saveBtn.disabled = false;
    saveBtn.textContent = "Save";
  }
}

apiBaseInput.addEventListener("change", () => {
  void saveConfig().then(() => loadCollections()).catch((error) => {
    console.error(error);
    statusEl.textContent = error.message || "Could not refresh collections";
  });
});

cancelBtn.addEventListener("click", () => window.close());
form.addEventListener("submit", save);

init();
