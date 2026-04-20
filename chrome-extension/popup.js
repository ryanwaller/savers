const DEFAULT_APP_URL = "https://savers-production.up.railway.app";

const els = {
  appUrl: document.getElementById("app-url"),
  pageTitle: document.getElementById("page-title"),
  pageUrl: document.getElementById("page-url"),
  bookmarkTitle: document.getElementById("bookmark-title"),
  bookmarkDescription: document.getElementById("bookmark-description"),
  collectionSelect: document.getElementById("collection-select"),
  aiSuggestion: document.getElementById("ai-suggestion"),
  aiSuggestionCopy: document.getElementById("ai-suggestion-copy"),
  suggestCollection: document.getElementById("suggest-collection"),
  applyAiSuggestion: document.getElementById("apply-ai-suggestion"),
  dismissAiSuggestion: document.getElementById("dismiss-ai-suggestion"),
  showCreate: document.getElementById("show-create"),
  refreshMeta: document.getElementById("refresh-meta"),
  createWrap: document.getElementById("create-wrap"),
  newCollectionName: document.getElementById("new-collection-name"),
  createCollection: document.getElementById("create-collection"),
  cancelCreate: document.getElementById("cancel-create"),
  openApp: document.getElementById("open-app"),
  saveBookmark: document.getElementById("save-bookmark"),
  status: document.getElementById("status"),
  aiStatus: document.getElementById("ai-status"),
};

const state = {
  appUrl: DEFAULT_APP_URL,
  tabUrl: "",
  tabTitle: "",
  metadata: null,
  flatCollections: [],
  aiSuggestion: null,
  collectionTouched: false,
};

init().catch((error) => {
  setStatus(error instanceof Error ? error.message : String(error), "error");
});

async function init() {
  const stored = await chrome.storage.sync.get(["saversAppUrl"]);
  state.appUrl = normalizeAppUrl(stored.saversAppUrl || DEFAULT_APP_URL);
  els.appUrl.value = state.appUrl;

  bindEvents();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https?:/i.test(tab.url)) {
    throw new Error("This tab can’t be saved. Open a normal website first.");
  }

  state.tabUrl = tab.url;
  state.tabTitle = tab.title || tab.url;

  els.pageTitle.textContent = state.tabTitle;
  els.pageUrl.textContent = state.tabUrl;
  els.bookmarkTitle.value = state.tabTitle;

  await loadCollections();
  await hydrateMetadata();
  await suggestCollection();
}

function bindEvents() {
  els.appUrl.addEventListener("change", async () => {
    state.appUrl = normalizeAppUrl(els.appUrl.value);
    els.appUrl.value = state.appUrl;
    await chrome.storage.sync.set({ saversAppUrl: state.appUrl });
    clearSuggestion();
    await loadCollections();
    await suggestCollection(true);
  });

  els.collectionSelect.addEventListener("change", () => {
    state.collectionTouched = true;
  });

  els.suggestCollection.addEventListener("click", () => {
    void suggestCollection(true);
  });

  els.applyAiSuggestion.addEventListener("click", () => {
    void applySuggestion();
  });

  els.dismissAiSuggestion.addEventListener("click", () => {
    clearSuggestion();
    setAiStatus("Suggestion dismissed.");
  });

  els.showCreate.addEventListener("click", () => {
    els.createWrap.classList.remove("hidden");
    els.newCollectionName.value = "";
    els.newCollectionName.focus();
  });

  els.cancelCreate.addEventListener("click", () => {
    els.createWrap.classList.add("hidden");
    els.newCollectionName.value = "";
  });

  els.newCollectionName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleCreateCollection();
    }
  });

  els.createCollection.addEventListener("click", () => {
    void handleCreateCollection();
  });

  els.refreshMeta.addEventListener("click", () => {
    void (async () => {
      await hydrateMetadata(true);
      await suggestCollection(true);
    })();
  });

  els.openApp.addEventListener("click", () => {
    chrome.tabs.create({ url: state.appUrl });
  });

  els.saveBookmark.addEventListener("click", () => {
    void saveBookmark();
  });
}

async function loadCollections() {
  setStatus("Loading collections…");
  const data = await apiFetch("/api/collections", { method: "GET" });
  state.flatCollections = Array.isArray(data.flat) ? data.flat : [];

  const paths = buildPaths(state.flatCollections);
  const sorted = [...state.flatCollections].sort((a, b) =>
    (paths.get(a.id) || "").localeCompare(paths.get(b.id) || "")
  );

  els.collectionSelect.innerHTML = "";

  const unsorted = document.createElement("option");
  unsorted.value = "";
  unsorted.textContent = "Unsorted";
  els.collectionSelect.appendChild(unsorted);

  for (const collection of sorted) {
    const option = document.createElement("option");
    option.value = collection.id;
    option.textContent = paths.get(collection.id) || collection.name;
    els.collectionSelect.appendChild(option);
  }

  setStatus("Collections ready.");
}

async function hydrateMetadata(force = false) {
  if (!state.tabUrl) return;
  if (state.metadata && !force) return;

  setStatus("Fetching metadata…");

  try {
    const metadata = await apiFetch(`/api/metadata?url=${encodeURIComponent(state.tabUrl)}`, {
      method: "GET",
    });
    state.metadata = metadata;
    if (metadata.title) {
      els.bookmarkTitle.value = metadata.title;
    }
    if (metadata.description) {
      els.bookmarkDescription.value = metadata.description;
    }
    setStatus("Metadata ready.");
  } catch (error) {
    setStatus(
      error instanceof Error ? `Metadata unavailable: ${error.message}` : "Metadata unavailable.",
      "error"
    );
  }
}

async function suggestCollection(force = false) {
  if (!state.tabUrl) {
    clearSuggestion();
    return;
  }

  if (state.aiSuggestion && !force) return;

  els.suggestCollection.disabled = true;
  setAiStatus("Suggesting a collection…");

  try {
    const { collections } = await apiFetch("/api/collections", { method: "GET" });
    const data = await apiFetch("/api/categorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: state.tabUrl,
        title: els.bookmarkTitle.value.trim() || state.tabTitle,
        description: els.bookmarkDescription.value.trim() || null,
        collections,
      }),
    });

    state.aiSuggestion = data?.suggestion || null;

    if (!state.aiSuggestion) {
      clearSuggestion();
      setAiStatus("No clear suggestion.");
      return;
    }

    renderSuggestion();
    if (
      !state.collectionTouched &&
      state.aiSuggestion.collection_id &&
      state.aiSuggestion.confidence !== "low"
    ) {
      els.collectionSelect.value = state.aiSuggestion.collection_id;
    }
    setAiStatus("Suggestion ready.", "success");
  } catch (error) {
    clearSuggestion();
    setAiStatus(
      error instanceof Error ? `Suggestion failed: ${error.message}` : "Suggestion failed.",
      "error"
    );
  } finally {
    els.suggestCollection.disabled = false;
  }
}

function renderSuggestion() {
  const suggestion = state.aiSuggestion;
  if (!suggestion) {
    clearSuggestion();
    return;
  }

  let copy = "";
  let actionLabel = "Use suggestion";

  if (suggestion.collection_id && suggestion.collection_path) {
    copy = `${capitalize(suggestion.confidence)} confidence: ${suggestion.collection_path}`;
  } else if (suggestion.proposed_collection_name) {
    const parent = suggestion.proposed_parent_collection_path
      ? ` under ${suggestion.proposed_parent_collection_path}`
      : "";
    copy = `${capitalize(suggestion.confidence)} confidence: create ${suggestion.proposed_collection_name}${parent}`;
    actionLabel = "Create + use";
  }

  if (!copy) {
    clearSuggestion();
    return;
  }

  els.aiSuggestionCopy.textContent = copy;
  els.applyAiSuggestion.textContent = actionLabel;
  els.aiSuggestion.classList.remove("hidden");
  // Active suggestion means no need for a manual Suggest button.
  els.suggestCollection.classList.add("hidden");
}

function clearSuggestion() {
  state.aiSuggestion = null;
  els.aiSuggestionCopy.textContent = "";
  els.aiSuggestion.classList.add("hidden");
  els.applyAiSuggestion.textContent = "Use suggestion";
  // Surface the manual Suggest button as a fallback.
  els.suggestCollection.classList.remove("hidden");
}

async function applySuggestion() {
  const suggestion = state.aiSuggestion;
  if (!suggestion) return;

  els.applyAiSuggestion.disabled = true;
  try {
    if (suggestion.collection_id) {
      els.collectionSelect.value = suggestion.collection_id;
      state.collectionTouched = true;
      setAiStatus(`Using ${suggestion.collection_path || "suggested collection"}.`, "success");
      return;
    }

    if (suggestion.proposed_collection_name) {
      const data = await apiFetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: suggestion.proposed_collection_name,
          parent_id: suggestion.proposed_parent_collection_id || null,
        }),
      });

      const collection = data.collection;
      await loadCollections();
      els.collectionSelect.value = collection.id;
      state.collectionTouched = true;
      setAiStatus(`Created "${collection.name}".`, "success");
    }
  } catch (error) {
    setAiStatus(
      error instanceof Error ? error.message : "Failed to apply suggestion.",
      "error"
    );
  } finally {
    els.applyAiSuggestion.disabled = false;
  }
}

async function handleCreateCollection() {
  const name = els.newCollectionName.value.trim();
  if (!name) {
    setStatus("Enter a collection name first.", "error");
    return;
  }

  els.createCollection.disabled = true;
  try {
    const data = await apiFetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parent_id: null }),
    });

    const collection = data.collection;
    await loadCollections();
    els.collectionSelect.value = collection.id;
    els.newCollectionName.value = "";
    els.createWrap.classList.add("hidden");
    setStatus(`Created "${collection.name}".`, "success");
  } finally {
    els.createCollection.disabled = false;
  }
}

async function saveBookmark() {
  if (!state.tabUrl) {
    setStatus("No page URL found for this tab.", "error");
    return;
  }

  els.saveBookmark.disabled = true;
  setStatus("Saving bookmark…");

  try {
    if (!state.metadata) {
      await hydrateMetadata(true);
    }

    const payload = {
      url: state.tabUrl,
      title: els.bookmarkTitle.value.trim() || state.tabTitle,
      description: els.bookmarkDescription.value.trim() || null,
      og_image: state.metadata?.og_image || null,
      favicon: state.metadata?.favicon || null,
      tags: [],
      notes: null,
      collection_id: els.collectionSelect.value || null,
    };

    await apiFetch("/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setStatus("Saved to Savers.", "success");
    window.setTimeout(() => window.close(), 700);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Failed to save bookmark.", "error");
  } finally {
    els.saveBookmark.disabled = false;
  }
}

async function apiFetch(path, options) {
  const response = await fetch(`${state.appUrl}${path}`, {
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

function buildPaths(flat) {
  const byId = new Map(flat.map((item) => [item.id, item]));
  const cache = new Map();

  function resolve(id) {
    if (cache.has(id)) return cache.get(id);
    const current = byId.get(id);
    if (!current) return "";
    const value = current.parent_id ? `${resolve(current.parent_id)} / ${current.name}` : current.name;
    cache.set(id, value);
    return value;
  }

  for (const collection of flat) resolve(collection.id);
  return cache;
}

function normalizeAppUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  return raw || DEFAULT_APP_URL;
}

function capitalize(value) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : "";
}

function setStatus(message, kind = "") {
  els.status.textContent = message || "";
  els.status.className = `status ${kind}`.trim();
}

function setAiStatus(message, kind = "") {
  els.aiStatus.textContent = message || "";
  els.aiStatus.className = `status ai-status ${kind}`.trim();
}
