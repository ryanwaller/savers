"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import TagManagerModal from "./TagManagerModal";
import { Funnel, Pin, Unlink } from "lucide-react";
import type { Bookmark, Collection, FeedSubscription, ImageCollection, SmartCollection } from "@/lib/types";
import { useCollectionExpansionState } from "@/hooks/useCollectionExpansionState";
import CollectionIcon from "./CollectionIcon";
import IconPicker from "./IconPicker";
import ExportBookmarksButton from "./ExportBookmarksButton";

const ICON_PICKER_WIDTH = 280;
const ICON_PICKER_HEIGHT = 360;
const VIEWPORT_PAD = 8;

/** Place a 280×360 popover near an anchor rect without overflowing the viewport. */
function placePicker(rect: DOMRect): { top: number; left: number } {
  const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
  const vh = typeof window === "undefined" ? 768 : window.innerHeight;
  let left = rect.left;
  let top = rect.bottom + 6;
  if (left + ICON_PICKER_WIDTH > vw - VIEWPORT_PAD) {
    left = Math.max(VIEWPORT_PAD, vw - ICON_PICKER_WIDTH - VIEWPORT_PAD);
  }
  if (top + ICON_PICKER_HEIGHT > vh - VIEWPORT_PAD) {
    // Flip above the anchor if there's room; otherwise clamp.
    const above = rect.top - ICON_PICKER_HEIGHT - 6;
    top = above > VIEWPORT_PAD ? above : Math.max(VIEWPORT_PAD, vh - ICON_PICKER_HEIGHT - VIEWPORT_PAD);
  }
  return { top, left };
}

type Selection =
  | { kind: "all" }
  | { kind: "unsorted" }
  | { kind: "pinned" }
  | { kind: "broken" }
  | { kind: "collection"; id: string }
  | { kind: "smart_collection"; id: string }
  | { kind: "feed"; id: string }
  // Images surface — kept in sync with the same union in app/page.tsx.
  | { kind: "images_all" }
  | { kind: "images_unsorted" }
  | { kind: "image_collection"; id: string };

type Props = {
  tree: Collection[];
  flatCollections: Collection[];
  allBookmarks: Bookmark[];
  totals: { all: number; unsorted: number; pinned: number; broken: number };
  allTags: string[];
  tagCounts: Record<string, number>;
  activeTag: string | null;
  userEmail?: string | null;
  userAvatarUrl?: string | null;
  onTagClick: (tag: string | null) => void;
  onTagsChanged?: () => void;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onCreateCollection: (name: string, parentId: string | null) => Promise<Collection>;
  onRenameCollection: (id: string, name: string) => Promise<void>;
  onDeleteCollection: (id: string) => Promise<void>;
  onChangeCollectionIcon: (id: string, iconName: string | null) => Promise<void>;
  onReorderCollections: (ids: string[]) => Promise<void>;
  onReparentCollection: (id: string, newParentId: string | null) => Promise<void>;
  onShareCollection?: (collection: Collection) => void;
  onShareImageCollection?: (collection: ImageCollection) => void;
  onOpenTriage?: () => void;
  onSignOut?: () => void | Promise<void>;
  onOpenSettings?: () => void;
  onCloseMobile?: () => void;
  smartCollections?: SmartCollection[];
  smartCollectionCounts?: Record<string, number>;
  feedSubscriptions?: FeedSubscription[];
  feedCounts?: Record<string, number>;
  onCreateSmartCollection?: (payload: {
    name: string;
    icon?: string | null;
    query_json: SmartCollection["query_json"];
  }) => Promise<SmartCollection>;
  onEditSmartCollection?: (
    id: string,
    updates: Partial<Pick<SmartCollection, "name" | "icon" | "query_json">>
  ) => Promise<SmartCollection>;
  onDeleteSmartCollection?: (id: string) => Promise<void>;
  onChangeFeedIcon?: (id: string, icon: string | null) => Promise<void>;
  onRenameFeed?: (id: string, name: string) => Promise<void>;
  onDeleteFeed?: (id: string) => Promise<void>;
  // Image collections (folders under the Images supergroup).
  imageCollections?: ImageCollection[];
  unsortedImageCount?: number;
  onUpdateImageCollection?: (id: string, updates: { name?: string; icon?: string | null }) => Promise<void> | void;
  onDeleteImageCollection?: (id: string) => Promise<void> | void;
  /** Mode toggle: which tree to render below the toggle pill. */
  sidebarMode?: "links" | "images";
  onSwitchSidebarMode?: (next: "links" | "images") => void;
};

export default function Sidebar({
  tree,
  flatCollections,
  allBookmarks,
  totals,
  allTags,
  tagCounts,
  activeTag,
  userEmail,
  userAvatarUrl,
  onTagClick,
  selection,
  onSelect,
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection,
  onChangeCollectionIcon,
  onReorderCollections,
  onReparentCollection,
  onShareCollection,
  onShareImageCollection,
  onOpenTriage,
  onSignOut,
  onOpenSettings,
  onCloseMobile,
  smartCollections = [],
  smartCollectionCounts = {},
  feedSubscriptions,
  feedCounts = {},
  onCreateSmartCollection,
  onEditSmartCollection,
  onDeleteSmartCollection,
  onChangeFeedIcon,
  onRenameFeed,
  onDeleteFeed,
  onTagsChanged,
  imageCollections = [],
  unsortedImageCount = 0,
  onUpdateImageCollection,
  onDeleteImageCollection,
  sidebarMode = "links",
  onSwitchSidebarMode,
}: Props) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [collectionsExpanded, setCollectionsExpanded] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const raw = window.localStorage.getItem("savers.sidebar.collectionsExpanded");
      if (raw === "false") return false;
    } catch { /* ignore */ }
    return true;
  });
  useEffect(() => {
    try { window.localStorage.setItem("savers.sidebar.collectionsExpanded", String(collectionsExpanded)); } catch { /* ignore */ }
  }, [collectionsExpanded]);

  const [smartCollectionsExpanded, setSmartCollectionsExpanded] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const raw = window.localStorage.getItem("savers.sidebar.smartCollectionsExpanded");
      if (raw === "false") return false;
    } catch { /* ignore */ }
    return true;
  });
  useEffect(() => {
    try { window.localStorage.setItem("savers.sidebar.smartCollectionsExpanded", String(smartCollectionsExpanded)); } catch { /* ignore */ }
  }, [smartCollectionsExpanded]);

  const [feedsExpanded, setFeedsExpanded] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const raw = window.localStorage.getItem("savers.sidebar.feedsExpanded");
      if (raw === "false") return false;
    } catch { /* ignore */ }
    return true;
  });
  useEffect(() => {
    try { window.localStorage.setItem("savers.sidebar.feedsExpanded", String(feedsExpanded)); } catch { /* ignore */ }
  }, [feedsExpanded]);

  // Supergroup expansion — wraps the existing Feeds/Collections/Smart
  // Collections trio inside a single "Links" toggle, and adds a parallel
  // "Images" toggle for the new image-collection tree (folder CRUD comes
  // online later in the build).
  const [linksExpanded, setLinksExpanded] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const raw = window.localStorage.getItem("savers.sidebar.linksExpanded");
      if (raw === "false") return false;
    } catch { /* ignore */ }
    return true;
  });
  useEffect(() => {
    try { window.localStorage.setItem("savers.sidebar.linksExpanded", String(linksExpanded)); } catch { /* ignore */ }
  }, [linksExpanded]);

  const [imagesExpanded, setImagesExpanded] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const raw = window.localStorage.getItem("savers.sidebar.imagesExpanded");
      if (raw === "false") return false;
    } catch { /* ignore */ }
    return true;
  });
  useEffect(() => {
    try { window.localStorage.setItem("savers.sidebar.imagesExpanded", String(imagesExpanded)); } catch { /* ignore */ }
  }, [imagesExpanded]);

  const [smartMenuOpen, setSmartMenuOpen] = useState<string | null>(null);

  const [tagsExpanded, setTagsExpanded] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const raw = window.localStorage.getItem("savers.sidebar.tagsExpanded");
      if (raw === "false") return false;
    } catch { /* ignore */ }
    return true;
  });
  useEffect(() => {
    try { window.localStorage.setItem("savers.sidebar.tagsExpanded", String(tagsExpanded)); } catch { /* ignore */ }
  }, [tagsExpanded]);
  const [tagSortOrder, setTagSortOrder] = useState<'alphabetical' | 'count'>('alphabetical');
  const [showTagManager, setShowTagManager] = useState(false);
  const [rootNestHover, setRootNestHover] = useState(false);
  const rootNestTimerRef = useRef<number | null>(null);

  function clearRootNestTimer() {
    if (rootNestTimerRef.current !== null) {
      window.clearTimeout(rootNestTimerRef.current);
      rootNestTimerRef.current = null;
    }
  }

  // True when the dragged collection can actually be promoted to root
  // (i.e., it isn't already a root-level item).
  const canDragToRoot = useMemo(() => {
    if (!draggedId) return false;
    return !tree.some((c) => c.id === draggedId);
  }, [draggedId, tree]);

  useEffect(() => {
    if (!draggedId) {
      clearRootNestTimer();
      setRootNestHover(false);
    }
    return clearRootNestTimer;
  }, [draggedId]);

  const { isExpanded, toggle: toggleExpanded, expandAll, syncWithValidIds } =
    useCollectionExpansionState();

  // Prune stale collection IDs from persisted state when tree changes
  const allCollectionIds = useMemo(() => {
    const ids = new Set<string>();
    const walk = (nodes: Collection[]) => {
      for (const n of nodes) {
        ids.add(n.id);
        if (n.children) walk(n.children);
      }
    };
    walk(tree);
    return ids;
  }, [tree]);

  useEffect(() => {
    syncWithValidIds(allCollectionIds);
  }, [allCollectionIds, syncWithValidIds]);

  const sortedTags = useMemo(() => {
    const tags = [...allTags];
    if (tagSortOrder === 'count') {
      return tags.sort((a, b) => (tagCounts[b] ?? 0) - (tagCounts[a] ?? 0));
    }
    return tags.sort((a, b) => a.localeCompare(b));
  }, [allTags, tagCounts, tagSortOrder]);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  // Set of ids the dragged collection cannot be nested into (itself + descendants).
  const blockedNestIds = useMemo(() => {
    const blocked = new Set<string>();
    if (!draggedId) return blocked;
    const collect = (nodes: Collection[]): boolean => {
      for (const n of nodes) {
        if (n.id === draggedId) {
          const walk = (node: Collection) => {
            blocked.add(node.id);
            node.children?.forEach(walk);
          };
          walk(n);
          return true;
        }
        if (n.children && collect(n.children)) return true;
      }
      return false;
    };
    collect(tree);
    return blocked;
  }, [draggedId, tree]);

  async function handleDrop(
    e: React.DragEvent,
    targetId: string | null,
    asChild = false
  ) {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      return;
    }

    // Nest the dragged item inside the target (become a sub-collection),
    // or promote it to root when targetId is null.
    if (asChild) {
      if (targetId && blockedNestIds.has(targetId)) {
        setDraggedId(null);
        return;
      }
      setDraggedId(null);
      await onReparentCollection(draggedId, targetId);
      return;
    }

    // Otherwise: reorder siblings at the same level.
    const findSiblings = (nodes: Collection[], id: string): Collection[] | null => {
      if (nodes.find(n => n.id === id)) return nodes;
      for (const node of nodes) {
        if (node.children) {
          const res = findSiblings(node.children, id);
          if (res) return res;
        }
      }
      return null;
    };

    const siblings = findSiblings(tree, draggedId);
    if (!siblings) {
      setDraggedId(null);
      return;
    }

    const newOrder = [...siblings.map(s => s.id)];
    const dragIdx = newOrder.indexOf(draggedId);
    newOrder.splice(dragIdx, 1);

    const dropIdx = targetId ? newOrder.indexOf(targetId) : newOrder.length;
    // Basic logic: if dropped on an item, put it before it.
    newOrder.splice(dropIdx, 0, draggedId);

    setDraggedId(null);
    await onReorderCollections(newOrder);
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="sidebar-brand">
          {/* Match the public Savers mark used on savers.com */}
          <img className="sidebar-brand-mark" src="/savers-mark.svg" alt="" draggable={false} />
          <span>Savers</span>
        </div>
        <button className="circle-btn mobile-close" onClick={onCloseMobile} aria-label="Close menu">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15,6 9,12 15,18" />
          </svg>
        </button>
      </div>

      <div className="sidebar-scroll">
        <div className="sidebar-mode-bar">
          <div className="sidebar-mode-toggle" role="tablist" aria-label="Sidebar mode">
            <button
              role="tab"
              aria-selected={sidebarMode === "links"}
              className={`sidebar-mode-btn ${sidebarMode === "links" ? "on" : ""}`}
              onClick={() => onSwitchSidebarMode?.("links")}
            >
              Links
            </button>
            <button
              role="tab"
              aria-selected={sidebarMode === "images"}
              className={`sidebar-mode-btn ${sidebarMode === "images" ? "on" : ""}`}
              onClick={() => onSwitchSidebarMode?.("images")}
            >
              Images
            </button>
          </div>
        </div>

        {sidebarMode === "links" && (<>
        <div className="sidebar-section">
          {totals.pinned > 0 && (
            <SidebarItem
              label="Pinned"
              leading={<Pin size={14} strokeWidth={2.4} />}
              count={totals.pinned}
              active={selection.kind === "pinned"}
              onClick={() => onSelect({ kind: "pinned" })}
            />
          )}
          <SidebarItem
            label="All bookmarks"
            count={totals.all}
            active={selection.kind === "all" && !activeTag}
            onClick={() => onSelect({ kind: "all" })}
          />
          <div className={`unsorted-row ${totals.unsorted > 0 ? "has-pending" : ""}`}>
            <button
              className={`unsorted-item ${selection.kind === "unsorted" ? "active" : ""}`}
              onClick={() => onSelect({ kind: "unsorted" })}
              title="Unsorted"
            >
              <span className="unsorted-label">Unsorted</span>
              {typeof totals.unsorted === "number" && (
                <span className="unsorted-tail">
                  <span className="unsorted-count">{totals.unsorted}</span>
                  {totals.unsorted > 0 && onOpenTriage && (
                    <button
                      className="unsorted-sort"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenTriage?.();
                        onCloseMobile?.();
                      }}
                    >
                      Sort
                    </button>
                  )}
                </span>
              )}
            </button>
          </div>
          {totals.broken > 0 && (
            <SidebarItem
              label="Broken links"
              leading={<Unlink size={14} strokeWidth={2} />}
              count={totals.broken}
              active={selection.kind === "broken"}
              onClick={() => onSelect({ kind: "broken" })}
            />
          )}
        </div>

        {/* Links/Images supergroup headers were here. With the top
            mode toggle, they were redundant — removed. The internal
            sections (Feeds, Collections, etc.) stay as-is. */}
        {true && (<>
        {/* Feeds */}
        {(feedSubscriptions && feedSubscriptions.length > 0) && (
          <div className="sidebar-section sidebar-section-group">
            <div className="sidebar-divider" />
            <div className="section-header-row">
              <button
                className="sidebar-label collapsible flex-1"
                onClick={() => setFeedsExpanded(!feedsExpanded)}
              >
                <span className="caret">{feedsExpanded ? "▾" : "▸"}</span>
                Feeds
              </button>
              <button
                className="sidebar-new-smart"
                onClick={() => {
                  const event = new CustomEvent("savers:open-settings");
                  window.dispatchEvent(event);
                  onCloseMobile?.();
                }}
                title="Manage feeds"
              >
                +
              </button>
            </div>
            {feedsExpanded && (
              <div className="feed-list">
                {feedSubscriptions.map((fs) => {
                  const isActive = selection.kind === "feed" && selection.id === fs.id;
                  const count = feedCounts?.[fs.id] ?? 0;
                  return (
                    <FeedItem
                      key={fs.id}
                      feed={fs}
                      count={count}
                      isActive={isActive}
                      onSelect={onSelect}
                      onChangeIcon={onChangeFeedIcon}
                      onRename={onRenameFeed}
                      onDelete={onDeleteFeed}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="sidebar-section sidebar-section-group">
          <div className="sidebar-divider" />
          <div className="section-header-row">
            <button
              className={`sidebar-label collapsible flex-1 ${rootNestHover ? "root-nest-target" : ""}`}
              onClick={() => setCollectionsExpanded(!collectionsExpanded)}
              onDragOver={(e) => {
                if (!canDragToRoot) return;
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                if (!rootNestHover && rootNestTimerRef.current === null) {
                  rootNestTimerRef.current = window.setTimeout(() => {
                    setRootNestHover(true);
                    rootNestTimerRef.current = null;
                  }, 600);
                }
              }}
              onDragLeave={() => {
                clearRootNestTimer();
                setRootNestHover(false);
              }}
              onDrop={(e) => {
                const shouldPromote = rootNestHover && canDragToRoot;
                clearRootNestTimer();
                setRootNestHover(false);
                if (shouldPromote) {
                  void handleDrop(e, null, true);
                }
              }}
            >
              <span className="caret">{collectionsExpanded ? "▾" : "▸"}</span>
              Collections
            </button>
            <button
              className="sidebar-new-smart"
              onClick={() => {
                const event = new CustomEvent("savers:new-collection");
                window.dispatchEvent(event);
              }}
              title="New collection"
            >
              +
            </button>
          </div>

          {collectionsExpanded && (
            <>
              {tree.map((c) => (
                <CollectionNode
                  key={c.id}
                  node={c}
                  depth={0}
                  open={isExpanded(c.id)}
                  isCollapsed={(id) => !isExpanded(id)}
                  onToggleOpen={(id) => toggleExpanded(id)}
                  onExpand={(id) => expandAll([id])}
                  selection={selection}
                  onSelect={onSelect}
                  onCreateCollection={onCreateCollection}
                  onRenameCollection={onRenameCollection}
                  onDeleteCollection={onDeleteCollection}
                  onChangeCollectionIcon={onChangeCollectionIcon}
                  onReorderCollections={onReorderCollections}
                  onShareCollection={onShareCollection}
                  draggedId={draggedId}
                  blockedNestIds={blockedNestIds}
                  onDragStart={setDraggedId}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                />
              ))}
              {tree.length === 0 && (
                <div className="sidebar-empty">No collections yet.</div>
              )}
            </>
          )}
        </div>

        {/* Smart Collections */}
        {(smartCollections.length > 0 || onCreateSmartCollection) && (
          <div className="sidebar-section sidebar-section-group">
            <div className="sidebar-divider" />
            <div className="section-header-row">
              <button
                className="sidebar-label collapsible flex-1"
                onClick={() => setSmartCollectionsExpanded(!smartCollectionsExpanded)}
              >
                <span className="caret">{smartCollectionsExpanded ? "▾" : "▸"}</span>
                Smart Collections
              </button>
              {onCreateSmartCollection && (
                <button
                  className="sidebar-new-smart"
                  onClick={() => {
                    // Open builder modal — we'll pass this through page.tsx
                    const event = new CustomEvent("savers:open-smart-builder");
                    window.dispatchEvent(event);
                  }}
                  title="New smart collection"
                >
                  +
                </button>
              )}
            </div>
            {smartCollectionsExpanded && smartCollections.length > 0 && (
              <div className="smart-list">
                {smartCollections.map((sc) => {
                  const isActive =
                    selection.kind === "smart_collection" && selection.id === sc.id;
                  const count = smartCollectionCounts[sc.id] ?? 0;
                  return (
                    <SmartCollectionItem
                      key={sc.id}
                      sc={sc}
                      count={count}
                      isActive={isActive}
                      onSelect={onSelect}
                      onEdit={onEditSmartCollection}
                      onDelete={onDeleteSmartCollection}
                    />
                  );
                })}
              </div>
            )}
            {smartCollectionsExpanded && smartCollections.length === 0 && (
              <div className="sidebar-empty">No smart collections yet.</div>
            )}
          </div>
        )}
        </>)}
        </>)}

        {sidebarMode === "images" && (<>
        {/* Images mode — mirrors the link first-section + Collections
            sub-section markup so the two modes read identically. */}
        <div className="sidebar-section">
          <SidebarItem
            label="All images"
            count={
              imageCollections.reduce((sum, c) => sum + (c.image_count ?? 0), 0) +
              unsortedImageCount
            }
            active={selection.kind === "images_all"}
            onClick={() => onSelect({ kind: "images_all" })}
          />
          <div className={`unsorted-row ${unsortedImageCount > 0 ? "has-pending" : ""}`}>
            <button
              className={`unsorted-item ${selection.kind === "images_unsorted" ? "active" : ""}`}
              onClick={() => onSelect({ kind: "images_unsorted" })}
              title="Unsorted"
            >
              <span className="unsorted-label">Unsorted</span>
              <span className="unsorted-tail">
                <span className="unsorted-count">{unsortedImageCount}</span>
                {unsortedImageCount > 0 && (
                  <button
                    className="unsorted-sort"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.dispatchEvent(new CustomEvent("savers:open-image-triage"));
                      onCloseMobile?.();
                    }}
                  >
                    Sort
                  </button>
                )}
              </span>
            </button>
          </div>
        </div>

        <div className="sidebar-section sidebar-section-group">
          <div className="sidebar-divider" />
          <div className="section-header-row">
            <span className="sidebar-label flex-1">Collections</span>
            <button
              className="sidebar-new-smart"
              onClick={() => {
                const event = new CustomEvent("savers:new-image-collection");
                window.dispatchEvent(event);
              }}
              title="New image collection"
            >
              +
            </button>
          </div>
          {imageCollections.map((c) => (
            <ImageCollectionRow
              key={c.id}
              collection={c}
              active={selection.kind === "image_collection" && selection.id === c.id}
              onSelect={() => onSelect({ kind: "image_collection", id: c.id })}
              onUpdate={
                onUpdateImageCollection
                  ? (updates) => onUpdateImageCollection(c.id, updates)
                  : undefined
              }
              onDelete={
                onDeleteImageCollection ? () => onDeleteImageCollection(c.id) : undefined
              }
              onShare={
                onShareImageCollection ? () => onShareImageCollection(c) : undefined
              }
            />
          ))}
        </div>
        </>)}

        {sidebarMode === "links" && allTags.length > 0 && (
          <div className="sidebar-section sidebar-section-group">
            <div className="sidebar-divider" />
            <div className="section-header-row section-header-row-tags">
              <button
                className="sidebar-label collapsible flex-1"
                onClick={() => setTagsExpanded(!tagsExpanded)}
              >
                <span className="caret">{tagsExpanded ? "▾" : "▸"}</span>
                Tags
              </button>
              <button
                className="tag-sort-btn muted"
                onClick={(e) => {
                  e.stopPropagation();
                  setTagSortOrder(prev => prev === 'alphabetical' ? 'count' : 'alphabetical');
                }}
                title={`Sort by ${tagSortOrder === 'alphabetical' ? 'count' : 'name'}`}
              >
                {tagSortOrder === 'alphabetical' ? 'A→Z' : '#→'}
              </button>
            </div>
            {tagsExpanded && (
              <div className="tag-pills">
                {sortedTags.map((tag) => {
                  const isActive = activeTag === tag;
                  const count = tagCounts[tag] ?? 0;
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={`pill-btn tag-pill ${isActive ? "active" : ""}`}
                      onClick={() =>
                        onTagClick(tag === activeTag ? null : tag)
                      }
                    >
                      <span className="tag-pill-name">{tag}</span>
                      <span className="tag-pill-count">{count}</span>
                    </button>
                  );
                })}
                <button
                  className="pill-btn pill-btn-dashed tag-manage-btn"
                  onClick={() => setShowTagManager(true)}
                >
                  Manage Tags…
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="sidebar-foot">
        <div className="sidebar-foot-row">
          <div className="sidebar-foot-primary">
          </div>

          {onSignOut && (
            <div className="mobile-account-wrap">
              <div className="mobile-session-chip" title={userEmail ?? "Signed in"}>
                {userAvatarUrl ? (
                  <img className="mobile-session-avatar" src={userAvatarUrl} alt={userEmail ?? ""} referrerPolicy="no-referrer" />
                ) : (
                  <span className="mobile-session-email">
                    {userEmail ?? "Signed in"}
                  </span>
                )}
                {onOpenSettings && (
                  <button
                    className="mobile-session-btn"
                    onClick={() => {
                      onOpenSettings();
                      onCloseMobile?.();
                    }}
                  >
                    Settings
                  </button>
                )}
                <button
                  className="mobile-session-btn"
                  onClick={() => {
                    void onSignOut();
                    onCloseMobile?.();
                  }}
                >
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .sidebar {
          width: var(--sidebar-width);
          min-width: var(--sidebar-width);
          height: 100%;
          border-right: 1px solid var(--color-border);
          background: var(--color-bg-secondary);
          display: flex;
          flex-direction: column;
          overflow-x: hidden;
        }
        .sidebar-scroll {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          min-height: 0;
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        .sidebar-head {
          min-height: 54px;
          padding: 0 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid var(--color-border);
          box-sizing: border-box;
        }
        .sidebar-brand {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: -0.01em;
        }
        .sidebar-head-actions {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .mobile-close {
          display: none;
        }
        @media (max-width: 768px) {
          .sidebar-head {
            padding: calc(env(safe-area-inset-top, 0px) + 14px) 16px 14px;
            min-height: calc(env(safe-area-inset-top, 0px) + 60px);
          }
          .sidebar-scroll {
            padding-top: 8px;
          }
          .mobile-close {
            display: inline-flex;
          }
        }
        .sidebar-brand-mark {
          width: 16px;
          height: 16px;
          border-radius: 4px;
          flex-shrink: 0;
          display: block;
        }
        .flex { display: flex; }
        .items-center { align-items: center; }
        .justify-between { justify-content: space-between; }
        .flex-1 { flex: 1; }
        .tag-sort-btn {
          font-size: 12px;
          height: 24px;
          padding: 0 6px;
          border-radius: var(--radius-sm);
          transition: color 120ms ease, background 120ms ease;
        }
        .tag-sort-btn:hover {
          color: var(--color-text);
          background: var(--color-bg-hover);
        }
        .tag-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          padding: 4px 4px 8px;
        }
        .tag-pill {
          gap: 6px;
          padding: 4px 10px;
          background: var(--color-bg-secondary);
          max-width: 100%;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: transform 180ms ease, background 120ms ease, border-color 120ms ease, color 120ms ease;
        }
        .tag-pill:hover {
          transform: translateX(4px);
        }
        .tag-pill.active {
          background: var(--color-text);
          color: var(--color-bg);
          border-color: var(--color-text);
        }
        .tag-pill.active:hover {
          transform: none;
        }
        .tag-pill-name {
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .tag-pill-count {
          font-size: 12px;
          color: var(--color-text-muted);
          font-feature-settings: "tnum" 1;
        }
        .tag-pill.active .tag-pill-count {
          color: var(--color-bg-secondary);
        }
        /* Top-of-sidebar mode toggle — segmented pill that swaps between
           the Links tree and the Images tree. Same shape on both sides
           reads as a context switch rather than two competing sections. */
        .sidebar-mode-bar {
          padding: 6px 10px 4px;
        }
        .sidebar-mode-toggle {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2px;
          padding: 3px;
          background: var(--color-bg-hover);
          border-radius: 999px;
        }
        .sidebar-mode-btn {
          padding: 6px 8px;
          font-size: 12px;
          font-weight: 500;
          color: var(--color-text-muted);
          background: transparent;
          border: none;
          border-radius: 999px;
          cursor: pointer;
          transition: background 140ms ease, color 140ms ease;
        }
        .sidebar-mode-btn:hover { color: var(--color-text); }
        .sidebar-mode-btn.on {
          background: var(--color-bg);
          color: var(--color-text);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
        }
        .sidebar-section-spacer {
          height: 6px;
        }
        .sidebar-section {
          padding: 4px 6px;
          overflow-x: hidden;
        }
        .sidebar-section-group {
          padding-top: 0;
          padding-bottom: 2px;
        }
        .sidebar-label {
          min-height: 30px;
          padding: 0 8px 0 0;
          font-size: 12px;
          color: var(--color-text-muted);
          letter-spacing: 0.01em;
          display: flex;
          align-items: center;
          gap: 4px;
          width: 100%;
          text-align: left;
        }
        .sidebar-label.collapsible {
          cursor: pointer;
          user-select: none;
        }
        .sidebar-label.collapsible:hover {
          color: var(--color-text);
        }
        /* Supergroup labels (Links / Images) sit one level above the
           existing section labels (Feeds, Collections, Smart Collections,
           image folders) — slightly heavier to read as a parent. */
        .sidebar-supergroup-label {
          color: var(--color-text);
          font-weight: 600;
          letter-spacing: 0.02em;
        }
        .sidebar-supergroup-label .caret {
          color: var(--color-text);
          /* Don't inherit the 600 weight from the supergroup label —
             keeps all carets in the sidebar visually identical. */
          font-weight: 400;
        }
        .sidebar-images-all {
          display: flex;
          align-items: center;
          width: calc(100% - 12px);
          margin: 2px 6px;
          padding: 6px 10px 6px 32px;
          background: transparent;
          color: var(--color-text);
          font-size: 13px;
          text-align: left;
          border: none;
          border-radius: var(--radius-sm);
          cursor: pointer;
        }
        .sidebar-images-all:hover { background: var(--color-bg-hover); }
        .sidebar-images-all.active { background: var(--color-bg-active); }
        .sidebar-images-all-row {
          position: relative;
          display: flex;
          align-items: center;
        }
        .sidebar-images-all-row .sidebar-images-all { flex: 1 1 auto; }
        /* Match the link side's .unsorted-sort exactly — anchored to the
           right edge, expands from a 34px nub to its full width on hover
           via clip-path. Uses the same red treatment the link Sort gets
           when there's something to triage. */
        .sidebar-images-sort {
          position: absolute;
          top: 50%;
          right: 0;
          transform: translateY(-50%);
          min-width: 34px;
          height: 22px;
          padding: 0 10px;
          z-index: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: #c62828;
          background: #fce4ec;
          opacity: 0;
          border-radius: 999px;
          border: 0;
          cursor: pointer;
          white-space: nowrap;
          /* Nub stays at the right edge of the row; the pill expands
             leftward to reveal the "Sort" text on hover. Reads better
             than the link-side direction because the right edge is the
             anchor point your eye lands on. */
          clip-path: inset(0 0 0 calc(100% - 34px));
          transition: opacity 140ms ease, clip-path 180ms ease;
        }
        @media (prefers-color-scheme: dark) {
          .sidebar-images-sort {
            background: rgba(198, 40, 40, 0.22);
            color: #ef5350;
          }
        }
        .sidebar-images-all-row:hover .sidebar-images-sort {
          opacity: 1;
          clip-path: inset(0 0 0 0);
        }
        .sidebar-images-sort:hover,
        .sidebar-images-sort:active { opacity: 1; }
        /* .sidebar-image-collection styles live in the ImageCollectionRow
           subcomponent (styled-jsx is scoped per-component). */
        .sidebar-images-empty-cta {
          display: block;
          width: calc(100% - 12px);
          margin: 2px 6px 4px;
          padding: 6px 8px;
          background: transparent;
          color: var(--color-text-muted);
          font-size: 12px;
          text-align: left;
          border: 1px dashed var(--color-border);
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: color 120ms ease, background 120ms ease, border-color 120ms ease;
        }
        .sidebar-images-empty-cta:hover {
          color: var(--color-text);
          background: var(--color-bg-hover);
          border-color: var(--color-text);
        }
        .sidebar-label.root-nest-target {
          color: var(--color-text);
          border-radius: var(--radius-sm);
          box-shadow: inset 0 0 0 2px var(--color-text);
          animation: rootNestPulse 700ms ease-in-out infinite alternate;
        }
        @keyframes rootNestPulse {
          from { box-shadow: inset 0 0 0 2px var(--color-text); }
          to   { box-shadow: inset 0 0 0 2px transparent; }
        }
        .caret {
          width: 22px;
          height: 22px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          line-height: 17px;
          color: var(--color-text-muted);
          flex-shrink: 0;
          transform: translateY(-1px);
        }
        .sidebar-label:hover .caret {
          color: var(--color-text);
        }
        .sidebar-divider {
          height: 1px;
          margin: 6px 10px 8px;
          background: var(--color-border);
        }
        .section-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-height: 30px;
          padding-right: 8px;
        }
        .section-header-row-tags {
          /* No extra left padding — keeps the Tags caret aligned with
             the Links/Images supergroup carets above. */
          padding-left: 0;
        }
        .sidebar-empty {
          padding: 6px 10px 4px;
          font-size: 12px;
          color: var(--color-text-muted);
        }
        .sidebar-foot {
          padding: 8px 8px env(safe-area-inset-bottom, 0px);
          background: inherit;
        }
        .sidebar-foot-row {
          display: block;
        }
        .sidebar-foot-primary {
          min-width: 0;
        }
        .mobile-account-wrap {
          display: none;
        }
        @media (max-width: 768px) {
          .mobile-account-wrap {
            display: flex;
            align-items: center;
            padding: 12px 16px 0;
            gap: 12px;
            border-top: 1px solid var(--color-border);
          }

          .sidebar-foot-row {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 8px;
          }
          .sidebar-foot-primary {
            min-width: 0;
          }
          .mobile-session-chip {
            display: flex;
            align-items: center;
            width: 100%;
            height: 32px;
            border: 1px solid var(--color-border);
            border-radius: 999px;
            background: var(--color-bg-secondary);
            overflow: hidden;
          }
          .mobile-session-email {
            flex: 1 1 auto;
            min-width: 0;
            padding: 0 12px;
            font-size: 12px;
            color: var(--color-text-muted);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .mobile-session-avatar {
            width: 22px;
            height: 22px;
            border-radius: 50%;
            object-fit: cover;
            margin-right: 2px;
            flex-shrink: 0;
          }
          .mobile-session-btn {
            height: 100%;
            padding: 0 14px;
            border: 0;
            border-left: 1px solid var(--color-border);
            background: transparent;
            color: var(--color-text);
            font-size: 12px;
            white-space: nowrap;
            flex-shrink: 0;
          }
          .mobile-session-btn:last-of-type {
            border-radius: 0 999px 999px 0;
          }
          .mobile-session-btn:hover {
            background: var(--color-bg-hover);
          }
        }
        .unsorted-row {
          position: relative;
        }
        .unsorted-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          width: 100%;
          min-width: 0;
          padding: 3px 8px;
          border-radius: var(--radius-sm);
          text-align: left;
          font-size: 12px;
          color: var(--color-text);
          background: transparent;
          border: 0;
          cursor: pointer;
          transition: background 140ms ease, transform 180ms ease;
        }
        .unsorted-item:hover {
          background: var(--color-bg-hover);
          transform: translateX(4px);
        }
        .unsorted-item.active {
          background: var(--color-bg-active);
        }
        .unsorted-item.active:hover {
          transform: none;
        }
        .unsorted-label {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .unsorted-row.has-pending .unsorted-label {
          color: #d13030;
        }
        .unsorted-tail {
          position: relative;
          height: 22px;
          flex-shrink: 0;
        }
        .unsorted-count {
          position: relative;
          z-index: 0;
          min-width: 34px;
          height: 22px;
          padding: 0 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.78);
          background: rgba(0, 0, 0, 0.52);
          border-radius: 999px;
          font-variant-numeric: tabular-nums;
          font-feature-settings: "tnum" 1;
          white-space: nowrap;
          transition: opacity 140ms ease;
        }
        .unsorted-row.has-pending .unsorted-count {
          background: #fce4ec;
          color: #c62828;
        }
        .unsorted-sort {
          position: absolute;
          top: 0;
          right: 0;
          min-width: 34px;
          height: 22px;
          padding: 0 10px;
          z-index: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.78);
          background: rgba(0, 0, 0, 0.52);
          opacity: 0;
          border-radius: 999px;
          border: 0;
          cursor: pointer;
          white-space: nowrap;
          clip-path: inset(0 calc(100% - 34px) 0 0);
          transition: opacity 140ms ease, clip-path 180ms ease;
        }
        .unsorted-row.has-pending .unsorted-sort {
          background: #fce4ec;
          color: #c62828;
        }
        .unsorted-item:hover .unsorted-count { opacity: 0; }
        .unsorted-item:hover .unsorted-sort {
          opacity: 1;
          clip-path: inset(0 0 0 0);
        }
        .unsorted-sort:hover,
        .unsorted-sort:active { opacity: 1; }
        @media (prefers-color-scheme: dark) {
          .unsorted-row.has-pending .unsorted-label {
            color: #ef5350;
          }
          .unsorted-row.has-pending .unsorted-count {
            background: rgba(198, 40, 40, 0.22);
            color: #ef5350;
          }
          .unsorted-row.has-pending .unsorted-sort {
            background: rgba(198, 40, 40, 0.22);
            color: #ef5350;
          }
        }
        @media (prefers-color-scheme: light) {
          .unsorted-count {
            color: rgba(0, 0, 0, 0.72);
            background: rgba(0, 0, 0, 0.12);
          }
          .unsorted-row.has-pending .unsorted-count {
            background: #fce4ec;
            color: #c62828;
          }
          .unsorted-sort {
            color: rgba(0, 0, 0, 0.72);
            background: rgba(0, 0, 0, 0.12);
          }
          .unsorted-row.has-pending .unsorted-sort {
            background: #fce4ec;
            color: #c62828;
          }
        }
        .sidebar-new-smart {
          min-width: 34px;
          height: 22px;
          padding: 0 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: 0;
          background: #fff;
          color: rgba(0, 0, 0, 0.72);
          font-size: 12px;
          line-height: 17px;
          cursor: pointer;
          flex-shrink: 0;
        }
        .sidebar-new-smart:hover {
          background: #f0f0f0;
          color: rgba(0, 0, 0, 0.85);
        }
        @media (prefers-color-scheme: dark) {
          .sidebar-new-smart {
            background: #fff;
            color: rgba(0, 0, 0, 0.72);
          }
          .sidebar-new-smart:hover {
            background: #f0f0f0;
            color: rgba(0, 0, 0, 0.85);
          }
        }
        .smart-list {
          padding: 2px 0 0;
        }
        .feed-list {
          padding: 2px 0 0;
        }
      `}</style>
      <TagManagerModal
        open={showTagManager}
        onClose={() => setShowTagManager(false)}
        allTags={allTags.map((t) => ({ tag: t, count: tagCounts[t] ?? 0 }))}
        onMerged={() => {
          setShowTagManager(false);
          onTagsChanged?.();
        }}
      />
    </aside>
  );
}

function SmartCollectionItem({
  sc,
  count,
  isActive,
  onSelect,
  onEdit,
  onDelete,
}: {
  sc: SmartCollection;
  count: number;
  isActive: boolean;
  onSelect: (s: Selection) => void;
  onEdit?: (id: string, updates: Partial<Pick<SmartCollection, "name" | "icon" | "query_json">>) => Promise<SmartCollection>;
  onDelete?: (id: string) => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [pickingIcon, setPickingIcon] = useState(false);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const iconBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  // Reposition icon picker on resize/scroll while open.
  useEffect(() => {
    if (!pickingIcon) return;
    const reflow = () => {
      const rect = iconBtnRef.current?.getBoundingClientRect();
      if (rect) setPickerPos(placePicker(rect));
    };
    window.addEventListener("resize", reflow);
    window.addEventListener("scroll", reflow, true);
    return () => {
      window.removeEventListener("resize", reflow);
      window.removeEventListener("scroll", reflow, true);
    };
  }, [pickingIcon]);

  const hasMenu = onEdit && onDelete;

  function openIconPicker() {
    const rect = iconBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPickerPos(placePicker(rect));
    setPickingIcon(true);
  }

  return (
    <div className={`smart-item ${isActive ? "active" : ""}`}>
      <button
        className="smart-item-btn"
        onClick={() => onSelect({ kind: "smart_collection", id: sc.id })}
      >
        <button
          ref={iconBtnRef}
          type="button"
          className="smart-item-icon"
          aria-label={`Change icon for ${sc.name}`}
          title="Change icon"
          onClick={(e) => {
            e.stopPropagation();
            if (pickingIcon) {
              setPickingIcon(false);
            } else {
              openIconPicker();
            }
          }}
        >
          <CollectionIcon name={sc.icon} size={14} />
        </button>
        <span className="smart-item-name">{sc.name}</span>
      </button>
      {hasMenu ? (
        <div className={`tail ${menuOpen ? "open" : ""}`}>
          <span className="tail-count">{count}</span>
          <button
            className="more"
            ref={moreRef}
            onClick={(e) => {
              e.stopPropagation();
              const rect = moreRef.current?.getBoundingClientRect();
              if (rect) {
                setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
              }
              setMenuOpen((v) => !v);
            }}
            aria-label="Menu"
          >
            …
          </button>
          {menuOpen && menuPos &&
            createPortal(
              <div
                className="menu"
                ref={menuRef}
                style={{
                  position: "fixed",
                  top: menuPos.top,
                  right: menuPos.right,
                }}
                onMouseLeave={() => setMenuOpen(false)}
              >
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    openIconPicker();
                  }}
                >
                  Change icon
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    const event = new CustomEvent("savers:edit-smart-collection", {
                      detail: sc,
                    });
                    window.dispatchEvent(event);
                  }}
                >
                  Edit
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(sc.id);
                  }}
                >
                  Delete
                </button>
              </div>,
              document.body
            )}
        </div>
      ) : (
        <span className="tail-count">{count}</span>
      )}

      {pickingIcon && pickerPos &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: pickerPos.top,
              left: pickerPos.left,
              zIndex: 1000,
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <IconPicker
              value={sc.icon}
              onPick={async (name) => {
                setPickingIcon(false);
                if (onEdit) await onEdit(sc.id, { icon: name });
              }}
              onClose={() => setPickingIcon(false)}
            />
          </div>,
          document.body
        )}

      <style jsx>{`
        .smart-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 4px;
          padding-right: 8px;
          border-radius: var(--radius-sm);
          transition: transform 180ms ease;
        }
        .smart-item:hover {
          background: var(--color-bg-hover);
          transform: translateX(4px);
        }
        .smart-item.active {
          background: var(--color-bg-active);
          transform: none;
        }
        .smart-item-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          flex: 1 1 auto;
          min-width: 0;
          padding: 3px 8px 3px 26px;
          text-align: left;
          font-size: 12px;
          color: var(--color-text);
          background: transparent;
          border: 0;
          cursor: pointer;
          border-radius: var(--radius-sm);
        }
        .smart-item-icon {
          width: 18px;
          height: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--color-text-muted);
          flex-shrink: 0;
          border-radius: 4px;
          background: transparent;
          padding: 0;
          cursor: pointer;
        }
        .smart-item-icon:hover {
          background: var(--color-bg-active);
          color: var(--color-text);
        }
        .smart-item.active .smart-item-icon {
          color: var(--color-text);
        }
        .smart-item-name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .tail {
          position: relative;
          width: 54px;
          height: 22px;
          flex-shrink: 0;
        }
        .tail-count {
          position: absolute;
          top: 0;
          right: 0;
          min-width: 34px;
          max-width: 100%;
          height: 22px;
          padding: 0 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.78);
          background: rgba(0, 0, 0, 0.52);
          border-radius: 999px;
          font-variant-numeric: tabular-nums;
          font-feature-settings: "tnum" 1;
          transition: opacity 120ms ease;
          white-space: nowrap;
        }
        @media (prefers-color-scheme: light) {
          .tail-count {
            color: rgba(0, 0, 0, 0.72);
            background: rgba(0, 0, 0, 0.12);
          }
        }
        .more {
          position: absolute;
          top: 0;
          right: 0;
          min-width: 34px;
          max-width: 100%;
          height: 22px;
          padding: 0 10px;
          z-index: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.78);
          background: rgba(0, 0, 0, 0.52);
          opacity: 0;
          border-radius: 999px;
          transition: opacity 120ms ease;
          white-space: nowrap;
        }
        @media (prefers-color-scheme: light) {
          .more {
            color: rgba(0, 0, 0, 0.72);
            background: rgba(0, 0, 0, 0.12);
          }
        }
        .smart-item:hover .tail-count,
        .tail.open .tail-count { opacity: 0; }
        .smart-item:hover .more,
        .tail.open .more { opacity: 1; }
        .more:hover,
        .more:active,
        .tail.open .more {
          opacity: 1;
          color: rgba(255, 255, 255, 0.86);
          background: rgba(0, 0, 0, 0.52);
        }
        .menu {
          z-index: 102;
          min-width: 100px;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          padding: 4px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
        }
        .menu button {
          display: block;
          width: 100%;
          text-align: left;
          padding: 6px 10px;
          border-radius: var(--radius-sm);
          font-size: 12px;
          background: transparent;
          border: 0;
          color: var(--color-text);
          cursor: pointer;
        }
        .menu button:hover {
          background: var(--color-bg-hover);
        }
        .menu button.danger {
          color: #d13030;
        }
        .menu button.danger:hover {
          background: #fce4ec;
        }
        @media (prefers-color-scheme: dark) {
          .menu button.danger:hover {
            background: rgba(209, 48, 48, 0.18);
          }
        }
      `}</style>
    </div>
  );
}

function FeedItem({
  feed,
  count,
  isActive,
  onSelect,
  onChangeIcon,
  onRename,
  onDelete,
}: {
  feed: FeedSubscription;
  count: number;
  isActive: boolean;
  onSelect: (s: Selection) => void;
  onChangeIcon?: (id: string, icon: string | null) => Promise<void>;
  onRename?: (id: string, name: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [pickingIcon, setPickingIcon] = useState(false);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(feed.name);
  const skipRenameBlurRef = useRef(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const iconBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!pickingIcon) return;
    const reflow = () => {
      const rect = iconBtnRef.current?.getBoundingClientRect();
      if (rect) setPickerPos(placePicker(rect));
    };
    window.addEventListener("resize", reflow);
    window.addEventListener("scroll", reflow, true);
    return () => {
      window.removeEventListener("resize", reflow);
      window.removeEventListener("scroll", reflow, true);
    };
  }, [pickingIcon]);

  useEffect(() => {
    setEditName(feed.name);
  }, [feed.name]);

  const hasMenu = !!(onChangeIcon || onRename || onDelete);

  function openIconPicker() {
    const rect = iconBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPickerPos(placePicker(rect));
    setPickingIcon(true);
  }

  async function submitRename() {
    const n = editName.trim();
    if (!n || n === feed.name) {
      setEditing(false);
      setEditName(feed.name);
      return;
    }
    if (onRename) await onRename(feed.id, n);
    setEditing(false);
  }

  return (
    <div className={`row ${isActive ? "active" : ""}`}>
      <div className="chev" style={{ visibility: "hidden" }}>▸</div>
      <button
        ref={iconBtnRef}
        type="button"
        className="leading-icon"
        aria-label={`Change icon for ${feed.name}`}
        title="Change icon"
        onClick={(e) => {
          e.stopPropagation();
          if (pickingIcon) {
            setPickingIcon(false);
          } else {
            openIconPicker();
          }
        }}
      >
        <CollectionIcon name={feed.icon} size={14} />
      </button>
      {editing ? (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            skipRenameBlurRef.current = true;
            void submitRename();
          }}
        >
          <input
            autoFocus
            className="edit"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={() => {
              if (skipRenameBlurRef.current) {
                skipRenameBlurRef.current = false;
                return;
              }
              void submitRename();
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setEditing(false);
                setEditName(feed.name);
              }
            }}
          />
        </form>
      ) : (
        <button
          className="name"
          onClick={() => onSelect({ kind: "feed", id: feed.id })}
        >
          {feed.name}
        </button>
      )}
      <div className={`tail ${menuOpen ? "open" : ""}`}>
        <span className="tail-count">{count || ""}</span>
        {hasMenu && (
          <button
            className="more"
            ref={moreRef}
            onClick={(e) => {
              e.stopPropagation();
              const rect = moreRef.current?.getBoundingClientRect();
              if (rect) {
                setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
              }
              setMenuOpen((v) => !v);
            }}
            aria-label="Menu"
          >
            …
          </button>
        )}
        {menuOpen && menuPos &&
          createPortal(
            <div
              className="menu"
              ref={menuRef}
              style={{
                position: "fixed",
                top: menuPos.top,
                right: menuPos.right,
              }}
              onMouseLeave={() => setMenuOpen(false)}
            >
              {onChangeIcon && (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    openIconPicker();
                  }}
                >
                  Change icon
                </button>
              )}
              {onRename && (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setEditing(true);
                  }}
                >
                  Rename
                </button>
              )}
              {onDelete && (
                <button
                  className="danger"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(feed.id);
                  }}
                >
                  Delete
                </button>
              )}
            </div>,
            document.body
          )}
      </div>

      {pickingIcon && pickerPos &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: pickerPos.top,
              left: pickerPos.left,
              zIndex: 1000,
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <IconPicker
              value={feed.icon}
              onPick={async (name) => {
                setPickingIcon(false);
                if (onChangeIcon) await onChangeIcon(feed.id, name);
              }}
              onClose={() => setPickingIcon(false)}
            />
          </div>,
          document.body
        )}

      <style jsx>{`
        .row {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 3px 8px 3px 4px;
          border-radius: var(--radius-sm);
          position: relative;
          transition: background 140ms ease, transform 180ms ease;
        }
        .row:hover {
          background: var(--color-bg-hover);
          transform: translateX(4px);
        }
        .row.active {
          background: var(--color-bg-active);
        }
        .row.active:hover {
          transform: none;
        }
        .chev {
          width: 18px;
          height: 22px;
          font-size: 12px;
          line-height: 17px;
          color: var(--color-text-muted);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          flex-shrink: 0;
        }
        .row:hover .leading-icon { color: var(--color-text); }
        .leading-icon {
          width: 18px;
          height: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--color-text-muted);
          flex-shrink: 0;
          border-radius: 4px;
          background: transparent;
          padding: 0;
          cursor: pointer;
        }
        .leading-icon:hover {
          background: var(--color-bg-active);
          color: var(--color-text);
        }
        .row.active .leading-icon { color: var(--color-text); }
        .inline-form {
          flex: 1;
          min-width: 0;
        }
        .edit {
          width: 100%;
          font-size: 12px;
          padding: 2px 4px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-bg);
          color: var(--color-text);
          outline: none;
        }
        .name {
          flex: 1;
          text-align: left;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .tail {
          position: relative;
          width: 54px;
          height: 22px;
          flex-shrink: 0;
        }
        .tail-count {
          position: absolute;
          top: 0;
          right: 0;
          min-width: 34px;
          max-width: 100%;
          height: 22px;
          padding: 0 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.78);
          background: rgba(0, 0, 0, 0.52);
          border-radius: 999px;
          font-variant-numeric: tabular-nums;
          font-feature-settings: "tnum" 1;
          transition: opacity 120ms ease;
          white-space: nowrap;
        }
        @media (prefers-color-scheme: light) {
          .tail-count {
            color: rgba(0, 0, 0, 0.72);
            background: rgba(0, 0, 0, 0.12);
          }
        }
        .more {
          position: absolute;
          top: 0;
          right: 0;
          min-width: 34px;
          max-width: 100%;
          height: 22px;
          padding: 0 10px;
          z-index: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.78);
          background: rgba(0, 0, 0, 0.52);
          opacity: 0;
          border-radius: 999px;
          transition: opacity 120ms ease;
          white-space: nowrap;
        }
        @media (prefers-color-scheme: light) {
          .more {
            color: rgba(0, 0, 0, 0.72);
            background: rgba(0, 0, 0, 0.12);
          }
        }
        .row:hover .tail-count,
        .tail.open .tail-count { opacity: 0; }
        .row:hover .more,
        .tail.open .more { opacity: 1; }
        .more:hover,
        .more:active,
        .tail.open .more {
          opacity: 1;
          color: rgba(255, 255, 255, 0.86);
          background: rgba(0, 0, 0, 0.52);
        }
        .menu {
          z-index: 102;
          min-width: 100px;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          padding: 4px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
        }
        .menu button {
          display: block;
          width: 100%;
          text-align: left;
          padding: 6px 10px;
          border-radius: var(--radius-sm);
          font-size: 12px;
          background: transparent;
          border: 0;
          color: var(--color-text);
          cursor: pointer;
        }
        .menu button:hover {
          background: var(--color-bg-hover);
        }
        .menu button.danger {
          color: #d13030;
        }
        .menu button.danger:hover {
          background: #fce4ec;
        }
        @media (prefers-color-scheme: dark) {
          .menu button.danger:hover {
            background: rgba(209, 48, 48, 0.18);
          }
        }
      `}</style>
    </div>
  );
}

function SidebarItem({
  label,
  count,
  active,
  onClick,
  leading,
  indent = 0,
}: {
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
  leading?: ReactNode;
  indent?: number;
}) {
  return (
    <button
      className={`item ${active ? "active" : ""}`}
      onClick={onClick}
      title={label}
      style={{ paddingLeft: indent ? `${8 + indent}px` : undefined }}
    >
      {leading && <span className="leading">{leading}</span>}
      <span className="label">{label}</span>
      {typeof count === "number" && <span className="count">{count}</span>}
      <style jsx>{`
        .item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          width: 100%;
          min-width: 0;
          padding: 3px 8px;
          border-radius: var(--radius-sm);
          text-align: left;
          font-size: 12px;
          color: var(--color-text);
          transition: background 140ms ease, transform 180ms ease;
        }
        .item:hover {
          background: var(--color-bg-hover);
          transform: translateX(4px);
        }
        .item.active { background: var(--color-bg-active); }
        .item.active:hover { transform: none; }
        .leading {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          color: var(--color-text-muted);
          flex-shrink: 0;
          transition: color 140ms ease;
        }
        .item:hover .leading,
        .item.active .leading { color: var(--color-text); }
        .label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .count {
          min-width: 34px;
          height: 22px;
          padding: 0 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.78);
          background: rgba(0, 0, 0, 0.52);
          border-radius: 999px;
          font-variant-numeric: tabular-nums;
          font-feature-settings: "tnum" 1;
          flex-shrink: 0;
          white-space: nowrap;
        }
        @media (prefers-color-scheme: light) {
          .count {
            color: rgba(0, 0, 0, 0.72);
            background: rgba(0, 0, 0, 0.12);
          }
        }
      `}</style>
    </button>
  );
}

function CollectionNode({
  node,
  depth,
  open,
  isCollapsed,
  onToggleOpen,
  onExpand,
  selection,
  onSelect,
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection,
  onChangeCollectionIcon,
  onReorderCollections,
  onShareCollection,
  draggedId,
  blockedNestIds,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  node: Collection;
  depth: number;
  open: boolean;
  isCollapsed: (id: string) => boolean;
  onToggleOpen: (id: string) => void;
  onExpand: (id: string) => void;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onCreateCollection: (name: string, parentId: string | null) => Promise<Collection>;
  onRenameCollection: (id: string, name: string) => Promise<void>;
  onDeleteCollection: (id: string) => Promise<void>;
  onChangeCollectionIcon: (id: string, iconName: string | null) => Promise<void>;
  onReorderCollections: (ids: string[]) => Promise<void>;
  onShareCollection?: (collection: Collection) => void;
  draggedId: string | null;
  blockedNestIds: Set<string>;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, targetId: string, asChild?: boolean) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [pickingIcon, setPickingIcon] = useState(false);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(node.name);
  const [addingChild, setAddingChild] = useState(false);
  const [childName, setChildName] = useState("");
  const [isDragTarget, setIsDragTarget] = useState(false);
  const [nestHover, setNestHover] = useState(false);
  const nestTimerRef = useRef<number | null>(null);
  const iconBtnRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const skipRenameBlurRef = useRef(false);
  const skipChildBlurRef = useRef(false);

  const canNest = !!draggedId && draggedId !== node.id && !blockedNestIds.has(node.id);

  function clearNestTimer() {
    if (nestTimerRef.current !== null) {
      window.clearTimeout(nestTimerRef.current);
      nestTimerRef.current = null;
    }
  }

  // Clean up any pending timer on unmount or when the drag ends.
  useEffect(() => {
    if (!draggedId) {
      clearNestTimer();
      setNestHover(false);
    }
    return clearNestTimer;
  }, [draggedId]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  function openIconPicker() {
    const rect = iconBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPickerPos(placePicker(rect));
    setPickingIcon(true);
  }

  // Reposition on window resize / scroll while the picker is open.
  useEffect(() => {
    if (!pickingIcon) return;
    const reflow = () => {
      const rect = iconBtnRef.current?.getBoundingClientRect();
      if (rect) setPickerPos(placePicker(rect));
    };
    window.addEventListener("resize", reflow);
    window.addEventListener("scroll", reflow, true);
    return () => {
      window.removeEventListener("resize", reflow);
      window.removeEventListener("scroll", reflow, true);
    };
  }, [pickingIcon]);

  const hasChildren = !!node.children?.length;
  const isActive = selection.kind === "collection" && selection.id === node.id;
  const isDragging = draggedId === node.id;

  const totalInSubtree = useMemo(() => countSubtree(node), [node]);
  // When expanded, show only the bookmarks that live directly on this node —
  // the children render their own counts. Collapsed, show the subtree total.
  const displayCount = hasChildren && open ? (node.bookmark_count ?? 0) : totalInSubtree;

  async function submitRename() {
    const n = editName.trim();
    if (!n || n === node.name) {
      setEditing(false);
      setEditName(node.name);
      return;
    }
    await onRenameCollection(node.id, n);
    setEditing(false);
  }

  async function submitChild() {
    const n = childName.trim();
    if (!n) {
      setAddingChild(false);
      setChildName("");
      return;
    }
    await onCreateCollection(n, node.id);
    setAddingChild(false);
    setChildName("");
    onExpand(node.id);
  }

  return (
    <div
      className={`node ${isDragging ? "dragging" : ""} ${isDragTarget && !nestHover ? "drag-over" : ""} ${nestHover ? "nest-target" : ""}`}
    >
      <div
        className={`row ${isActive ? "active" : ""}`}
        style={{ paddingLeft: depth * 12 }}
        draggable={!editing}
        onDragStart={(e) => {
          if (editing) return;
          onDragStart(node.id);
          e.dataTransfer.setData("text/plain", node.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          if (isDragging) return;
          e.preventDefault();
          onDragOver(e);
          setIsDragTarget(true);
          // After a brief pause hovering over a valid target, switch to nest mode.
          if (canNest && !nestHover && nestTimerRef.current === null) {
            nestTimerRef.current = window.setTimeout(() => {
              setNestHover(true);
              nestTimerRef.current = null;
              // If the target has children and is collapsed, auto-expand so the
              // user can see where the item is about to land.
              if (hasChildren && !open) onExpand(node.id);
            }, 600);
          }
        }}
        onDragLeave={() => {
          setIsDragTarget(false);
          clearNestTimer();
          setNestHover(false);
        }}
        onDrop={(e) => {
          const shouldNest = nestHover && canNest;
          setIsDragTarget(false);
          clearNestTimer();
          setNestHover(false);
          onDrop(e, node.id, shouldNest);
        }}
      >
        <button
          className="chev"
          onClick={() => onToggleOpen(node.id)}
          aria-label={open ? "Collapse" : "Expand"}
          disabled={!hasChildren}
          style={{ visibility: hasChildren ? "visible" : "hidden" }}
        >
          {open ? "▾" : "▸"}
        </button>
        <button
          ref={iconBtnRef}
          type="button"
          className="leading-icon"
          aria-label={`Change icon for ${node.name}`}
          title="Change icon"
          onClick={(e) => {
            e.stopPropagation();
            if (pickingIcon) {
              setPickingIcon(false);
            } else {
              openIconPicker();
            }
          }}
        >
          <CollectionIcon name={node.icon} size={14} />
        </button>
        {editing ? (
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              skipRenameBlurRef.current = true;
              void submitRename();
            }}
          >
            <input
              autoFocus
              className="edit"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => {
                if (skipRenameBlurRef.current) {
                  skipRenameBlurRef.current = false;
                  return;
                }
                void submitRename();
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setEditing(false);
                  setEditName(node.name);
                }
              }}
            />
          </form>
        ) : (
          <button
            className="name"
            onClick={() => onSelect({ kind: "collection", id: node.id })}
            title={node.is_public ? `${node.name} · public` : node.name}
          >
            {node.name}
            {node.is_public && (
              <span className="public-dot" aria-hidden title="Public" />
            )}
          </button>
        )}
        <div className={`tail ${menuOpen ? "open" : ""}`}>
          <span className="tail-count">{displayCount || ""}</span>
          <button
            className="more"
            ref={moreRef}
            onClick={(e) => {
              e.stopPropagation();
              const rect = moreRef.current?.getBoundingClientRect();
              if (rect) {
                setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
              }
              setMenuOpen((v) => !v);
            }}
            aria-label="Menu"
          >
            …
          </button>
          {menuOpen && menuPos &&
            createPortal(
              <div
                className="menu"
                ref={menuRef}
                style={{
                  position: "fixed",
                  top: menuPos.top,
                  right: menuPos.right,
                }}
                onMouseLeave={() => setMenuOpen(false)}
              >
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    openIconPicker();
                  }}
                >
                  Change icon
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setAddingChild(true);
                  }}
                >
                  New sub-collection
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setEditing(true);
                  }}
                >
                  Rename
                </button>
                {onShareCollection && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onShareCollection(node);
                    }}
                  >
                    {node.is_public ? "Sharing settings…" : "Share…"}
                  </button>
                )}
                <button
                  className="danger"
                  onClick={async () => {
                    setMenuOpen(false);
                    if (
                      confirm(
                        `Delete "${node.name}"? Sub-collections and bookmarks will be unsorted.`
                      )
                    ) {
                      await onDeleteCollection(node.id);
                    }
                  }}
                >
                  Delete
                </button>
              </div>,
              document.body
            )}
        </div>
      </div>

      {pickingIcon && pickerPos &&
        createPortal(
          <div
            className="sb-icon-picker-portal"
            style={{
              position: "fixed",
              top: pickerPos.top,
              left: pickerPos.left,
              zIndex: 1000,
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <IconPicker
              value={node.icon}
              onPick={async (name) => {
                setPickingIcon(false);
                await onChangeCollectionIcon(node.id, name);
              }}
              onClose={() => setPickingIcon(false)}
            />
          </div>,
          document.body
        )}

      {open && hasChildren && (
        <div>
          {node.children!.map((c) => (
            <CollectionNode
              key={c.id}
              node={c}
              depth={depth + 1}
              open={!isCollapsed(c.id)}
              isCollapsed={isCollapsed}
              onToggleOpen={onToggleOpen}
              onExpand={onExpand}
              selection={selection}
              onSelect={onSelect}
              onCreateCollection={onCreateCollection}
              onRenameCollection={onRenameCollection}
              onDeleteCollection={onDeleteCollection}
              onChangeCollectionIcon={onChangeCollectionIcon}
              onReorderCollections={onReorderCollections}
              onShareCollection={onShareCollection}
              draggedId={draggedId}
              blockedNestIds={blockedNestIds}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
            />
          ))}
        </div>
      )}

      {addingChild && (
        <div className="child-input" style={{ paddingLeft: (depth + 1) * 12 }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              skipChildBlurRef.current = true;
              void submitChild();
            }}
          >
            <input
              autoFocus
              className="edit"
              placeholder="Sub-collection name"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              onBlur={() => {
                if (skipChildBlurRef.current) {
                  skipChildBlurRef.current = false;
                  return;
                }
                void submitChild();
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setAddingChild(false);
                  setChildName("");
                }
              }}
            />
          </form>
        </div>
      )}

      <style jsx>{`
        .node.dragging { opacity: 0.4; }
        .node.drag-over > .row { border-top: 2px solid var(--color-text); }
        .node.nest-target > .row {
          background: var(--color-bg-active);
          box-shadow: inset 0 0 0 2px var(--color-text);
          animation: nestPulse 700ms ease-in-out infinite alternate;
        }
        @keyframes nestPulse {
          from { box-shadow: inset 0 0 0 2px var(--color-text); }
          to   { box-shadow: inset 0 0 0 2px transparent; }
        }
        .row {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 3px 8px;
          border-radius: var(--radius-sm);
          position: relative;
          transition: background 140ms ease, transform 180ms ease;
        }
        .row:hover {
          background: var(--color-bg-hover);
          transform: translateX(4px);
        }
        .row.active {
          background: var(--color-bg-active);
        }
        .row.active:hover {
          transform: none;
        }
        @media (prefers-reduced-motion: reduce) {
          .row {
            transition: background 140ms ease;
          }
          .row:hover { transform: none; }
        }
        .chev {
          width: 22px;
          height: 22px;
          font-size: 12px;
          line-height: 17px;
          color: var(--color-text-muted);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          flex-shrink: 0;
        }
        .chev:hover:not(:disabled) {
          color: var(--color-text);
          background: transparent;
        }
        .leading-icon {
          width: 18px;
          height: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--color-text-muted);
          flex-shrink: 0;
          border-radius: 4px;
          background: transparent;
          padding: 0;
          cursor: pointer;
        }
        .leading-icon:hover {
          background: var(--color-bg-active);
          color: var(--color-text);
        }
        .row.active .leading-icon,
        .row:hover .leading-icon { color: var(--color-text); }
        .name {
          flex: 1;
          text-align: left;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .public-dot {
          flex-shrink: 0;
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #34c759;
        }
        .tail {
          position: relative;
          width: 54px;
          height: 22px;
          flex-shrink: 0;
        }
        .tail-count {
          position: absolute;
          top: 0;
          right: 0;
          min-width: 34px;
          max-width: 100%;
          height: 22px;
          padding: 0 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.78);
          background: rgba(0, 0, 0, 0.52);
          border-radius: 999px;
          font-variant-numeric: tabular-nums;
          font-feature-settings: "tnum" 1;
          transition: opacity 120ms ease;
          white-space: nowrap;
        }
        @media (prefers-color-scheme: light) {
          .tail-count {
            color: rgba(0, 0, 0, 0.72);
            background: rgba(0, 0, 0, 0.12);
          }
        }
        .more {
          position: absolute;
          top: 0;
          right: 0;
          min-width: 34px;
          max-width: 100%;
          height: 22px;
          padding: 0 10px;
          z-index: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.78);
          background: rgba(0, 0, 0, 0.52);
          opacity: 0;
          border-radius: 999px;
          transition: opacity 120ms ease, color 120ms ease, background 120ms ease;
          white-space: nowrap;
        }
        .row:hover .tail-count,
        .tail.open .tail-count { opacity: 0; }
        .row:hover .more,
        .tail.open .more { opacity: 1; }
        .more:hover,
        .more:active,
        .tail.open .more {
          color: rgba(255, 255, 255, 0.86);
          background: rgba(0, 0, 0, 0.52);
        }
        .more:active { opacity: 1; }
        .menu {
          z-index: 102;
          min-width: 160px;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          padding: 4px;
          display: flex;
          flex-direction: column;
        }
        .menu button {
          text-align: left;
          padding: 5px 8px;
          border-radius: 3px;
          font-size: 12px;
        }
        .menu button:hover { background: var(--color-bg-hover); }
        .menu button.danger {
          color: #d13030;
        }
        .menu button.danger:hover {
          background: #fce4ec;
        }
        @media (prefers-color-scheme: dark) {
          .menu button.danger:hover {
            background: rgba(209, 48, 48, 0.18);
          }
        }
        .edit { flex: 1; font-size: 12px; padding: 2px 6px; }
        .child-input { padding: 4px 6px 4px 0; }
        .inline-form {
          flex: 1;
          min-width: 0;
        }
        .child-input form {
          width: 100%;
        }
      `}</style>
    </div>
  );
}

function countSubtree(c: Collection): number {
  let n = c.bookmark_count ?? 0;
  for (const child of c.children ?? []) n += countSubtree(child);
  return n;
}

// ---------------------------------------------------------------------------
// ImageCollectionRow — one row under the Images supergroup. Owns its own
// hover-menu, icon-picker, and inline-rename state so the parent Sidebar
// doesn't have to coordinate per-row modal state.
// ---------------------------------------------------------------------------

type ImageCollectionRowProps = {
  collection: ImageCollection;
  active: boolean;
  onSelect: () => void;
  onUpdate?: (updates: { name?: string; icon?: string | null }) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onShare?: () => void;
};

function ImageCollectionRow({
  collection,
  active,
  onSelect,
  onUpdate,
  onDelete,
  onShare,
}: ImageCollectionRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(collection.name);
  const rowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setRenameValue(collection.name);
  }, [collection.name]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickAway(e: MouseEvent) {
      if (!rowRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickAway);
    return () => document.removeEventListener("mousedown", handleClickAway);
  }, [menuOpen]);

  async function commitRename() {
    const next = renameValue.trim();
    if (next && next !== collection.name && onUpdate) {
      await onUpdate({ name: next });
    }
    setRenaming(false);
  }

  return (
    <div ref={rowRef} className="img-node">
      <div className={`img-row ${active ? "active" : ""} ${menuOpen ? "menu-open" : ""}`}>
        {/* Chev placeholder — kept hidden but reserves the same horizontal
            slot as link folders so the leading icon aligns exactly. */}
        <span className="img-chev" aria-hidden>▸</span>
        <button
          type="button"
          className="img-leading-icon"
          aria-label={`Change icon for ${collection.name}`}
          title="Change icon"
          onClick={(e) => {
            e.stopPropagation();
            setIconPickerOpen((v) => !v);
          }}
        >
          <CollectionIcon name={collection.icon ?? null} size={14} />
        </button>
        {renaming ? (
          <form
            className="img-inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              void commitRename();
            }}
          >
            <input
              autoFocus
              className="img-edit"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => void commitRename()}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setRenameValue(collection.name);
                  setRenaming(false);
                }
              }}
            />
          </form>
        ) : (
          <button
            className="img-name"
            onClick={onSelect}
            title={collection.is_public ? `${collection.name} · public` : collection.name}
          >
            {collection.name}
            {collection.is_public && (
              <span className="public-dot" aria-hidden title="Public" />
            )}
          </button>
        )}
        <div className={`img-tail ${menuOpen ? "open" : ""}`}>
          <span className="img-tail-count">
            {collection.image_count && collection.image_count > 0 ? collection.image_count : ""}
          </span>
          {(onUpdate || onDelete) && (
            <button
              className="img-more"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              aria-label="Folder menu"
            >
              …
            </button>
          )}
        </div>
      </div>

      {menuOpen && (
        <div className="img-menu">
          {onUpdate && (
            <button
              onClick={() => {
                setMenuOpen(false);
                setIconPickerOpen(true);
              }}
            >
              Change icon
            </button>
          )}
          {onUpdate && (
            <button
              onClick={() => {
                setMenuOpen(false);
                setRenaming(true);
              }}
            >
              Rename
            </button>
          )}
          {onShare && (
            <button
              onClick={() => {
                setMenuOpen(false);
                onShare();
              }}
            >
              {collection.is_public ? "Sharing settings…" : "Share…"}
            </button>
          )}
          {onDelete && (
            <button
              className="danger"
              onClick={async () => {
                setMenuOpen(false);
                if (
                  confirm(`Delete "${collection.name}"? Images inside will be moved to Unsorted.`)
                ) {
                  await onDelete();
                }
              }}
            >
              Delete
            </button>
          )}
        </div>
      )}

      {iconPickerOpen && (
        <div className="sidebar-image-collection-icon-popup">
          <div
            className="sidebar-image-collection-icon-backdrop"
            onClick={() => setIconPickerOpen(false)}
          />
          <div className="sidebar-image-collection-icon-card">
            <IconPicker
              value={collection.icon ?? null}
              onPick={async (name) => {
                setIconPickerOpen(false);
                if (onUpdate) await onUpdate({ icon: name });
              }}
              onClose={() => setIconPickerOpen(false)}
            />
          </div>
        </div>
      )}

      <style jsx>{`
        /* Match the link-folder visual treatment exactly — see the
           CollectionNode styles in the parent Sidebar block for the
           original tokens. No horizontal padding on the wrapper —
           CollectionNode renders its .node directly without any inset,
           so adding 6px here pushed both the leading icon and the count
           pill inward relative to link folders. */
        .img-node { position: relative; }
        .img-row {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 3px 8px 3px 4px;
          border-radius: var(--radius-sm);
          position: relative;
          transition: background 140ms ease, transform 180ms ease;
        }
        .img-row:hover {
          background: var(--color-bg-hover);
          transform: translateX(4px);
        }
        .img-row.active {
          background: var(--color-bg-active);
        }
        .img-row.active:hover { transform: none; }

        .img-chev {
          width: 18px;
          height: 22px;
          font-size: 12px;
          line-height: 17px;
          color: var(--color-text-muted);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          visibility: hidden;
          flex-shrink: 0;
        }
        .img-leading-icon {
          width: 18px;
          height: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--color-text-muted);
          flex-shrink: 0;
          border-radius: 4px;
          background: transparent;
          padding: 0;
          border: none;
          cursor: pointer;
        }
        .img-leading-icon:hover {
          background: var(--color-bg-active);
          color: var(--color-text);
        }
        .img-row:hover .img-leading-icon { color: var(--color-text); }
        .img-row.active .img-leading-icon { color: var(--color-text); }

        .img-inline-form { flex: 1; min-width: 0; }
        .img-edit {
          width: 100%;
          font-size: 12px;
          padding: 2px 4px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-bg);
          color: var(--color-text);
          outline: none;
        }
        .img-name {
          flex: 1;
          text-align: left;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12px;
          background: transparent;
          border: none;
          color: inherit;
          cursor: pointer;
          padding: 0;
        }

        .img-tail {
          position: relative;
          width: 54px;
          height: 22px;
          flex-shrink: 0;
        }
        .img-tail-count {
          position: absolute;
          top: 0;
          right: 0;
          min-width: 34px;
          max-width: 100%;
          height: 22px;
          padding: 0 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.78);
          background: rgba(0, 0, 0, 0.52);
          border-radius: 999px;
          font-variant-numeric: tabular-nums;
          font-feature-settings: "tnum" 1;
          transition: opacity 120ms ease;
          white-space: nowrap;
        }
        @media (prefers-color-scheme: light) {
          .img-tail-count {
            color: rgba(0, 0, 0, 0.72);
            background: rgba(0, 0, 0, 0.12);
          }
        }
        .img-more {
          position: absolute;
          top: 0;
          right: 0;
          min-width: 34px;
          max-width: 100%;
          height: 22px;
          padding: 0 10px;
          z-index: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.78);
          background: rgba(0, 0, 0, 0.52);
          border: none;
          opacity: 0;
          border-radius: 999px;
          transition: opacity 120ms ease;
          white-space: nowrap;
          cursor: pointer;
        }
        @media (prefers-color-scheme: light) {
          .img-more {
            color: rgba(0, 0, 0, 0.72);
            background: rgba(0, 0, 0, 0.12);
          }
        }
        .img-row:hover .img-tail-count,
        .img-tail.open .img-tail-count { opacity: 0; }
        .img-row:hover .img-more,
        .img-tail.open .img-more { opacity: 1; }

        .img-menu {
          position: absolute;
          right: 6px;
          top: 100%;
          z-index: 40;
          margin-top: 2px;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          box-shadow: 0 14px 36px rgba(0, 0, 0, 0.35);
          min-width: 160px;
          padding: 4px;
        }
        .img-menu button {
          display: block;
          width: 100%;
          background: transparent;
          color: var(--color-text);
          border: none;
          text-align: left;
          padding: 6px 10px;
          font-size: 13px;
          border-radius: 6px;
          cursor: pointer;
        }
        .img-menu button:hover { background: var(--color-bg-hover); }
        .img-menu button.danger { color: #d96a6a; }

        .sidebar-image-collection-icon-popup {
          position: fixed;
          inset: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .sidebar-image-collection-icon-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
        }
        .sidebar-image-collection-icon-card {
          position: relative;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: 12px;
          box-shadow: 0 14px 36px rgba(0, 0, 0, 0.35);
          padding: 12px;
        }
      `}</style>
    </div>
  );
}
