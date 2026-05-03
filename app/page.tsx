"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { List, MagnifyingGlass, Plus, SquaresFour } from "@phosphor-icons/react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import type { Bookmark, Collection, AISuggestion, SmartCollection } from "@/lib/types";
import { api, canonicalBookmarkUrl, type CustomPreviewSource } from "@/lib/api";
import { evaluateFilter } from "@/lib/smart-collections";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  computeCollectionBookmarkCounts,
  computeGlobalTagCounts,
  computeSmartCollectionCounts,
  computeTotals,
  type BookmarkTotals,
} from "@/lib/bookmark-summaries";
import Sidebar from "./components/Sidebar";
import CollectionIcon from "./components/CollectionIcon";
import SubcollectionRow from "./components/SubcollectionRow";
import BookmarkGrid from "./components/BookmarkGrid";
import AddBookmarkModal from "./components/AddBookmarkModal";
import BookmarkDetail from "./components/BookmarkDetail";
import AISuggestionToast from "./components/AISuggestionToast";
import DropZone from "./components/DropZone";
import DuplicateImportModal from "./components/DuplicateImportModal";
import AuthScreen from "./components/AuthScreen";
import ConfirmDialog from "./components/ConfirmDialog";
import SettingsModal from "./components/SettingsModal";
import SharingModal from "./components/SharingModal";
import TriageOverlay from "./components/TriageOverlay";
import SmartCollectionBuilderModal from "./components/SmartCollectionBuilderModal";
import CreateCollectionModal from "./components/CreateCollectionModal";
import {
  isNative as isNativeShell,
  NATIVE_REDIRECT,
  openOAuthUrl,
  runOAuthInAuthSession,
} from "@/lib/capacitor-bridge";

type Selection =
  | { kind: "all" }
  | { kind: "unsorted" }
  | { kind: "pinned" }
  | { kind: "broken" }
  | { kind: "collection"; id: string }
  | { kind: "smart_collection"; id: string };

export default function Home() {
  const MIN_SIDEBAR_WIDTH = 180;
  const MAX_SIDEBAR_WIDTH = 420;

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [sendingAuthLink, setSendingAuthLink] = useState(false);
  const [signingInWithGoogle, setSigningInWithGoogle] = useState(false);

  // Library bootstrap state: counts and sidebar summaries are seeded from the
  // server, then kept in sync locally as bookmarks mutate.
  const [allBookmarks, setAllBookmarks] = useState<Bookmark[]>([]);
  const allBookmarksRef = useRef<Bookmark[]>([]);
  const [treeRaw, setTreeRaw] = useState<Collection[]>([]);
  const [bookmarkCountsHydrated, setBookmarkCountsHydrated] = useState(false);
  const [collectionBookmarkCounts, setCollectionBookmarkCounts] = useState<Record<string, number>>(
    {}
  );
  const tree = useMemo(
    () => annotateCounts(treeRaw, collectionBookmarkCounts, bookmarkCountsHydrated),
    [treeRaw, collectionBookmarkCounts, bookmarkCountsHydrated]
  );
  const [flat, setFlat] = useState<Collection[]>([]);
  const [smartCollections, setSmartCollections] = useState<SmartCollection[]>([]);
  const smartCollectionsRef = useRef<SmartCollection[]>([]);
  const [totals, setTotals] = useState<BookmarkTotals>({
    all: 0,
    unsorted: 0,
    pinned: 0,
    broken: 0,
  });
  const [globalTagCounts, setGlobalTagCounts] = useState<Record<string, number>>({});
  const [smartCollectionCounts, setSmartCollectionCounts] = useState<Record<string, number>>({});
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [selection, setSelection] = useState<Selection>({ kind: "all" });
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  // Tags in the sidebar are scoped to the current selection: in a specific
  // collection we only surface tags actually attached to bookmarks in that
  // collection. "All bookmarks" shows the full set.
  const selectionBookmarks = useMemo(() => {
    if (selection.kind === "all") return allBookmarks;
    if (selection.kind === "unsorted")
      return allBookmarks.filter((b) => b.collection_id === null);
    if (selection.kind === "pinned")
      return allBookmarks.filter((b) => b.pinned);
    if (selection.kind === "broken")
      return allBookmarks.filter((b) => b.link_status === "broken");
    if (selection.kind === "collection")
      return allBookmarks.filter((b) => b.collection_id === selection.id);
    if (selection.kind === "smart_collection") {
      const sc = smartCollections.find((s) => s.id === selection.id);
      if (sc) return allBookmarks.filter((b) => evaluateFilter(b, sc.query_json));
      return [];
    }
    return allBookmarks;
  }, [allBookmarks, selection, smartCollections]);

  const tagCounts = useMemo(() => {
    if (selection.kind === "all") return globalTagCounts;

    const counts: Record<string, number> = {};
    for (const bookmark of selectionBookmarks) {
      for (const tag of bookmark.tags ?? []) {
        counts[tag] = (counts[tag] ?? 0) + 1;
      }
    }
    return counts;
  }, [globalTagCounts, selection.kind, selectionBookmarks]);

  const allTags = useMemo(
    () => Object.keys(tagCounts).sort((a, b) => a.localeCompare(b)),
    [tagCounts]
  );

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("sidebarOpen");
    return saved !== null ? saved === "true" : true;
  });
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const [sidebarWidth, setSidebarWidth] = useState(220);
  const CARD_SIZES = ["s", "m", "l", "xl"] as const;
  type CardSize = (typeof CARD_SIZES)[number];
  const CARD_SIZE_PX: Record<CardSize, number> = {
    s: 220,
    m: 300,
    l: 380,
    xl: 480,
  };
  // Mobile column counts: S = 3 across, M = 2 across, L/XL = 1 across.
  const CARD_SIZE_COLS: Record<CardSize, number> = {
    s: 3,
    m: 2,
    l: 1,
    xl: 1,
  };
  const [cardSize, setCardSize] = useState<CardSize>("m");
  const cardMinWidth = CARD_SIZE_PX[cardSize];
  const cardCols = CARD_SIZE_COLS[cardSize];
  useEffect(() => {
    console.log("Grid updated:", { cardSize, cardMinWidth, cardCols });
  }, [cardSize, cardMinWidth, cardCols]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastClickedIdRef = useRef<string | null>(null);
  const [showBulkMovePicker, setShowBulkMovePicker] = useState(false);
  const [bulkMoveSearch, setBulkMoveSearch] = useState("");
  const [bulkMoveBusy, setBulkMoveBusy] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [bulkTagBusy, setBulkTagBusy] = useState(false);
  const [resizingSidebar, setResizingSidebar] = useState(false);
  const [loadingBookmarks, setLoadingBookmarks] = useState(false);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sharingCollection, setSharingCollection] = useState<Collection | null>(null);
  const [triageOpen, setTriageOpen] = useState(false);
  const [smartBuilderOpen, setSmartBuilderOpen] = useState(false);
  const [editSmartCollection, setEditSmartCollection] = useState<SmartCollection | null>(null);
  const [showCreateCollection, setShowCreateCollection] = useState(false);

  // Listen for smart collection builder events from Sidebar.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOpen = () => {
      setEditSmartCollection(null);
      setSmartBuilderOpen(true);
    };
    const onEdit = (e: Event) => {
      setEditSmartCollection((e as CustomEvent).detail as SmartCollection);
      setSmartBuilderOpen(true);
    };
    const onNewCollection = () => setShowCreateCollection(true);
    window.addEventListener("savers:open-smart-builder", onOpen);
    window.addEventListener("savers:edit-smart-collection", onEdit);
    window.addEventListener("savers:new-collection", onNewCollection);
    return () => {
      window.removeEventListener("savers:open-smart-builder", onOpen);
      window.removeEventListener("savers:edit-smart-collection", onEdit);
      window.removeEventListener("savers:new-collection", onNewCollection);
    };
  }, []);

  // Honor the ?triage=1 query param (used by the legacy /triage URL
  // which now redirects here).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("triage") === "1") {
      setTriageOpen(true);
      params.delete("triage");
      const next = params.toString();
      const newUrl = `${window.location.pathname}${next ? `?${next}` : ""}`;
      window.history.replaceState({}, "", newUrl);
    }
  }, []);

  // Reflect activeTag in the URL as ?tag=... for shareable links.
  const suppressTagUrlWrite = useRef(false);
  const suppressCollectionUrlWrite = useRef(false);

  // Read ?collection= from URL on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const coll = params.get("collection");
    if (coll) {
      suppressCollectionUrlWrite.current = true;
      if (coll === "unsorted") {
        setSelection({ kind: "unsorted" });
      } else if (coll === "pinned") {
        setSelection({ kind: "pinned" });
      } else {
        setSelection({ kind: "collection", id: coll });
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tag = params.get("tag");
    if (tag) {
      suppressTagUrlWrite.current = true;
      setActiveTag(tag);
      // Only go global if a collection wasn't also requested
      if (!params.get("collection")) {
        setSelection({ kind: "all" });
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (suppressTagUrlWrite.current) {
      suppressTagUrlWrite.current = false;
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (activeTag) {
      params.set("tag", activeTag);
    } else {
      params.delete("tag");
    }
    const next = params.toString();
    const newUrl = `${window.location.pathname}${next ? `?${next}` : ""}`;
    window.history.replaceState({}, "", newUrl);
  }, [activeTag]);

  // Sync selection to ?collection= in URL
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (suppressCollectionUrlWrite.current) {
      suppressCollectionUrlWrite.current = false;
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (selection.kind === "collection") {
      params.set("collection", selection.id);
    } else if (selection.kind === "unsorted") {
      params.set("collection", "unsorted");
    } else if (selection.kind === "pinned") {
      params.set("collection", "pinned");
    } else {
      params.delete("collection");
    }
    const next = params.toString();
    const newUrl = `${window.location.pathname}${next ? `?${next}` : ""}`;
    window.history.replaceState({}, "", newUrl);
  }, [selection]);

  // Handle ?savers_ref=public_<id> from shared collection pages.
  const importAttemptedRef = useRef(false);

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
  // (We previously registered an appUrlOpen handler for savers:// URLs,
  // but ASWebAuthenticationSession now captures the OAuth callback
  // natively, so the deep-link handler is no longer needed and can race
  // with the in-app flow.)

  // Persist sidebar state and sync from localStorage on mount.
  useEffect(() => {
    localStorage.setItem("sidebarOpen", String(sidebarOpen));
  }, [sidebarOpen]);

  // Refs let the touch listeners read current state without re-attaching.
  const sidebarOpenRef = useRef(sidebarOpen);
  useEffect(() => {
    sidebarOpenRef.current = sidebarOpen;
  }, [sidebarOpen]);

  const swipeContextRef = useRef({
    selectionKind: selection.kind,
    showAdd: false,
    detailOpen: false,
  });
  useEffect(() => {
    swipeContextRef.current = {
      selectionKind: selection.kind,
      showAdd,
      detailOpen: detail !== null,
    };
  }, [selection, showAdd, detail]);

  // Edge-swipe gestures:
  //   • Swipe right from the left edge → open the sidebar.
  //   • Swipe left while the sidebar is open → close the sidebar.
  //   • On the All-bookmarks view, swipe left from the right edge → open the
  //     Add Bookmark modal (only when no other modal is already up).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    if (!isTouch) return;

    const EDGE_PX = 24; // how close to the edge a swipe must start to open
    const OPEN_THRESHOLD = 60; // horizontal px to register an open gesture
    const CLOSE_THRESHOLD = 60; // horizontal px to register a close gesture
    const SLOP = 18; // vertical wiggle allowed before we treat as a scroll

    let startX = 0;
    let startY = 0;
    let tracking: "open-left" | "close-left" | "open-add" | null = null;

    function onStart(event: TouchEvent) {
      if (event.touches.length !== 1) {
        tracking = null;
        return;
      }
      const t = event.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      const isSidebarOpen = sidebarOpenRef.current;
      const ctx = swipeContextRef.current;
      const viewportWidth = window.innerWidth;

      if (isSidebarOpen) {
        tracking = "close-left";
      } else if (startX <= EDGE_PX) {
        tracking = "open-left";
      } else if (
        startX >= viewportWidth - EDGE_PX &&
        ctx.selectionKind === "all" &&
        !ctx.showAdd &&
        !ctx.detailOpen
      ) {
        tracking = "open-add";
      } else {
        tracking = null;
      }
    }

    function onMove(event: TouchEvent) {
      if (!tracking) return;
      const t = event.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      // Cancel if the user is mostly scrolling vertically.
      if (Math.abs(dy) > SLOP && Math.abs(dy) > Math.abs(dx)) {
        tracking = null;
        return;
      }

      if (tracking === "open-left" && dx > OPEN_THRESHOLD) {
        setSidebarOpen(true);
        tracking = null;
      } else if (tracking === "close-left" && dx < -CLOSE_THRESHOLD) {
        setSidebarOpen(false);
        tracking = null;
      } else if (tracking === "open-add" && dx < -OPEN_THRESHOLD) {
        setShowAdd(true);
        tracking = null;
      }
    }

    function onEnd() {
      tracking = null;
    }

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  const updateAllBookmarksState = useCallback(
    (updater: (prev: Bookmark[]) => Bookmark[]) => {
      const next = updater(allBookmarksRef.current);
      allBookmarksRef.current = next;
      setAllBookmarks(next);
      setTotals(computeTotals(next));
      setGlobalTagCounts(computeGlobalTagCounts(next));
      setSmartCollectionCounts(computeSmartCollectionCounts(next, smartCollectionsRef.current));
      setCollectionBookmarkCounts(computeCollectionBookmarkCounts(next));
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
    smartCollectionsRef.current = [];
    setBookmarkCountsHydrated(false);
    setAllBookmarks([]);
    setBookmarks([]);
    setTreeRaw([]);
    setFlat([]);
    setSmartCollections([]);
    setTotals({ all: 0, unsorted: 0, pinned: 0, broken: 0 });
    setGlobalTagCounts({});
    setSmartCollectionCounts({});
    setCollectionBookmarkCounts({});
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
    const raw = window.localStorage.getItem("savers.grid.cardSize");
    if (raw && (CARD_SIZES as readonly string[]).includes(raw)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCardSize(raw as CardSize);
    }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("savers.grid.cardSize", cardSize);
  }, [cardSize]);

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

  const loadSmartCollections = useCallback(async () => {
    try {
      const data = await api.listSmartCollections();
      smartCollectionsRef.current = data.smart_collections;
      setSmartCollections(data.smart_collections);
      setSmartCollectionCounts(
        computeSmartCollectionCounts(allBookmarksRef.current, data.smart_collections)
      );
    } catch (e) {
      // Smart collections are non-critical; don't set a blocking error.
      console.error("Failed to load smart collections:", e);
    }
  }, []);

  const loadAllBookmarks = useCallback(async () => {
    try {
      const { bookmarks } = await api.listBookmarks();
      allBookmarksRef.current = bookmarks;
      setAllBookmarks(bookmarks);
      setBookmarkCountsHydrated(true);
      setTotals(computeTotals(bookmarks));
      setGlobalTagCounts(computeGlobalTagCounts(bookmarks));
      setSmartCollectionCounts(
        computeSmartCollectionCounts(bookmarks, smartCollectionsRef.current)
      );
      setCollectionBookmarkCounts(computeCollectionBookmarkCounts(bookmarks));
      setLoadError(null);
      return bookmarks;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load bookmarks");
    }
    return null;
  }, []);

  const loadBootstrap = useCallback(async () => {
    try {
      const data = await api.bootstrap();
      setTreeRaw(data.collections);
      setFlat(data.flat);
      smartCollectionsRef.current = data.smart_collections;
      setSmartCollections(data.smart_collections);
      allBookmarksRef.current = data.bookmarks;
      setAllBookmarks(data.bookmarks);
      setBookmarkCountsHydrated(true);
      setTotals(data.summaries.totals);
      setGlobalTagCounts(data.summaries.globalTagCounts);
      setSmartCollectionCounts(data.summaries.smartCollectionCounts);
      setCollectionBookmarkCounts(data.summaries.collectionBookmarkCounts);
      setLoadError(null);
      return data.bookmarks;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load library data");
    }
    return null;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !user) return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("savers_ref");
    if (!ref?.startsWith("public_")) return;

    params.delete("savers_ref");
    const next = params.toString();
    const newUrl = `${window.location.pathname}${next ? `?${next}` : ""}`;
    window.history.replaceState({}, "", newUrl);

    const publicId = ref.slice("public_".length);
    if (importAttemptedRef.current) return;
    importAttemptedRef.current = true;

    fetch("/api/public/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_id: publicId }),
    })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? "Import failed");
        return json as { collection_id: string; already_owned: boolean };
      })
      .then(({ collection_id }) => {
        setSelection({ kind: "collection", id: collection_id });
        void loadBootstrap();
      })
      .catch(() => {});
  }, [user, loadBootstrap]);

  const refreshFromServer = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoadingBookmarks(true);
      try {
        await loadBootstrap();
      } finally {
        if (showLoading) setLoadingBookmarks(false);
      }
    },
    [loadBootstrap]
  );

  // Initial load
  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;

    (async () => {
      setLoadingBookmarks(true);
      try {
        await loadBootstrap();
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
  }, [authLoading, user, loadBootstrap]);

  // Load bookmarks for the current view (with debounced search)
  const searchTimer = useRef<number | null>(null);
  useEffect(() => {
    if (authLoading || !user || !initialDataLoaded) return;
    const syncVisibleBookmarks = () => {
      const scoped = allBookmarksRef.current.filter((bookmark) => {
        if (selection.kind === "unsorted") return bookmark.collection_id === null;
        if (selection.kind === "pinned") return bookmark.pinned;
        if (selection.kind === "broken") return bookmark.link_status === "broken";
        if (selection.kind === "collection") return bookmark.collection_id === selection.id;
        if (selection.kind === "smart_collection") {
          const sc = smartCollections.find((s) => s.id === selection.id);
          if (sc) return evaluateFilter(bookmark, sc.query_json);
          return false;
        }
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
  }, [authLoading, user, allBookmarks, selection, search, activeTag, initialDataLoaded, smartCollections]);

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

  useEffect(() => {
    if (!detail) return;
    const fresh = allBookmarks.find((bookmark) => bookmark.id === detail.id);
    if (!fresh) {
      setDetail(null);
      return;
    }
    if (fresh !== detail) {
      setDetail(fresh);
    }
  }, [allBookmarks, detail]);

  // Poll for pending screenshots so previews update in real time
  // without requiring a page reload.
  useEffect(() => {
    if (!user || !initialDataLoaded) return;

    const hasPending = () =>
      allBookmarksRef.current.some(
        (b) => b.screenshot_status === "pending" || b.screenshot_status === "processing"
      );

    if (!hasPending()) return;

    const POLL_MS = 4000;
    const timer = setInterval(async () => {
      if (!hasPending()) {
        clearInterval(timer);
        return;
      }
      try {
        const fresh = await api.listBookmarks();
        const freshById = new Map(fresh.bookmarks.map((b) => [b.id, b]));
        updateAllBookmarksState((prev) =>
          prev.map((b) => {
            const updated = freshById.get(b.id);
            return updated ?? b;
          })
        );
        // Re-check if we still have pending bookmarks
        if (!fresh.bookmarks.some(
          (b) => b.screenshot_status === "pending" || b.screenshot_status === "processing"
        )) {
          clearInterval(timer);
        }
      } catch {
        // Silently retry on next interval
      }
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [user, initialDataLoaded, updateAllBookmarksState]);

  // Esc to exit edit mode, Cmd/Ctrl+A to select all visible
  useEffect(() => {
    if (!isEditMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsEditMode(false);
        setSelectedIds(new Set());
        lastClickedIdRef.current = null;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        // Don't prevent default — let the browser text-selection behavior
        // happen if the user is in an input, but if the target is a card or
        // the body, select all visible bookmarks instead.
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        setSelectedIds(new Set(bookmarks.map((b) => b.id)));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isEditMode, bookmarks]);

  // Collection paths for the bulk move picker (same logic as CollectionPicker)
  const collectionPaths = useMemo(() => {
    const byId = new Map(flat.map((c) => [c.id, c]));
    const cache = new Map<string, string>();
    function resolve(id: string): string {
      if (cache.has(id)) return cache.get(id)!;
      const c = byId.get(id);
      if (!c) return "";
      const p = c.parent_id ? `${resolve(c.parent_id)} / ${c.name}` : c.name;
      cache.set(id, p);
      return p;
    }
    for (const c of flat) resolve(c.id);
    return cache;
  }, [flat]);

  const bulkMoveCollections = useMemo(() => {
    const sorted = [...flat].sort((a, b) =>
      (collectionPaths.get(a.id) || "").localeCompare(collectionPaths.get(b.id) || "")
    );
    if (!bulkMoveSearch.trim()) return sorted;
    const needle = bulkMoveSearch.toLowerCase();
    return sorted.filter((c) =>
      (collectionPaths.get(c.id) || "").toLowerCase().includes(needle)
    );
  }, [flat, collectionPaths, bulkMoveSearch]);

  const bulkDepthMap = useMemo(() => {
    const byId = new Map(flat.map((c) => [c.id, c]));
    const depths = new Map<string, number>();
    for (const c of flat) {
      let depth = 0;
      let cur: Collection | undefined = c;
      while (cur?.parent_id) {
        depth++;
        cur = byId.get(cur.parent_id);
        if (!cur) break;
      }
      depths.set(c.id, depth);
    }
    return depths;
  }, [flat]);

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
    if (selection.kind === "broken") {
      return [
        { label: "All bookmarks", icon: null, isCollection: false, selection: { kind: "all" } as Selection },
        { label: "Broken links", icon: null, isCollection: false, selection: { kind: "broken" } as Selection },
      ];
    }
    if (selection.kind === "smart_collection") {
      const sc = smartCollections.find((s) => s.id === selection.id);
      return [
        { label: "All bookmarks", icon: null, isCollection: false, selection: { kind: "all" } as Selection },
        { label: sc?.name ?? "Smart Collection", icon: sc?.icon, isCollection: false, selection: { kind: "smart_collection", id: selection.id } as Selection },
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
  }, [selection, tree, smartCollections]);
  const canGoBack = breadcrumbItems.length > 1;

  const defaultCollectionForAdd =
    selection.kind === "collection" ? selection.id : null;

  function navigateBack() {
    if (!canGoBack) return;
    setSelection(breadcrumbItems[breadcrumbItems.length - 2].selection);
  }

  function handleCardTagClick(tag: string) {
    setActiveTag(tag);
  }

  function handleSidebarTagClick(tag: string | null) {
    if (tag === null) {
      setActiveTag(null);
    } else {
      setSelection({ kind: "all" });
      setActiveTag(tag);
    }
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
      await loadBootstrap();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  async function handleCreateSmartCollection(payload: {
    name: string;
    icon?: string | null;
    query_json: SmartCollection["query_json"];
  }): Promise<SmartCollection> {
    const { smart_collection } = await api.createSmartCollection(payload);
    await loadSmartCollections();
    return smart_collection;
  }

  async function handleUpdateSmartCollection(
    id: string,
    updates: Partial<Pick<SmartCollection, "name" | "icon" | "query_json">>
  ): Promise<SmartCollection> {
    const { smart_collection } = await api.updateSmartCollection(id, updates);
    await loadSmartCollections();
    return smart_collection;
  }

  async function handleDeleteSmartCollection(id: string) {
    try {
      await api.deleteSmartCollection(id);
      if (selection.kind === "smart_collection" && selection.id === id) {
        setSelection({ kind: "all" });
      }
      await loadSmartCollections();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete smart collection");
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
      if (selection.kind === "broken" && b.link_status !== "broken") {
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

  function handleBookmarkMoved(id: string, targetCollectionId: string | null) {
    updateAllBookmarksState((prev) =>
      prev.map((x) => (x.id === id ? { ...x, collection_id: targetCollectionId } : x))
    );
    if (selection.kind === "unsorted" && targetCollectionId !== null) {
      setBookmarks((prev) => prev.filter((x) => x.id !== id));
    } else if (selection.kind === "collection" && selection.id !== targetCollectionId) {
      setBookmarks((prev) => prev.filter((x) => x.id !== id));
    }
  }

  async function handleDeleteBookmark(id: string) {
    try {
      await api.deleteBookmark(id);
      handleBookmarkDeleted(id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await api.deleteBookmarks(ids);
      for (const id of ids) handleBookmarkDeleted(id);
      setSelectedIds(new Set());
      setIsEditMode(false);
      lastClickedIdRef.current = null;
      setDropStatus(`${ids.length} deleted.`);
      setTimeout(() => setDropStatus(null), 3000);
    } catch (e) {
      setDropStatus(`Delete failed: ${e instanceof Error ? e.message : "unknown"}`);
      setTimeout(() => setDropStatus(null), 5000);
    }
  }

  async function handleBulkMove(collectionId: string | null) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkMoveBusy(true);
    try {
      await api.moveBookmarks(ids, collectionId);
      for (const id of ids) handleBookmarkMoved(id, collectionId);
      setSelectedIds(new Set());
      setIsEditMode(false);
      lastClickedIdRef.current = null;
      setShowBulkMovePicker(false);
      setBulkMoveSearch("");
      const label = collectionId ? collectionPaths.get(collectionId) ?? "collection" : "Unsorted";
      setDropStatus(`${ids.length} moved to ${label}.`);
      setTimeout(() => setDropStatus(null), 3000);
    } catch (e) {
      setDropStatus(`Move failed: ${e instanceof Error ? e.message : "unknown"}`);
      setTimeout(() => setDropStatus(null), 5000);
    } finally {
      setBulkMoveBusy(false);
    }
  }

  async function handleBulkAddTags() {
    const tag = bulkTagInput.trim().toLowerCase();
    if (!tag) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkTagBusy(true);
    try {
      await api.bulkTagBookmarks(ids, "add_tags", [tag]);
      setBulkTagInput("");
      setDropStatus(`Added #${tag} to ${ids.length} bookmark${ids.length === 1 ? "" : "s"}.`);
      setTimeout(() => setDropStatus(null), 3000);
      loadAllBookmarks();
    } catch (e) {
      setDropStatus(`Tag failed: ${e instanceof Error ? e.message : "unknown"}`);
      setTimeout(() => setDropStatus(null), 5000);
    } finally {
      setBulkTagBusy(false);
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

  function handleGeneratedPreviewsQueued(ids: string[]) {
    if (ids.length === 0) return;
    const queuedIds = new Set(ids);
    updateAllBookmarksState((prev) =>
      prev.map((bookmark) =>
        queuedIds.has(bookmark.id)
          ? {
              ...bookmark,
              screenshot_status: "pending",
              screenshot_error: null,
            }
          : bookmark,
      ),
    );
    setBookmarks((prev) =>
      prev.map((bookmark) =>
        queuedIds.has(bookmark.id)
          ? {
              ...bookmark,
              screenshot_status: "pending",
              screenshot_error: null,
            }
          : bookmark,
      ),
    );
    setDetail((prev) =>
      prev && queuedIds.has(prev.id)
        ? {
            ...prev,
            screenshot_status: "pending",
            screenshot_error: null,
          }
        : prev,
    );
    setDropStatus(
      `Refreshing ${ids.length} generated preview${ids.length === 1 ? "" : "s"} in the background.`,
    );
    window.setTimeout(() => setDropStatus(null), 3200);
  }

  async function handleUploadCustomPreview(id: string, source: CustomPreviewSource) {
    const { bookmark } = await api.uploadCustomPreview(id, source);
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
    let remaining = total;

    setDropStatus(`${remaining} remaining`);

    for (const url of urls) {
      const canonical = canonicalBookmarkUrl(url);
      if (!allowDuplicates && existingCanonical.has(canonical)) {
        duplicates.push(url);
        remaining -= 1;
        setDropStatus(`${remaining} remaining`);
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
      remaining -= 1;
      setDropStatus(`${remaining} remaining`);
    }

    if (createdBatch.length > 0) {
      handleBookmarksCreated(createdBatch);
    }

    const dupCount = duplicates.length;
    const dupSuffix = dupCount > 0 ? ` ${dupCount} duplicate${dupCount === 1 ? "" : "s"} skipped.` : "";
    if (failCount > 0 && okCount === 0 && dupCount === 0) {
      setDropStatus(`Save failed: ${lastError ?? "unknown error"}`);
    } else if (failCount > 0) {
      setDropStatus(`${okCount} saved, ${failCount} failed.${dupSuffix}`);
    } else if (okCount === 0 && dupCount > 0) {
      setDropStatus(
        dupCount === 1 ? "Already saved — nothing imported." : `${dupCount} duplicates — nothing new imported.`
      );
    } else {
      setDropStatus(`All bookmarks saved.${dupSuffix}`);
    }
    if (dupCount > 0) {
      setDuplicateImportUrls(duplicates);
    }
    setTimeout(() => setDropStatus(null), failCount > 0 || dupCount > 0 ? 5000 : 3000);
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

      // Inside the iOS shell, route the callback through our custom URL
      // scheme so the email link comes back into the app. On desktop, use
      // the normal https callback.
      const emailRedirectTo = isNativeShell()
        ? NATIVE_REDIRECT
        : `${redirectBase}/auth/callback`;

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo,
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

      // On iOS Capacitor, Google blocks OAuth inside WKWebView. Route the
      // OAuth flow through SFSafariViewController and have Supabase return
      // via savers://auth/callback (handled by registerAuthDeepLinkHandler).
      const native = isNativeShell();
      const redirectTo = native
        ? NATIVE_REDIRECT
        : `${redirectBase}/auth/callback?next=/`;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          skipBrowserRedirect: true,
          redirectTo,
        },
      });

      if (error) {
        throw error;
      }

      if (!data?.url) {
        throw new Error("Google sign-in did not return a redirect URL.");
      }

      const oauthUrl = new URL(data.url);
      oauthUrl.searchParams.set("redirect_to", redirectTo);

      if (native) {
        // iOS: run inside ASWebAuthenticationSession so the redirect to
        // savers://auth/callback is captured natively.
        const callbackUrl = await runOAuthInAuthSession(
          oauthUrl.toString(),
          "savers"
        );
        if (!callbackUrl) {
          // User cancelled the auth sheet.
          setSigningInWithGoogle(false);
          return;
        }
        const callback = new URL(callbackUrl);
        const code = callback.searchParams.get("code");
        if (!code) {
          throw new Error("Auth callback missing code parameter.");
        }
        // Exchange the code for a session client-side. The Supabase JS
        // client has the PKCE verifier in localStorage and writes the
        // session into the WebView's cookie jar via @supabase/ssr.
        // Capacitor's WebView blocks the cross-route navigation we'd need
        // for the server-side /auth/callback path, so we do it here.
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          throw exchangeError;
        }
        // Reload so the rest of the app picks up the new session.
        window.location.replace("/");
        return;
      }

      await openOAuthUrl(oauthUrl.toString());
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
      className={`app ${!sidebarOpen ? "sidebar-closed" : ""} ${sidebarOpen ? "mobile-sidebar-open" : ""}`}
      data-savers-app
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <Sidebar
        tree={tree}
        flatCollections={flat}
        allBookmarks={allBookmarks}
        totals={totals}
        allTags={allTags}
        tagCounts={tagCounts}
        activeTag={activeTag}
        userEmail={user.email}
        userAvatarUrl={(user.user_metadata as Record<string, unknown> | undefined)?.avatar_url as string | undefined || undefined}
        onTagClick={handleSidebarTagClick}
        selection={selection}
        onSelect={(s) => {
          setSelection(s);
          setActiveTag(null);
          if (typeof window !== "undefined" && window.innerWidth <= 768) {
            setSidebarOpen(false);
          }
        }}
        onCreateCollection={handleCreateCollection}
        onRenameCollection={handleRenameCollection}
        onDeleteCollection={handleDeleteCollection}
        onChangeCollectionIcon={handleChangeCollectionIcon}
        onReorderCollections={handleReorderCollections}
        onReparentCollection={handleReparentCollection}
        onShareCollection={(c) => setSharingCollection(c)}
        onOpenTriage={() => setTriageOpen(true)}
        onSignOut={handleSignOut}
        onOpenSettings={() => setShowSettings(true)}
        onCloseMobile={() => setSidebarOpen(false)}
        smartCollections={smartCollections}
        smartCollectionCounts={smartCollectionCounts}
        onCreateSmartCollection={handleCreateSmartCollection}
        onEditSmartCollection={handleUpdateSmartCollection}
        onDeleteSmartCollection={handleDeleteSmartCollection}
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
                className="circle-btn sidebar-toggle-btn"
                onClick={() => setSidebarOpen((prev) => !prev)}
                aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
                aria-expanded={sidebarOpen}
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
                    {selection.kind !== "all" && (
                      <>
                        <span className="tag-filter-sep" />
                        <button
                          className="tag-filter-scope"
                          onClick={() => setSelection({ kind: "all" })}
                          title={`Show all ${globalTagCounts[activeTag] ?? 0} bookmarks tagged #${activeTag}`}
                        >
                          all
                        </button>
                      </>
                    )}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="top-row top-row-secondary">
            <div className="top-right">
              <div className="desktop-actions">
                <div className="session-chip" title={user.email ?? "Signed in"}>
                  {(function() {
                    const meta = user.user_metadata as Record<string, unknown> | undefined;
                    const avatarUrl = (meta?.avatar_url || meta?.picture) as string | undefined;
                    if (avatarUrl) {
                      return <img className="session-avatar" src={avatarUrl} alt={user.email ?? ""} referrerPolicy="no-referrer" />;
                    }
                    return <span className="session-email">{user.email ?? "Signed in"}</span>;
                  })()}
                  <button
                    className="session-signout"
                    onClick={() => setShowSettings(true)}
                  >
                    Settings
                  </button>
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
          {subCollections.length > 0 && (
            <SubcollectionRow
              subs={subCollections}
              activeId={selection.kind === "collection" ? selection.id : null}
              onSelect={(id) => setSelection({ kind: "collection", id })}
            />
          )}
          <BookmarkGrid
            bookmarks={bookmarks}
            onOpenBookmark={(b) => setDetail(b)}
            onDeleteBookmark={handleDeleteBookmark}
            onPatchBookmark={handleBookmarkPatched}
            onPinBookmark={handlePinBookmark}
            onRefreshPreview={handleRefreshPreview}
            onUploadCustomPreview={handleUploadCustomPreview}
          onClearCustomPreview={handleClearCustomPreview}
          onTagClick={handleCardTagClick}
          cardMinWidth={cardMinWidth}
          cardCols={cardCols}
          loading={loadingBookmarks}
          isEditMode={isEditMode}
          selectedIds={selectedIds}
          onToggleSelect={(id, shiftKey) => {
            setSelectedIds((prev) => {
              const next = new Set(prev);
              if (shiftKey && lastClickedIdRef.current) {
                const fromIdx = bookmarks.findIndex((b) => b.id === lastClickedIdRef.current);
                const toIdx = bookmarks.findIndex((b) => b.id === id);
                if (fromIdx !== -1 && toIdx !== -1) {
                  const [start, end] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
                  for (let i = start; i <= end; i++) {
                    next.add(bookmarks[i].id);
                  }
                }
              } else {
                if (next.has(id)) next.delete(id);
                else next.add(id);
              }
              lastClickedIdRef.current = id;
              return next;
            });
          }}
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
        <div className="bottom-bar">
          {isEditMode && selectedIds.size > 0 && (
            <div className="bulk-actions">
              <span className="bulk-count">{selectedIds.size} selected</span>
              <div className="bulk-tag-wrap">
                <input
                  className="bulk-tag-input"
                  placeholder="Add tag…"
                  value={bulkTagInput}
                  disabled={bulkTagBusy}
                  onChange={(e) => setBulkTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleBulkAddTags();
                    }
                  }}
                />
                <button
                  className="btn"
                  disabled={bulkTagBusy || !bulkTagInput.trim()}
                  onClick={() => handleBulkAddTags()}
                >
                  Tag
                </button>
              </div>
              <div className="bulk-move-wrap">
                <button
                  className="btn"
                  onClick={() => {
                    setShowBulkMovePicker((v) => !v);
                    setBulkMoveSearch("");
                  }}
                  disabled={bulkMoveBusy}
                >
                  {bulkMoveBusy ? "Moving…" : `Move ${selectedIds.size}`}
                </button>
                {showBulkMovePicker && (
                  <div
                    className="bulk-move-panel"
                    onMouseLeave={() => setShowBulkMovePicker(false)}
                  >
                    <input
                      autoFocus
                      className="bulk-move-search"
                      placeholder="Find collection…"
                      value={bulkMoveSearch}
                      onChange={(e) => setBulkMoveSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setShowBulkMovePicker(false);
                          setBulkMoveSearch("");
                        }
                        if (e.key === "Enter" && bulkMoveCollections.length > 0) {
                          e.preventDefault();
                          handleBulkMove(bulkMoveCollections[0].id);
                        }
                      }}
                    />
                    <div className="bulk-move-list">
                      <button
                        className="bulk-move-opt"
                        onClick={() => handleBulkMove(null)}
                      >
                        Unsorted
                      </button>
                      {bulkMoveCollections.map((c) => {
                        const depth = bulkDepthMap.get(c.id) ?? 0;
                        const isChild = depth > 0;
                        return (
                          <button
                            key={c.id}
                            className={`bulk-move-opt ${isChild ? "bulk-move-opt-child" : ""}`}
                            style={{ paddingLeft: isChild ? `${8 + depth * 16}px` : undefined }}
                            onClick={() => handleBulkMove(c.id)}
                            title={collectionPaths.get(c.id)}
                          >
                            <span className="bulk-move-opt-icon">
                              <CollectionIcon name={c.icon} size={12} />
                            </span>
                            <span className="bulk-move-opt-label">
                              {isChild ? c.name : collectionPaths.get(c.id)}
                            </span>
                          </button>
                        );
                      })}
                      {bulkMoveCollections.length === 0 && (
                        <div className="bulk-move-empty">No collections match.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <button
                className="btn btn-ghost danger"
                onClick={() => setConfirmBulkDelete(true)}
              >
                Delete {selectedIds.size}
              </button>
              <button
                className="btn"
                onClick={() => {
                  setIsEditMode(false);
                  setSelectedIds(new Set());
                  lastClickedIdRef.current = null;
                }}
              >
                Cancel
              </button>
            </div>
          )}
          {dropStatus && (
            <div className="drop-status small" role="status">{dropStatus}</div>
          )}
          <div className="bottom-row">
            <div className="size-control" role="radiogroup" aria-label="Preview size">
            {CARD_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                role="radio"
                aria-checked={cardSize === size}
                className={`size-btn size-btn-${size} ${cardSize === size ? "size-btn-active" : ""}`}
                onClick={() => setCardSize(size)}
                title={`${size.toUpperCase()} previews`}
              >
                {size.toUpperCase()}
              </button>
            ))}
            </div>
            <button
              className={`edit-toggle-btn ${isEditMode ? "edit-toggle-active" : ""}`}
              onClick={() => {
                setIsEditMode((v) => !v);
                setSelectedIds(new Set());
                lastClickedIdRef.current = null;
              }}
              title={isEditMode ? "Exit edit mode" : "Edit mode"}
              aria-label={isEditMode ? "Exit edit mode" : "Edit mode"}
            >
              <SquaresFour size={14} weight={isEditMode ? "fill" : "regular"} />
            </button>
          </div>
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

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        bookmarks={allBookmarks}
        flatCollections={flat}
        onGeneratedPreviewsQueued={handleGeneratedPreviewsQueued}
      />

      <TriageOverlay
        open={triageOpen}
        onClose={() => setTriageOpen(false)}
        onMutated={() => {
          // Refresh local bookmark list after a triage mutation lands.
          void loadAllBookmarks();
        }}
        allTags={allTags}
      />

      <SmartCollectionBuilderModal
        open={smartBuilderOpen}
        onClose={() => {
          setSmartBuilderOpen(false);
          setEditSmartCollection(null);
        }}
        editSmartCollection={editSmartCollection}
        onCreated={() => {
          void loadSmartCollections();
        }}
        onUpdated={() => {
          void loadSmartCollections();
        }}
      />

      <CreateCollectionModal
        open={showCreateCollection}
        onClose={() => setShowCreateCollection(false)}
        onCreated={() => {
          void loadCollections();
        }}
      />

      <SharingModal
        collection={sharingCollection}
        open={sharingCollection !== null}
        onClose={() => setSharingCollection(null)}
        onUpdate={(updated) => {
          setSharingCollection(updated);
          // Reflect the change in our local trees so the sidebar's
          // "public dot" affordance updates without a refresh.
          const patch = (list: Collection[]): Collection[] =>
            list.map((c) =>
              c.id === updated.id
                ? {
                    ...c,
                    is_public: updated.is_public,
                    public_id: updated.public_id,
                    public_slug: updated.public_slug,
                    public_description: updated.public_description,
                  }
                : c.children
                ? { ...c, children: patch(c.children) }
                : c
            );
          setTreeRaw((prev) => patch(prev));
          setFlat((prev) =>
            prev.map((c) =>
              c.id === updated.id
                ? {
                    ...c,
                    is_public: updated.is_public,
                    public_id: updated.public_id,
                    public_slug: updated.public_slug,
                    public_description: updated.public_description,
                  }
                : c
            )
          );
        }}
      />

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

      <ConfirmDialog
        open={confirmBulkDelete}
        title={`Delete ${selectedIds.size} bookmark${selectedIds.size === 1 ? "" : "s"}?`}
        description="This action cannot be undone."
        confirmLabel={`Delete ${selectedIds.size}`}
        onConfirm={() => {
          setConfirmBulkDelete(false);
          handleBulkDelete();
        }}
        onCancel={() => setConfirmBulkDelete(false)}
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
          background: var(--color-bg-page);
          overflow-x: hidden;
          position: relative;
        }
        .bottom-bar {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          bottom: 16px;
          z-index: 6;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }
        .bottom-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .drop-status {
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: 999px;
          padding: 6px 14px;
          color: var(--color-text-muted);
          white-space: nowrap;
        }
        .bulk-actions {
          display: flex;
          gap: 8px;
        }
        .bulk-actions :global(.btn) {
          height: 32px;
          padding: 0 12px;
          font-size: 12px;
          border-radius: 999px;
        }
        .bulk-count {
          font-size: 12px;
          color: var(--color-text-muted);
          display: inline-flex;
          align-items: center;
          white-space: nowrap;
        }
        .bulk-tag-wrap {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .bulk-tag-input {
          width: 100px;
          height: 32px;
          padding: 0 10px;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: var(--color-bg);
          color: var(--color-text);
          font: inherit;
          font-size: 12px;
          line-height: 17px;
        }
        .bulk-tag-input::placeholder {
          color: var(--color-text-muted);
        }
        .bulk-tag-input:focus {
          outline: none;
          border-color: var(--color-border-strong);
        }
        .bulk-move-wrap {
          position: relative;
        }
        .bulk-move-panel {
          position: absolute;
          bottom: 40px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          padding: 6px;
          width: 260px;
          max-height: 280px;
          display: flex;
          flex-direction: column;
          z-index: 71;
        }
        .bulk-move-search {
          font-size: 12px;
          margin-bottom: 4px;
          flex-shrink: 0;
        }
        .bulk-move-list {
          overflow-y: auto;
          min-height: 0;
        }
        .bulk-move-opt {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          text-align: left;
          padding: 5px 8px;
          border-radius: 3px;
          font-size: 12px;
          cursor: pointer;
          background: transparent;
          border: none;
          color: var(--color-text);
        }
        .bulk-move-opt:hover {
          background: var(--color-bg-hover);
        }
        .bulk-move-opt-icon {
          display: inline-flex;
          align-items: center;
          color: var(--color-text-muted);
          flex-shrink: 0;
        }
        .bulk-move-opt-label {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .bulk-move-opt-child .bulk-move-opt-label {
          color: var(--color-text-muted);
        }
        .bulk-move-opt-child:hover .bulk-move-opt-label {
          color: var(--color-text);
        }
        .bulk-move-empty {
          padding: 8px;
          font-size: 12px;
          color: var(--color-text-muted);
        }
        .size-control {
          height: 32px;
          display: inline-flex;
          align-items: stretch;
          padding: 2px;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: var(--color-bg);
          opacity: 0.7;
          transition: opacity 140ms ease, border-color 140ms ease;
        }
        .size-control:hover,
        .size-control:focus-within {
          opacity: 1;
          border-color: var(--color-border-strong);
        }
        .size-btn {
          min-width: 32px;
          padding: 0 10px;
          border: none;
          background: transparent;
          color: var(--color-text-muted);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.02em;
          border-radius: 999px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: background 120ms ease, color 120ms ease;
        }
        .size-btn:hover {
          color: var(--color-text);
        }
        .size-btn-active {
          background: var(--color-text);
          color: var(--color-bg);
        }
        .size-btn-active:hover {
          color: var(--color-bg);
        }
        @media (max-width: 768px) {
          .bottom-bar {
            position: fixed;
            bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
          }
          .size-btn-xl {
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
        .sidebar-toggle-btn {
          display: inline-flex;
          margin-right: 8px;
        }
        @media (min-width: 769px) {
          .mobile-actions {
            display: none !important;
          }
        }
        @media (max-width: 768px) {
          .sidebar-toggle-btn {
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
        /* Desktop: sidebar collapses with smooth width transition. */
        @media (min-width: 769px) {
          :global(.sidebar) {
            transition: width 280ms cubic-bezier(0.4, 0, 0.2, 1),
                        min-width 280ms cubic-bezier(0.4, 0, 0.2, 1),
                        opacity 200ms ease;
          }
          .sidebar-closed :global(.sidebar) {
            width: 0 !important;
            min-width: 0 !important;
            opacity: 0;
            pointer-events: none;
          }
          .sidebar-closed .sidebar-resizer {
            display: none;
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
          font-size: 12px;
          line-height: 17px;
          transition: color 140ms ease, border-color 140ms ease, background 140ms ease, transform 140ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .crumb-back:hover {
          color: var(--color-text);
          border-color: var(--color-border-strong);
        }
        .crumb-back:active {
          transform: scale(0.92);
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
          transition: color 140ms ease;
        }
        .current.crumb-link {
          max-width: 100%;
        }
        .crumb-label {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          position: relative;
        }
        .crumb-label::after {
          content: "";
          position: absolute;
          bottom: -1px;
          left: 0;
          width: 100%;
          height: 1px;
          background: var(--color-text);
          transform: scaleX(0);
          transform-origin: left;
          transition: transform 200ms ease;
        }
        .crumb-link:hover .crumb-label::after {
          transform: scaleX(1);
        }
        .crumb-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--color-text-muted);
          flex-shrink: 0;
          transition: color 140ms ease;
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
          gap: 12px;
          min-width: 0;
          flex-shrink: 0;
        }
        .desktop-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }
        .edit-toggle-btn {
          width: 30px;
          height: 30px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: var(--color-bg-secondary);
          color: var(--color-text-muted);
          opacity: 0.7;
          transition: border-color 120ms ease, color 120ms ease, background 120ms ease, opacity 140ms ease, transform 140ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .edit-toggle-btn:active {
          transform: scale(0.92);
        }
        .edit-toggle-btn:hover,
        .edit-toggle-active {
          opacity: 1;
        }
        .edit-toggle-btn:hover {
          color: var(--color-text);
          border-color: var(--color-border-strong);
          background: var(--color-bg-hover);
        }
        .edit-toggle-active {
          color: var(--color-text);
          background: var(--color-bg-active);
        }
        .mobile-actions {
          display: none;
          align-items: center;
          gap: 12px;
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
          font-size: 12px;
        }
        /* .circle-btn and .circle-btn-primary are now in globals.css */
        .session-chip {
          display: inline-flex;
          align-items: center;
          min-width: 0;
          padding: 0 0 0 8px;
          height: 30px;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: var(--color-bg-secondary);
          overflow: hidden;
        }
        .session-email {
          font-size: 12px;
          color: var(--color-text-muted);
          max-width: 180px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          padding: 0 6px 0 10px;
        }
        .session-avatar {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          object-fit: cover;
          margin-right: 5px;
          flex-shrink: 0;
        }
        .session-signout {
          height: 100%;
          padding: 0 10px;
          border-left: 1px solid var(--color-border);
          color: var(--color-text);
          font-size: 12px;
          transition: background 140ms ease;
        }
        .session-signout:last-of-type {
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
        .tag-filter-sep {
          width: 1px;
          height: 14px;
          background: var(--color-border-strong);
          flex-shrink: 0;
        }
        .tag-filter-scope {
          font-size: 12px;
          color: var(--color-text-muted);
          padding: 0 2px;
          flex-shrink: 0;
        }
        .tag-filter-scope:hover {
          color: var(--color-text);
        }
        .search input {
          width: 200px;
          height: 30px;
          padding: 6px 10px;
          line-height: 17px;
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
            padding: calc(env(safe-area-inset-top, 0px) + 8px) 16px 8px;
            gap: 12px;
            display: flex;
            align-items: center;
            min-height: calc(env(safe-area-inset-top, 0px) + 54px);
            border-bottom: 1px solid var(--color-border);
            box-sizing: border-box;
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
          font-size: 12px;
          line-height: 17px;
          color: var(--color-text-muted);
          border-radius: 4px;
        }
        .load-error-dismiss:hover {
          color: var(--color-text);
          background: var(--color-bg-hover);
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

function annotateCounts(
  tree: Collection[],
  counts: Record<string, number>,
  useLocalCounts: boolean
): Collection[] {
  const walk = (nodes: Collection[]): Collection[] =>
    nodes.map((n) => ({
      ...n,
      bookmark_count: useLocalCounts ? (counts[n.id] ?? 0) : (n.bookmark_count ?? 0),
      children: n.children ? walk(n.children) : undefined,
    }));
  return walk(tree);
}
