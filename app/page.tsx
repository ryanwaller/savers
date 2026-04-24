"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { List, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import type { Bookmark, Collection, AISuggestion } from "@/lib/types";
import { api, canonicalBookmarkUrl } from "@/lib/api";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import Sidebar from "./components/Sidebar";
import CollectionIcon from "./components/CollectionIcon";
import BookmarkGrid from "./components/BookmarkGrid";
import AddBookmarkModal from "./components/AddBookmarkModal";
import BookmarkDetail from "./components/BookmarkDetail";
import AISuggestionToast from "./components/AISuggestionToast";
import DropZone from "./components/DropZone";
import DuplicateImportModal from "./components/DuplicateImportModal";
import AuthScreen from "./components/AuthScreen";
import ConfirmDialog from "./components/ConfirmDialog";

type Selection =
  | { kind: "all" }
  | { kind: "unsorted" }
  | { kind: "pinned" }
  | { kind: "collection"; id: string };

export default function Home() {
  const MIN_SIDEBAR_WIDTH = 180;
  const MAX_SIDEBAR_WIDTH = 420;

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [sendingAuthLink, setSendingAuthLink] = useState(false);
  const [signingInWithGoogle, setSigningInWithGoogle] = useState(false);

  // Counts — we compute locally from the full bookmark list for accuracy.
  const [allBookmarks, setAllBookmarks] = useState<Bookmark[]>([]);
  const allBookmarksRef = useRef<Bookmark[]>([]);
  const [treeRaw, setTreeRaw] = useState<Collection[]>([]);
  const tree = useMemo(() => annotateCounts(treeRaw, allBookmarks), [treeRaw, allBookmarks]);
  const [flat, setFlat] = useState<Collection[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [selection, setSelection] = useState<Selection>({ kind: "all" });
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const b of allBookmarks) {
      if (b.tags) {
        for (const t of b.tags) set.add(t);
      }
    }
    return Array.from(set).sort();
  }, [allBookmarks]);
  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const bookmark of allBookmarks) {
      for (const tag of bookmark.tags ?? []) {
        counts[tag] = (counts[tag] ?? 0) + 1;
      }
    }
    return counts;
  }, [allBookmarks]);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const [sidebarWidth, setSidebarWidth] = useState(220);
  const MIN_CARD_WIDTH = 220;
  const MAX_CARD_WIDTH = 460;
  const DEFAULT_CARD_WIDTH = 300;
  const [cardMinWidth, setCardMinWidth] = useState(DEFAULT_CARD_WIDTH);
  const [resizingSidebar, setResizingSidebar] = useState(false);
  const [loadingBookmarks, setLoadingBookmarks] = useState(false);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [detail, setDetail] = useState<Bookmark | null>(null);
  const [toast, setToast] = useState<{
    bookmark: Bookmark;
    suggestion: AISuggestion;
  } | null>(null);
  const [dropStatus, setDropStatus] = useState<string | null>(null);
  const [duplicateImportUrls, setDuplicateImportUrls] = useState<string[]>([]);
  const [showDeleteDuplicates, setShowDeleteDuplicates] = useState(false);
  const [deletingDuplicates, setDeletingDuplicates] = useState(false);

  const resizeState = useRef<{ startX: number; startWidth: number } | null>(null);
  const lastForegroundRefreshRef = useRef(0);

  const updateAllBookmarksState = useCallback(
    (updater: (prev: Bookmark[]) => Bookmark[]) => {
      setAllBookmarks((prev) => {
        const next = updater(prev);
        allBookmarksRef.current = next;
        return next;
      });
    },
    []
  );

  function getAuthRedirectBase() {
    const configuredBase = process.env.NEXT_PUBLIC_SITE_URL?.trim();

    if (typeof window === "undefined") {
      return configuredBase ?? "";
    }

    const currentBase = window.location.origin;
    const isLocalhost =
      currentBase.includes("localhost") || currentBase.includes("127.0.0.1");

    if (isLocalhost) {
      return currentBase;
    }

    return configuredBase || currentBase;
  }

  useEffect(() => {
    allBookmarksRef.current = allBookmarks;
  }, [allBookmarks]);

  useEffect(() => {
    let alive = true;

    const loadUser = async () => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.getUser();
      if (!alive) return;

      if (error) {
        setUser(null);
      } else {
        setUser(data.user ?? null);
      }

      setAuthLoading(false);
    };

    void loadUser();

    const {
      data: { subscription },
    } = getSupabaseBrowserClient().auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
      if (!alive) return;
      setUser(session?.user ?? null);
      setAuthLoading(false);
      if (session?.user) {
        setAuthMessage(null);
      }
      }
    );

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("auth") === "error") {
      setAuthMessage("That sign-in link expired or was invalid. Please try again.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (user) return;
    allBookmarksRef.current = [];
    setAllBookmarks([]);
    setBookmarks([]);
    setTreeRaw([]);
    setFlat([]);
    setDetail(null);
    setToast(null);
    setLoadError(null);
    setInitialDataLoaded(false);
  }, [user]);

  // Load preference on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("savers.sidebar.width");
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(parsed)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSidebarWidth(Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, parsed)));
    }
  }, []);

  // Save preference on change
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("savers.sidebar.width", String(sidebarWidth));
  }, [sidebarWidth]);

  // Load/save card size preference
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("savers.grid.cardMinWidth");
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(parsed)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCardMinWidth(Math.min(MAX_CARD_WIDTH, Math.max(MIN_CARD_WIDTH, parsed)));
    }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("savers.grid.cardMinWidth", String(cardMinWidth));
  }, [cardMinWidth]);

  useEffect(() => {
    if (!resizingSidebar) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (!resizeState.current) return;
      const nextWidth =
        resizeState.current.startWidth + (event.clientX - resizeState.current.startX);
      setSidebarWidth(clamp(nextWidth, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH));
    };

    const handlePointerUp = () => {
      resizeState.current = null;
      setResizingSidebar(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [resizingSidebar]);

  const loadCollections = useCallback(async () => {
    try {
      const data = await api.listCollections();
      setTreeRaw(data.collections);
      setFlat(data.flat);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load collections");
    }
  }, []);

  const loadAllBookmarks = useCallback(async () => {
    try {
      const { bookmarks } = await api.listBookmarks();
      allBookmarksRef.current = bookmarks;
      setAllBookmarks(bookmarks);
      setLoadError(null);
      return bookmarks;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load bookmarks");
    }
    return null;
  }, []);

  const refreshFromServer = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoadingBookmarks(true);
      try {
        await Promise.all([loadAllBookmarks(), loadCollections()]);
      } finally {
        if (showLoading) setLoadingBookmarks(false);
      }
    },
    [loadAllBookmarks, loadCollections]
  );

  // Initial load
  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;

    (async () => {
      setLoadingBookmarks(true);
      try {
        await Promise.all([loadAllBookmarks(), loadCollections()]);
        if (!cancelled) {
          setInitialDataLoaded(true);
        }
      } finally {
        if (!cancelled) setLoadingBookmarks(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user, loadAllBookmarks, loadCollections]);

  // Load bookmarks for the current view (with debounced search)
  const searchTimer = useRef<number | null>(null);
  useEffect(() => {
    if (authLoading || !user || !initialDataLoaded) return;
    const syncVisibleBookmarks = () => {
      const scoped = allBookmarksRef.current.filter((bookmark) => {
        if (selection.kind === "unsorted") return bookmark.collection_id === null;
        if (selection.kind === "pinned") return bookmark.pinned;
        if (selection.kind === "collection") return bookmark.collection_id === selection.id;
        return true;
      });

      setBookmarks(sortPinnedFirst(filterBookmarks(scoped, search, activeTag)));
      setLoadingBookmarks(false);
    };

    if (searchTimer.current) window.clearTimeout(searchTimer.current);

    if (!search.trim()) {
      syncVisibleBookmarks();
      return () => {
        if (searchTimer.current) window.clearTimeout(searchTimer.current);
      };
    }

    setLoadingBookmarks(true);
    searchTimer.current = window.setTimeout(syncVisibleBookmarks, 180);

    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [authLoading, user, allBookmarks, selection, search, activeTag, initialDataLoaded]);

  useEffect(() => {
    if (typeof window === "undefined" || !user) return;

    const maybeRefresh = () => {
      const now = Date.now();
      if (now - lastForegroundRefreshRef.current < 15_000) return;
      lastForegroundRefreshRef.current = now;
      void refreshFromServer(false);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") maybeRefresh();
    };

    window.addEventListener("focus", maybeRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", maybeRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user, refreshFromServer]);

  const totals = useMemo(
    () => ({
      all: allBookmarks.length,
      unsorted: allBookmarks.filter((b) => b.collection_id === null).length,
      pinned: allBookmarks.filter((b) => b.pinned).length,
    }),
    [allBookmarks]
  );

  const duplicateSummary = useMemo(() => {
    const seenCanonicalUrls = new Set<string>();
    const duplicateGroups = new Set<string>();
    let duplicateCount = 0;

    for (const bookmark of allBookmarks) {
      const canonicalUrl = canonicalBookmarkUrl(bookmark.url);
      if (seenCanonicalUrls.has(canonicalUrl)) {
        duplicateCount += 1;
        duplicateGroups.add(canonicalUrl);
        continue;
      }
      seenCanonicalUrls.add(canonicalUrl);
    }

    return {
      duplicateCount,
      duplicateGroupCount: duplicateGroups.size,
    };
  }, [allBookmarks]);

  const subCollections = useMemo<Collection[]>(() => {
    if (selection.kind !== "collection") return [];
    const node = findNode(tree, selection.id);
    return node?.children ?? [];
  }, [selection, tree]);

  const breadcrumbItems = useMemo(() => {
    if (selection.kind === "all") {
      return [
        { label: "All bookmarks", icon: null, isCollection: false, selection: { kind: "all" } as Selection },
      ];
    }
    if (selection.kind === "unsorted") {
      return [
        { label: "All bookmarks", icon: null, isCollection: false, selection: { kind: "all" } as Selection },
        { label: "Unsorted", icon: null, isCollection: false, selection: { kind: "unsorted" } as Selection },
      ];
    }
    if (selection.kind === "pinned") {
      return [
        { label: "All bookmarks", icon: null, isCollection: false, selection: { kind: "all" } as Selection },
        { label: "Pinned", icon: null, isCollection: false, selection: { kind: "pinned" } as Selection },
      ];
    }

    const path = pathToCollections(tree, selection.id) ?? [];
    return [
      { label: "All bookmarks", icon: null, isCollection: false, selection: { kind: "all" } as Selection },
      ...path.map((item) => ({
        label: item.name,
        icon: item.icon,
        isCollection: true,
        selection: { kind: "collection", id: item.id } as Selection,
      })),
    ];
  }, [selection, tree]);
  const canGoBack = breadcrumbItems.length > 1;

  const defaultCollectionForAdd =
    selection.kind === "collection" ? selection.id : null;

  function navigateBack() {
    if (!canGoBack) return;
    setSelection(breadcrumbItems[breadcrumbItems.length - 2].selection);
  }

  function handleTagClick(tag: string | null) {
    setActiveTag(tag);
  }

  async function handleCreateCollection(name: string, parent_id: string | null) {
    try {
      const { collection } = await api.createCollection(name, parent_id);
      await loadCollections();
      return collection;
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to create collection");
      throw e;
    }
  }
  async function handleRenameCollection(id: string, name: string) {
    try {
      await api.updateCollection(id, { name });
      await loadCollections();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to rename");
    }
  }
  async function handleChangeCollectionIcon(id: string, iconName: string | null) {
    try {
      await api.updateCollection(id, { icon: iconName });
      await loadCollections();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update icon");
    }
  }
  async function handleDeleteCollection(id: string) {
    try {
      await api.deleteCollection(id);
      if (selection.kind === "collection" && selection.id === id) {
        setSelection({ kind: "all" });
      }
      await Promise.all([loadCollections(), loadAllBookmarks()]);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  async function handleReparentCollection(id: string, newParentId: string | null) {
    if (id === newParentId) return;
    try {
      await api.updateCollection(id, { parent_id: newParentId });
      await loadCollections();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to move collection");
    }
  }

  async function handleReorderCollections(ids: string[]) {
    const oldTree = treeRaw;

    // Optimistic Update: Reorder the tree locally first
    const newTree = JSON.parse(JSON.stringify(treeRaw)) as Collection[];
    const updateSiblings = (nodes: Collection[]): boolean => {
      // Check if this level contains the items we are reordering
      if (nodes.find((n) => n.id === ids[0])) {
        nodes.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
        // Update positions to stay consistent
        nodes.forEach((n, i) => {
          n.position = i;
        });
        return true;
      }
      for (const node of nodes) {
        if (node.children && updateSiblings(node.children)) return true;
      }
      return false;
    };

    updateSiblings(newTree);
    setTreeRaw(newTree);

    try {
      await api.reorderCollections(ids);
      // We don't strictly need to loadCollections() here if the optimistic 
      // update was successful, but we can do it in the background to be sure.
    } catch (e) {
      // Revert on failure
      setTreeRaw(oldTree);
      alert(e instanceof Error ? e.message : "Failed to reorder");
    }
  }

  function handleBookmarksCreated(newBatch: Bookmark[]) {
    if (newBatch.length === 0) return;
    setShowAdd(false);

    updateAllBookmarksState((prev) => [...newBatch, ...prev]);

    setBookmarks((prev) => {
      const filteredBatch = newBatch.filter(
        (b) =>
          selection.kind === "all" ||
          (selection.kind === "unsorted" && b.collection_id === null) ||
          (selection.kind === "collection" && selection.id === b.collection_id)
      );
      return [...filteredBatch, ...prev];
    });

    // Run AI categorization for the first few in the batch to avoid overloading.
    const first = newBatch[0];
    if (tree.length > 0 && first) {
      api
        .categorize({
          url: first.url,
          title: first.title,
          description: first.description,
          collections: tree,
        })
        .then(({ suggestion }) => {
          if (
            suggestion &&
            suggestion.confidence !== "low" &&
            ((suggestion.collection_id && suggestion.collection_id !== first.collection_id) ||
              suggestion.proposed_collection_name)
          ) {
            setToast({ bookmark: first, suggestion });
          }
        })
        .catch(() => {});
    }
  }

  function handleBookmarkCreated(b: Bookmark) {
    handleBookmarksCreated([b]);
  }

  async function handleMoveFromToast(collectionId: string) {
    if (!toast) return;
    try {
      const { bookmark } = await api.updateBookmark(toast.bookmark.id, {
        collection_id: collectionId,
      });
      updateAllBookmarksState((prev) =>
        prev.map((x) => (x.id === bookmark.id ? bookmark : x))
      );
      setBookmarks((prev) => {
        // Drop it from the current view if it no longer belongs here
        if (selection.kind === "unsorted") return prev.filter((x) => x.id !== bookmark.id);
        if (selection.kind === "collection" && selection.id !== collectionId)
          return prev.filter((x) => x.id !== bookmark.id);
        return prev.map((x) => (x.id === bookmark.id ? bookmark : x));
      });
      setToast(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to move");
    }
  }

  async function handleCreateAndMoveFromToast(name: string, parentId: string | null) {
    if (!toast) return;
    try {
      const collection = await handleCreateCollection(name, parentId);
      const { bookmark } = await api.updateBookmark(toast.bookmark.id, {
        collection_id: collection.id,
      });
      updateAllBookmarksState((prev) => prev.map((x) => (x.id === bookmark.id ? bookmark : x)));
      setBookmarks((prev) => {
        if (selection.kind === "unsorted") return prev.filter((x) => x.id !== bookmark.id);
        if (selection.kind === "collection" && selection.id !== collection.id) {
          return prev.filter((x) => x.id !== bookmark.id);
        }
        return prev.map((x) => (x.id === bookmark.id ? bookmark : x));
      });
      setToast(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to create and move");
    }
  }

  function handleBookmarkSaved(b: Bookmark) {
    setDetail(null);
    updateAllBookmarksState((prev) => prev.map((x) => (x.id === b.id ? b : x)));
    setBookmarks((prev) => {
      // Remove if no longer matches current view
      if (selection.kind === "unsorted" && b.collection_id !== null) {
        return prev.filter((x) => x.id !== b.id);
      }
      if (selection.kind === "collection" && selection.id !== b.collection_id) {
        return prev.filter((x) => x.id !== b.id);
      }
      return prev.map((x) => (x.id === b.id ? b : x));
    });
  }

  function handleBookmarkPatched(b: Bookmark) {
    setDetail(b);
    updateAllBookmarksState((prev) => prev.map((x) => (x.id === b.id ? b : x)));
    setBookmarks((prev) => {
      if (selection.kind === "unsorted" && b.collection_id !== null) {
        return prev.filter((x) => x.id !== b.id);
      }
      if (selection.kind === "collection" && selection.id !== b.collection_id) {
        return prev.filter((x) => x.id !== b.id);
      }
      return prev.map((x) => (x.id === b.id ? b : x));
    });
  }

  function handleBookmarkDeleted(id: string) {
    setDetail(null);
    updateAllBookmarksState((prev) => prev.filter((x) => x.id !== id));
    setBookmarks((prev) => prev.filter((x) => x.id !== id));
  }

  async function handleDeleteBookmark(id: string) {
    try {
      await api.deleteBookmark(id);
      handleBookmarkDeleted(id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  async function handleDeleteDuplicates() {
    try {
      setDeletingDuplicates(true);
      const result = await api.deleteDuplicateBookmarks();
      const deletedIds = new Set(result.deleted_ids);

      if (deletedIds.size > 0) {
        updateAllBookmarksState((prev) => prev.filter((bookmark) => !deletedIds.has(bookmark.id)));
        setBookmarks((prev) => prev.filter((bookmark) => !deletedIds.has(bookmark.id)));
        setDetail((prev) => (prev && deletedIds.has(prev.id) ? null : prev));
        setDropStatus(
          `Deleted ${result.deleted_count} duplicate bookmark${result.deleted_count === 1 ? "" : "s"}.`
        );
        window.setTimeout(() => setDropStatus(null), 2200);
      }

      setShowDeleteDuplicates(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete duplicates");
    } finally {
      setDeletingDuplicates(false);
    }
  }

  async function handlePinBookmark(id: string, pinned: boolean) {
    // Optimistic toggle so the UI feels instant.
    updateAllBookmarksState((prev) => prev.map((x) => (x.id === id ? { ...x, pinned } : x)));
    setBookmarks((prev) => {
      const next = prev.map((x) => (x.id === id ? { ...x, pinned } : x));
      // If viewing the Pinned collection and the user just unpinned, drop it.
      if (selection.kind === "pinned" && !pinned) {
        return next.filter((x) => x.id !== id);
      }
      return next;
    });
    try {
      const { bookmark } = await api.updateBookmark(id, { pinned });
      updateAllBookmarksState((prev) => prev.map((x) => (x.id === id ? bookmark : x)));
      setBookmarks((prev) => prev.map((x) => (x.id === id ? bookmark : x)));
    } catch (e) {
      // Roll back on failure.
      updateAllBookmarksState((prev) =>
        prev.map((x) => (x.id === id ? { ...x, pinned: !pinned } : x))
      );
      setBookmarks((prev) => prev.map((x) => (x.id === id ? { ...x, pinned: !pinned } : x)));
      alert(e instanceof Error ? e.message : "Failed to update pin");
    }
  }

  async function handleRefreshPreview(id: string, version: number) {
    try {
      const { bookmark } = await api.updateBookmark(id, { preview_version: version });
      updateAllBookmarksState((prev) => prev.map((x) => (x.id === id ? bookmark : x)));
      setBookmarks((prev) => prev.map((x) => (x.id === id ? bookmark : x)));
      setDetail((prev) => (prev && prev.id === id ? bookmark : prev));
    } catch (e) {
      throw e instanceof Error ? e : new Error("Failed to refresh preview");
    }
  }

  async function handleUploadCustomPreview(id: string, file: File) {
    const { bookmark } = await api.uploadCustomPreview(id, file);
    updateAllBookmarksState((prev) => prev.map((x) => (x.id === id ? bookmark : x)));
    setBookmarks((prev) => prev.map((x) => (x.id === id ? bookmark : x)));
    setDetail((prev) => (prev && prev.id === id ? bookmark : prev));
    return bookmark;
  }

  async function handleClearCustomPreview(id: string) {
    const { bookmark } = await api.clearCustomPreview(id);
    updateAllBookmarksState((prev) => prev.map((x) => (x.id === id ? bookmark : x)));
    setBookmarks((prev) => prev.map((x) => (x.id === id ? bookmark : x)));
    setDetail((prev) => (prev && prev.id === id ? bookmark : prev));
    return bookmark;
  }

  async function handleDroppedUrls(urls: string[], options?: { allowDuplicates?: boolean }) {
    const allowDuplicates = options?.allowDuplicates ?? false;
    const targetCollection = selection.kind === "collection" ? selection.id : null;

    const existingCanonical = new Set<string>();
    if (!allowDuplicates) {
      for (const bookmark of allBookmarksRef.current) {
        existingCanonical.add(canonicalBookmarkUrl(bookmark.url));
      }
    }
    const duplicates: string[] = [];
    const createdBatch: Bookmark[] = [];

    let okCount = 0;
    let failCount = 0;
    let lastError: string | null = null;
    const total = urls.length;
    setDropStatus(`Saving ${total} bookmark${total === 1 ? "" : "s"}…`);

    for (const url of urls) {
      const canonical = canonicalBookmarkUrl(url);
      if (!allowDuplicates && existingCanonical.has(canonical)) {
        duplicates.push(url);
        continue;
      }
      if (!allowDuplicates) {
        existingCanonical.add(canonical);
      }
      try {
        let meta: {
          title: string | null;
          description: string | null;
          og_image: string | null;
          favicon: string | null;
        } = {
          title: null,
          description: null,
          og_image: null,
          favicon: null,
        };
        try {
          meta = await api.fetchMetadata(url);
        } catch (e) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("Metadata fetch failed for", url, e);
          }
        }

        const { bookmark } = await api.createBookmark({
          url,
          title: meta.title,
          description: meta.description,
          og_image: meta.og_image,
          favicon: meta.favicon,
          tags: [],
          notes: null,
          collection_id: targetCollection,
        });

        createdBatch.push(bookmark);
        okCount += 1;
      } catch (e) {
        failCount += 1;
        lastError = e instanceof Error ? e.message : String(e);
        if (process.env.NODE_ENV !== "production") {
          console.warn("Drop save failed", url, e);
        }
      }
    }

    if (createdBatch.length > 0) {
      handleBookmarksCreated(createdBatch);
    }

    const dupCount = duplicates.length;
    const dupSuffix = dupCount > 0 ? ` ${dupCount} duplicate${dupCount === 1 ? "" : "s"} skipped.` : "";
    if (failCount > 0 && okCount === 0 && dupCount === 0) {
      setDropStatus(`Save failed: ${lastError ?? "unknown error"}`);
    } else if (failCount > 0) {
      setDropStatus(`Saved ${okCount} of ${total}. ${failCount} failed.${dupSuffix}`);
    } else if (okCount === 0 && dupCount > 0) {
      setDropStatus(
        dupCount === 1 ? "Already saved — nothing imported." : `${dupCount} duplicates — nothing new imported.`
      );
    } else {
      setDropStatus(
        (total === 1 ? "Saved." : `Saved ${okCount} bookmark${okCount === 1 ? "" : "s"}.`) + dupSuffix
      );
    }
    if (dupCount > 0) {
      setDuplicateImportUrls(duplicates);
    }
    setTimeout(() => setDropStatus(null), failCount > 0 || dupCount > 0 ? 5000 : 1800);
  }

  async function handleSendMagicLink() {
    const email = authEmail.trim();
    if (!email) {
      setAuthMessage("Enter your email first.");
      return;
    }

    setSendingAuthLink(true);
    setAuthMessage(null);

    try {
      const redirectBase = getAuthRedirectBase();
      const supabase = getSupabaseBrowserClient();

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${redirectBase}/auth/callback`,
        },
      });

      if (error) {
        throw error;
      }

      setAuthMessage("Check your inbox for a Savers sign-in link.");
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Failed to send sign-in link.");
    } finally {
      setSendingAuthLink(false);
    }
  }

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      alert(error.message);
      return;
    }
    setSelection({ kind: "all" });
    setSearch("");
    setActiveTag(null);
    setAuthMessage(null);
  }

  async function handleGoogleSignIn() {
    setSigningInWithGoogle(true);
    setAuthMessage(null);

    try {
      const redirectBase = getAuthRedirectBase();
      const supabase = getSupabaseBrowserClient();

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          skipBrowserRedirect: true,
          redirectTo: `${redirectBase}/auth/callback?next=/`,
        },
      });

      if (error) {
        throw error;
      }

      if (!data?.url) {
        throw new Error("Google sign-in did not return a redirect URL.");
      }

      const oauthUrl = new URL(data.url);
      oauthUrl.searchParams.set("redirect_to", `${redirectBase}/auth/callback?next=/`);

      window.location.assign(oauthUrl.toString());
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Failed to start Google sign-in.");
      setSigningInWithGoogle(false);
    }
  }

  if (authLoading) {
    return (
      <AuthScreen
        email={authEmail}
        googleSending={signingInWithGoogle}
        message={authMessage}
        mode="loading"
        sending={sendingAuthLink}
        onEmailChange={setAuthEmail}
        onGoogleSubmit={handleGoogleSignIn}
        onSubmit={handleSendMagicLink}
      />
    );
  }

  if (!user) {
    return (
      <AuthScreen
        email={authEmail}
        googleSending={signingInWithGoogle}
        message={authMessage}
        mode="signed_out"
        sending={sendingAuthLink}
        onEmailChange={setAuthEmail}
        onGoogleSubmit={handleGoogleSignIn}
        onSubmit={handleSendMagicLink}
      />
    );
  }

  return (
    <DropZone onUrls={handleDroppedUrls}>
    <div
      className={`app ${mobileSidebarOpen ? "mobile-sidebar-open" : ""}`}
      data-savers-app
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <Sidebar
        tree={tree}
        totals={totals}
        allTags={allTags}
        tagCounts={tagCounts}
        activeTag={activeTag}
        userEmail={user.email}
        onTagClick={handleTagClick}
        selection={selection}
        onSelect={(s) => {
          setSelection(s);
          setActiveTag(null);
          setMobileSidebarOpen(false);
        }}
        onCreateCollection={handleCreateCollection}
        onRenameCollection={handleRenameCollection}
        onDeleteCollection={handleDeleteCollection}
        onChangeCollectionIcon={handleChangeCollectionIcon}
        onReorderCollections={handleReorderCollections}
        onReparentCollection={handleReparentCollection}
        onSignOut={handleSignOut}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      <div
        className={`sidebar-resizer ${resizingSidebar ? "active" : ""}`}
        role="separator"
        aria-label="Resize sidebar"
        aria-orientation="vertical"
        aria-valuenow={sidebarWidth}
        aria-valuemin={MIN_SIDEBAR_WIDTH}
        aria-valuemax={MAX_SIDEBAR_WIDTH}
        onPointerDown={(event) => {
          resizeState.current = { startX: event.clientX, startWidth: sidebarWidth };
          setResizingSidebar(true);
        }}
      />

      <main className="main">
        <header className={`top ${mobileSearchOpen ? "top-searching" : ""}`}>
          <div className="top-row top-row-primary">
            <div className="crumbs">
              <button
                className="circle-btn mobile-menu-btn"
                onClick={() => setMobileSidebarOpen(true)}
                aria-label="Open menu"
              >
                <List size={14} />
              </button>
              {canGoBack && (
                <button className="crumb-back" onClick={navigateBack} aria-label="Go back">
                  ←
                </button>
              )}
              {breadcrumbItems.map((item, i) => (
                <span key={i} className="crumb">
                  <button
                    className={i === breadcrumbItems.length - 1 ? "crumb-link current" : "crumb-link ancestor"}
                    onClick={() => setSelection(item.selection)}
                  >
                    {item.isCollection && (
                      <span className="crumb-icon" aria-hidden>
                        <CollectionIcon name={item.icon} size={13} />
                      </span>
                    )}
                    <span className="crumb-label">{item.label}</span>
                  </button>
                  {i < breadcrumbItems.length - 1 && <span className="sep">›</span>}
                </span>
              ))}
              {activeTag && (
                <>
                  <span className="sep">›</span>
                  <span className="tag-filter" title={`Filtering by ${activeTag}`}>
                    <span className="tag-filter-label">#{activeTag}</span>
                    <button
                      className="tag-filter-clear"
                      aria-label={`Clear tag filter ${activeTag}`}
                      onClick={() => setActiveTag(null)}
                    >
                      ×
                    </button>
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="top-row top-row-secondary">
            <div className="top-right">
              <div className="desktop-actions">
                <div className="session-chip" title={user.email ?? "Signed in"}>
                  <span className="session-email">{user.email ?? "Signed in"}</span>
                  <button className="session-signout" onClick={handleSignOut}>
                    Sign out
                  </button>
                </div>
                <div className="search">
                  <input
                    placeholder="Search titles, URLs, descriptions, tags…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                {duplicateSummary.duplicateCount > 0 && (
                  <button className="btn" onClick={() => setShowDeleteDuplicates(true)}>
                    Delete duplicates ({duplicateSummary.duplicateCount})
                  </button>
                )}
                <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
                  + Add bookmark
                </button>
              </div>

              <div className="mobile-actions">
                {mobileSearchOpen ? (
                  <div className="mobile-search-row">
                    <input
                      autoFocus
                      className="mobile-search-input"
                      placeholder="Search…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <button
                      className="circle-btn"
                      aria-label="Close search"
                      onClick={() => {
                        setMobileSearchOpen(false);
                        setSearch("");
                      }}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      className="circle-btn"
                      aria-label="Search"
                      onClick={() => setMobileSearchOpen(true)}
                    >
                      <MagnifyingGlass size={14} />
                    </button>
                    <button
                      className="circle-btn circle-btn-primary"
                      aria-label="Add bookmark"
                      onClick={() => setShowAdd(true)}
                    >
                      <Plus size={14} weight="bold" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        <section className="content">
          {loadError && (
            <div className="load-error small" role="alert">
              <span className="load-error-msg">{loadError}</span>
              <button
                type="button"
                className="load-error-dismiss"
                aria-label="Dismiss error"
                onClick={() => setLoadError(null)}
              >
                ×
              </button>
            </div>
          )}
          <BookmarkGrid
            bookmarks={bookmarks}
            subCollections={subCollections}
            onOpenCollection={(id) => setSelection({ kind: "collection", id })}
            onOpenBookmark={(b) => setDetail(b)}
          onDeleteBookmark={handleDeleteBookmark}
          onPinBookmark={handlePinBookmark}
          onRefreshPreview={handleRefreshPreview}
          onUploadCustomPreview={handleUploadCustomPreview}
          onClearCustomPreview={handleClearCustomPreview}
          onTagClick={handleTagClick}
          cardMinWidth={cardMinWidth}
          loading={loadingBookmarks}
            emptyLabel={
              search || activeTag
                ? `No bookmarks match ${[search && `"${search}"`, activeTag && `#${activeTag}`]
                    .filter(Boolean)
                    .join(" + ")}.`
                : selection.kind === "unsorted"
                ? "Nothing unsorted — nice."
                : selection.kind === "pinned"
                ? "No pinned bookmarks yet."
                : "No bookmarks here yet."
            }
          />
        </section>
        <div className="size-control" aria-label="Preview size">
          <span className="size-glyph size-glyph-sm" aria-hidden="true" />
          <input
            className="size-slider"
            type="range"
            min={MIN_CARD_WIDTH}
            max={MAX_CARD_WIDTH}
            step={20}
            value={cardMinWidth}
            onChange={(event) => setCardMinWidth(Number(event.target.value))}
            aria-label="Preview size"
            title="Preview size"
          />
          <span className="size-glyph size-glyph-lg" aria-hidden="true" />
        </div>
      </main>

      {showAdd && (
        <AddBookmarkModal
          existingBookmarks={allBookmarks}
          flat={flat}
          tree={tree}
          defaultCollectionId={defaultCollectionForAdd}
          onCreateCollection={handleCreateCollection}
          onClose={() => setShowAdd(false)}
          onCreated={handleBookmarkCreated}
        />
      )}

      {detail && (
        <BookmarkDetail
          key={detail.id}
          bookmark={detail}
          existingBookmarks={allBookmarks}
          flat={flat}
          tree={tree}
          onCreateCollection={handleCreateCollection}
          onClose={() => setDetail(null)}
          onSaved={handleBookmarkSaved}
          onPatched={handleBookmarkPatched}
          onDeleted={handleBookmarkDeleted}
        />
      )}

      {toast && (
        <AISuggestionToast
          bookmark={toast.bookmark}
          suggestion={toast.suggestion}
          flat={flat}
          onCreateCollection={handleCreateCollection}
          onCreateAndMove={handleCreateAndMoveFromToast}
          onMove={handleMoveFromToast}
          onDismiss={() => setToast(null)}
        />
      )}

      {dropStatus && (
        <div className="drop-status small" role="status">{dropStatus}</div>
      )}

      <DuplicateImportModal
        open={duplicateImportUrls.length > 0}
        urls={duplicateImportUrls}
        onClose={() => setDuplicateImportUrls([])}
        onAddAnyway={async (urls) => {
          await handleDroppedUrls(urls, { allowDuplicates: true });
        }}
      />

      <ConfirmDialog
        open={showDeleteDuplicates}
        title="Delete duplicate bookmarks?"
        description={`This will remove ${duplicateSummary.duplicateCount} older duplicate bookmark${duplicateSummary.duplicateCount === 1 ? "" : "s"} across ${duplicateSummary.duplicateGroupCount} URL group${duplicateSummary.duplicateGroupCount === 1 ? "" : "s"}, and keep the newest saved copy of each.`}
        confirmLabel="Delete duplicates"
        busy={deletingDuplicates}
        onConfirm={handleDeleteDuplicates}
        onCancel={() => setShowDeleteDuplicates(false)}
      />

      <style jsx>{`
        .app {
          display: flex;
          height: 100dvh;
          width: 100vw;
          max-width: 100%;
          overflow-x: hidden;
        }
        .main {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          background: var(--color-bg);
          overflow-x: hidden;
          position: relative;
        }
        .size-control {
          position: absolute;
          left: 16px;
          bottom: 16px;
          z-index: 6;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 6px 12px;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: color-mix(in srgb, var(--color-bg) 88%, transparent);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          opacity: 0.55;
          transition: opacity 140ms ease, border-color 140ms ease;
        }
        .size-control:hover,
        .size-control:focus-within {
          opacity: 1;
          border-color: var(--color-border-strong);
        }
        .size-glyph {
          display: inline-block;
          border: 1.5px solid var(--color-text-muted);
          border-radius: 3px;
          background: transparent;
          flex-shrink: 0;
        }
        .size-glyph-sm {
          width: 10px;
          height: 8px;
        }
        .size-glyph-lg {
          width: 16px;
          height: 12px;
        }
        .size-slider {
          appearance: none;
          -webkit-appearance: none;
          width: 120px;
          height: 18px;
          background: transparent;
          cursor: pointer;
          margin: 0;
        }
        .size-slider::-webkit-slider-runnable-track {
          height: 2px;
          background: var(--color-border-strong);
          border-radius: 2px;
        }
        .size-slider::-moz-range-track {
          height: 2px;
          background: var(--color-border-strong);
          border-radius: 2px;
        }
        .size-slider::-webkit-slider-thumb {
          appearance: none;
          -webkit-appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 999px;
          background: var(--color-text);
          border: none;
          margin-top: -5px;
          cursor: pointer;
        }
        .size-slider::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 999px;
          background: var(--color-text);
          border: none;
          cursor: pointer;
        }
        .size-slider:focus-visible {
          outline: none;
        }
        @media (max-width: 768px) {
          .size-control {
            display: none;
          }
        }
        .sidebar-resizer {
          width: 10px;
          margin-left: -5px;
          margin-right: -5px;
          cursor: col-resize;
          position: relative;
          z-index: 3;
          flex-shrink: 0;
        }
        .sidebar-resizer::before {
          content: "";
          position: absolute;
          inset: 0;
        }
        .sidebar-resizer::after {
          content: "";
          position: absolute;
          top: 0;
          bottom: 0;
          left: 50%;
          width: 1px;
          transform: translateX(-50%);
          background: transparent;
          transition: background 120ms ease;
        }
        .sidebar-resizer:hover::after,
        .sidebar-resizer.active::after {
          background: var(--color-border-strong);
        }
        .top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          height: 54px;
          padding: 0 20px;
          border-bottom: 1px solid var(--color-border);
          box-sizing: border-box;
        }
        .top-row {
          min-width: 0;
          display: flex;
          align-items: center;
        }
        .top-row-primary {
          flex: 1 1 auto;
          min-width: 0;
        }
        .top-row-secondary {
          flex: 0 0 auto;
        }
        .mobile-menu-btn {
          display: none;
        }
        @media (min-width: 769px) {
          .mobile-menu-btn,
          .mobile-actions {
            display: none !important;
          }
        }
        @media (max-width: 768px) {
          .mobile-menu-btn {
            display: inline-flex;
            margin-right: 8px;
          }
          .sidebar-resizer {
            display: none;
          }
          :global(.sidebar) {
            position: fixed;
            inset: 0;
            width: 100% !important;
            max-width: 100%;
            z-index: 100;
            transform: translateX(-100%);
            transition: transform 200ms ease;
          }
          .mobile-sidebar-open :global(.sidebar) {
            transform: translateX(0);
          }
        }
        .crumbs {
          display: flex;
          align-items: center;
          gap: 4px;
          min-width: 0;
          overflow: hidden;
          flex: 1 1 auto;
        }
        .crumb-back {
          width: 32px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          color: var(--color-text-muted);
          flex-shrink: 0;
          font-size: 16px;
          line-height: 1;
        }
        .crumb-back:hover {
          color: var(--color-text);
          border-color: var(--color-border-strong);
        }
        .crumb {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          white-space: nowrap;
          min-width: 0;
        }
        .crumb-link {
          font-size: 12px;
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
        }
        .current.crumb-link {
          max-width: 100%;
        }
        .crumb-label {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .crumb-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--color-text-muted);
          flex-shrink: 0;
        }
        .current .crumb-icon { color: var(--color-text); }
        .current { font-weight: 500; }
        .ancestor { color: var(--color-text-muted); }
        .crumb-link:hover {
          color: var(--color-text);
        }
        .sep { color: var(--color-text-faint); font-size: 12px; }
        .top-right {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          flex-shrink: 0;
        }
        .desktop-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .mobile-actions {
          display: none;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .mobile-search-row {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
        }
        .mobile-search-input {
          flex: 1 1 auto;
          min-width: 0;
          height: 32px;
          padding: 0 12px;
          border-radius: 999px;
          border: 1px solid var(--color-border);
          background: var(--color-bg-secondary);
          font-size: 13px;
        }
        .circle-btn {
          width: 32px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          color: var(--color-text);
          background: var(--color-bg);
          font-size: 16px;
          line-height: 1;
          flex-shrink: 0;
        }
        .circle-btn-primary {
          background: var(--color-text);
          color: var(--color-bg);
          border-color: var(--color-text);
        }
        .session-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          padding: 0 0 0 10px;
          height: 28px;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: var(--color-bg-secondary);
        }
        .session-email {
          font-size: 12px;
          color: var(--color-text-muted);
          max-width: 180px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .session-signout {
          height: 100%;
          padding: 0 10px;
          border-left: 1px solid var(--color-border);
          color: var(--color-text);
          font-size: 12px;
          border-radius: 0 999px 999px 0;
        }
        .session-signout:hover {
          background: var(--color-bg-hover);
        }
        .tag-filter {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 4px 6px 4px 10px;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: var(--color-bg-secondary);
          max-width: 220px;
        }
        .tag-filter-label {
          font-size: 12px;
          color: var(--color-text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .tag-filter-clear {
          width: 18px;
          height: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          color: var(--color-text-muted);
          flex-shrink: 0;
        }
        .tag-filter-clear:hover {
          color: var(--color-text);
          background: color-mix(in srgb, var(--color-bg) 80%, transparent);
        }
        .search input {
          width: 200px;
          height: 30px;
          padding: 6px 10px;
          line-height: 1.2;
          font-size: 12px;
        }
        @media (max-width: 1080px) {
          .session-chip {
            display: none;
          }
        }
        .content {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          min-height: 0;
          padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 20px);
        }
        @media (max-width: 768px) {
          .main {
            overflow-y: auto;
            overflow-x: hidden;
            height: 100dvh;
          }
          .content {
            overflow: visible;
            flex: 0 0 auto;
            min-height: 0;
            padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 96px);
          }
          .top {
            position: sticky;
            top: 0;
            z-index: 30;
            background: var(--color-bg);
            padding: calc(env(safe-area-inset-top, 0px) + 8px) 12px 8px;
            gap: 10px;
          }
          .crumbs {
            min-width: 0;
            gap: 6px;
          }
          .crumb:not(:last-of-type) {
            display: none;
          }
          .crumb {
            flex: 1 1 auto;
            min-width: 0;
          }
          .crumb-link,
          .current.crumb-link {
            width: 100%;
          }
          .sep {
            display: none;
          }
          .tag-filter {
            max-width: min(48vw, 180px);
          }
          .desktop-actions {
            display: none;
          }
          .mobile-actions {
            display: flex;
          }
          .top.top-searching .top-row-primary {
            display: none;
          }
          .top.top-searching .top-row-secondary {
            flex: 1 1 auto;
            min-width: 0;
          }
          .top.top-searching .mobile-actions {
            width: 100%;
          }
        }
        .load-error {
          margin: 14px 20px 0;
          padding: 8px 10px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          color: var(--color-text-muted);
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .load-error-msg {
          flex: 1;
          overflow-wrap: anywhere;
        }
        .load-error-dismiss {
          flex-shrink: 0;
          width: 22px;
          height: 22px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          line-height: 1;
          color: var(--color-text-muted);
          border-radius: 4px;
        }
        .load-error-dismiss:hover {
          color: var(--color-text);
          background: var(--color-bg-hover);
        }
        .drop-status {
          position: fixed;
          left: 50%;
          bottom: 24px;
          transform: translateX(-50%);
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: 999px;
          padding: 6px 14px;
          color: var(--color-text-muted);
          z-index: 70;
        }
      `}</style>
    </div>
    </DropZone>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function findNode(tree: Collection[], id: string): Collection | null {
  for (const c of tree) {
    if (c.id === id) return c;
    if (c.children) {
      const found = findNode(c.children, id);
      if (found) return found;
    }
  }
  return null;
}

function pathToCollections(
  tree: Collection[],
  id: string,
  trail: { id: string; name: string; icon: string | null }[] = []
): { id: string; name: string; icon: string | null }[] | null {
  for (const c of tree) {
    const next = [...trail, { id: c.id, name: c.name, icon: c.icon }];
    if (c.id === id) return next;
    if (c.children) {
      const p = pathToCollections(c.children, id, next);
      if (p) return p;
    }
  }
  return null;
}

function sortPinnedFirst(bookmarks: Bookmark[]): Bookmark[] {
  // Stable partition: pinned first, preserve relative order within each group.
  const pinned: Bookmark[] = [];
  const rest: Bookmark[] = [];
  for (const b of bookmarks) (b.pinned ? pinned : rest).push(b);
  return [...pinned, ...rest];
}

function filterBookmarks(bookmarks: Bookmark[], search: string, activeTag: string | null): Bookmark[] {
  const query = search.trim().toLowerCase();
  const normalizedTag = activeTag?.trim().toLowerCase() ?? "";
  if (!query && !normalizedTag) return bookmarks;

  return bookmarks.filter((bookmark) => {
    const haystacks = [
      bookmark.title ?? "",
      bookmark.url,
      bookmark.description ?? "",
      ...(bookmark.tags ?? []),
    ];

    const matchesQuery = !query || haystacks.some((value) => value.toLowerCase().includes(query));
    const matchesTag =
      !normalizedTag ||
      (bookmark.tags ?? []).some((tag) => tag.toLowerCase() === normalizedTag);

    return matchesQuery && matchesTag;
  });
}

function annotateCounts(tree: Collection[], bookmarks: Bookmark[]): Collection[] {
  const counts = new Map<string, number>();
  for (const b of bookmarks) {
    if (!b.collection_id) continue;
    counts.set(b.collection_id, (counts.get(b.collection_id) ?? 0) + 1);
  }
  const walk = (nodes: Collection[]): Collection[] =>
    nodes.map((n) => ({
      ...n,
      bookmark_count: counts.get(n.id) ?? 0,
      children: n.children ? walk(n.children) : undefined,
    }));
  return walk(tree);
}
