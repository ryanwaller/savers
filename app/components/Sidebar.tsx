"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Funnel, LinkBreak, PushPin, SignOut } from "@phosphor-icons/react";
import type { Bookmark, Collection, SmartCollection } from "@/lib/types";
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
  | { kind: "smart_collection"; id: string };

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
  selection: Selection;
  onSelect: (s: Selection) => void;
  onCreateCollection: (name: string, parentId: string | null) => Promise<Collection>;
  onRenameCollection: (id: string, name: string) => Promise<void>;
  onDeleteCollection: (id: string) => Promise<void>;
  onChangeCollectionIcon: (id: string, iconName: string | null) => Promise<void>;
  onReorderCollections: (ids: string[]) => Promise<void>;
  onReparentCollection: (id: string, newParentId: string | null) => Promise<void>;
  onShareCollection?: (collection: Collection) => void;
  onOpenTriage?: () => void;
  onSignOut?: () => void | Promise<void>;
  onOpenSettings?: () => void;
  onCloseMobile?: () => void;
  smartCollections?: SmartCollection[];
  smartCollectionCounts?: Record<string, number>;
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
  onOpenTriage,
  onSignOut,
  onOpenSettings,
  onCloseMobile,
  smartCollections = [],
  smartCollectionCounts = {},
  onCreateSmartCollection,
  onEditSmartCollection,
  onDeleteSmartCollection,
}: Props) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [collectionsExpanded, setCollectionsExpanded] = useState(true);
  const [smartCollectionsExpanded, setSmartCollectionsExpanded] = useState(true);
  const [smartMenuOpen, setSmartMenuOpen] = useState<string | null>(null);
  const [tagsExpanded, setTagsExpanded] = useState(true);
  const [tagSortOrder, setTagSortOrder] = useState<'alphabetical' | 'count'>('alphabetical');
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
        <button className="mobile-close" onClick={onCloseMobile} aria-label="Close menu">
          ×
        </button>
      </div>

      <div className="sidebar-scroll">
        <div className="sidebar-section">
          {totals.pinned > 0 && (
            <SidebarItem
              label="Pinned"
              leading={<PushPin size={14} weight="fill" />}
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
              leading={<LinkBreak size={14} />}
              count={totals.broken}
              active={selection.kind === "broken"}
              onClick={() => onSelect({ kind: "broken" })}
            />
          )}
        </div>

        <div className="sidebar-divider" />

        <div className="sidebar-section">
          <div className="flex items-center justify-between" style={{ paddingRight: 8 }}>
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

          {/* Smart Collections */}
          {(smartCollections.length > 0 || onCreateSmartCollection) && (
            <>
              <div className="sidebar-divider" />
              <div className="flex items-center justify-between" style={{ paddingRight: 8 }}>
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
            </>
          )}

          {allTags.length > 0 && (
            <>
              <div className="sidebar-divider" style={{ margin: "12px 4px 8px" }} />
              <div className="flex items-center justify-between px-1">
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
                        className={`tag-pill ${isActive ? "active" : ""}`}
                        onClick={() =>
                          onTagClick(tag === activeTag ? null : tag)
                        }
                      >
                        <span className="tag-pill-name">{tag}</span>
                        <span className="tag-pill-count">{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
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
          height: 100vh;
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
          width: 32px;
          height: 32px;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: var(--color-bg);
          color: var(--color-text);
          font-size: 18px;
          line-height: 1;
          padding-bottom: 2px;
          flex-shrink: 0;
        }
        .mobile-close:hover { border-color: var(--color-border-strong); }
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
        .px-1 { padding-left: 4px; padding-right: 4px; }
        .tag-sort-btn {
          font-size: 11px;
          padding: 2px 6px;
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
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 999px;
          background: var(--color-bg-secondary);
          color: var(--color-text);
          border: 1px solid var(--color-border);
          font-size: 12px;
          line-height: 1.2;
          cursor: pointer;
          max-width: 100%;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: background 120ms ease, border-color 120ms ease;
        }
        .tag-pill:hover {
          background: var(--color-bg-hover);
          border-color: var(--color-border-strong);
        }
        .tag-pill.active {
          background: var(--color-text);
          color: var(--color-bg);
          border-color: var(--color-text);
        }
        .tag-pill-name {
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .tag-pill-count {
          font-size: 11px;
          color: var(--color-text-muted);
          font-feature-settings: "tnum" 1;
        }
        .tag-pill.active .tag-pill-count {
          color: var(--color-bg-secondary);
        }
        .sidebar-section {
          padding: 4px 6px;
          overflow-x: hidden;
        }
        .sidebar-label {
          padding: 8px 8px 4px 0;
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
          font-size: 20px;
          line-height: 1;
          color: var(--color-text-muted);
          flex-shrink: 0;
          transform: translateY(-1px);
        }
        .sidebar-label:hover .caret {
          color: var(--color-text);
        }
        .sidebar-divider {
          height: 1px;
          margin: 4px 10px;
          background: var(--color-border);
        }
        .sidebar-empty {
          padding: 6px 10px;
          font-size: 12px;
          color: var(--color-text-muted);
        }
        .sidebar-foot {
          padding: 8px 8px env(safe-area-inset-bottom, 0px);
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
        }
        .unsorted-item:hover { background: var(--color-bg-hover); }
        .unsorted-item.active { background: var(--color-bg-active); }
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
          line-height: 1;
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
          padding: 2px 0;
        }
      `}</style>
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
        }
        .smart-item:hover {
          background: var(--color-bg-hover);
        }
        .smart-item.active {
          background: var(--color-bg-active);
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
          transition: background 140ms ease, padding-left 180ms ease;
        }
        .item:hover {
          background: var(--color-bg-hover);
          padding-left: 12px;
        }
        .item.active { background: var(--color-bg-active); }
        .item.active:hover { padding-left: 8px; }
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
          transition: background 140ms ease;
        }
        .row:hover { background: var(--color-bg-hover); }
        .row.active { background: var(--color-bg-active); }
        .chev {
          width: 22px;
          height: 22px;
          font-size: 18px;
          line-height: 1;
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
        .menu button.danger { color: var(--color-text); }
        .menu button.danger:hover { background: var(--color-bg-hover); }
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
