"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { PushPin } from "@phosphor-icons/react";
import type { Bookmark } from "@/lib/types";
import {
  api,
  type CustomPreviewSource,
  domainOf,
  storedPreviewUrl,
  tintForDomain,
} from "@/lib/api";
import { compressImageForPreview } from "@/lib/image-compress";
import { openExternalLink, isNative as isNativeShell } from "@/lib/capacitor-bridge";
import ConfirmDialog from "./ConfirmDialog";

type Props = {
  bookmarks: Bookmark[];
  onOpenBookmark: (b: Bookmark) => void;
  onDeleteBookmark: (id: string) => Promise<void> | void;
  onPatchBookmark: (bookmark: Bookmark) => Promise<void> | void;
  onPinBookmark: (id: string, pinned: boolean) => Promise<void> | void;
  onRefreshPreview: (id: string, version: number) => Promise<void> | void;
  onUploadCustomPreview: (id: string, source: CustomPreviewSource) => Promise<Bookmark> | Bookmark;
  onClearCustomPreview: (id: string) => Promise<Bookmark> | Bookmark;
  onTagClick: (tag: string) => void;
  cardMinWidth?: number;
  cardCols?: number;
  loading?: boolean;
  emptyLabel?: string;
  isEditMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string, shiftKey: boolean) => void;
};

export default function BookmarkGrid({
  bookmarks,
  onOpenBookmark,
  onDeleteBookmark,
  onPatchBookmark,
  onPinBookmark,
  onRefreshPreview,
  onUploadCustomPreview,
  onClearCustomPreview,
  onTagClick,
  cardMinWidth,
  cardCols,
  loading,
  emptyLabel,
  isEditMode,
  selectedIds,
  onToggleSelect,
}: Props) {
  const gridRef = useRef<HTMLDivElement>(null);

  // Force transition:none at runtime — CSS pipeline can inject transition:all in production
  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.style.setProperty("transition", "none", "important");
    }
  }, []);

  const gridStyle: CSSProperties | undefined =
    cardMinWidth || cardCols
      ? ({
          ...(cardMinWidth ? { "--card-min": `${cardMinWidth}px` } : null),
          ...(cardCols ? { "--card-cols": String(cardCols) } : null),
        } as CSSProperties)
      : undefined;

  return (
    <motion.div ref={gridRef} className="grid" style={gridStyle}>
      {bookmarks.map((b) => (
        <BookmarkCard
          key={b.id}
          b={b}
          onEdit={() => onOpenBookmark(b)}
          onDelete={() => onDeleteBookmark(b.id)}
          onPatchBookmark={onPatchBookmark}
          onPin={() => onPinBookmark(b.id, !b.pinned)}
          onRefreshPreview={(version) => onRefreshPreview(b.id, version)}
          onUploadCustomPreview={(file) => onUploadCustomPreview(b.id, file)}
          onClearCustomPreview={() => onClearCustomPreview(b.id)}
          onTagClick={onTagClick}
          cardMinWidth={cardMinWidth}
          cardCols={cardCols}
          isEditMode={isEditMode}
          isSelected={selectedIds?.has(b.id) ?? false}
          onToggleSelect={onToggleSelect}
        />
      ))}
      {!loading && bookmarks.length === 0 && (
        <div className="empty">{emptyLabel ?? "Nothing here yet."}</div>
      )}
      <style jsx>{`
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, var(--card-min, 300px));
          gap: 20px;
          padding: 20px;
          padding-bottom: 80px;
          transition: none !important;
        }
        @media (max-width: 768px) {
          .grid {
            grid-template-columns: repeat(var(--card-cols, 2), minmax(0, 1fr));
            padding: 12px;
            padding-bottom: 80px;
            gap: 12px;
            transition: none !important;
          }
        }

        .empty {
          grid-column: 1 / -1;
          padding: 48px 8px;
          text-align: center;
          color: var(--color-text-muted);
          font-size: 12px;
        }
      `}</style>
    </motion.div>
  );
}

function BookmarkCard({
  b,
  onEdit,
  onDelete,
  onPatchBookmark,
  onPin,
  onRefreshPreview,
  onUploadCustomPreview,
  onClearCustomPreview,
  onTagClick,
  cardMinWidth,
  cardCols,
  isEditMode,
  isSelected,
  onToggleSelect,
}: {
  b: Bookmark;
  onEdit: () => void;
  onDelete: () => Promise<void> | void;
  onPatchBookmark: (bookmark: Bookmark) => Promise<void> | void;
  onPin: () => Promise<void> | void;
  onRefreshPreview: (version: number) => Promise<void> | void;
  onUploadCustomPreview: (source: CustomPreviewSource) => Promise<Bookmark> | Bookmark;
  onClearCustomPreview: () => Promise<Bookmark> | Bookmark;
  onTagClick: (tag: string) => void;
  cardMinWidth?: number;
  cardCols?: number;
  isEditMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string, shiftKey: boolean) => void;
}) {
  // On the smallest mobile preset (3 cols) there's no room for both a pin
  // button and the overflow menu, so the pin moves into the menu.
  const collapseActions = (cardCols ?? 0) >= 3;

  const w = cardMinWidth ?? 300;
  const maxTags = w <= 220 ? 2 : w <= 300 ? 3 : w <= 380 ? 4 : 5;
  const [isDark, setIsDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [previewNonce, setPreviewNonce] = useState<number | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [previewStage, setPreviewStage] = useState<"custom" | "stored" | "og_image" | "favicon" | "fail">(
    "fail"
  );
  const [dropActive, setDropActive] = useState(false);
  const [uploadingPreview, setUploadingPreview] = useState(false);
  const [showTagOverlay, setShowTagOverlay] = useState(false);
  const [undoPromptOpen, setUndoPromptOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [brokenStatus, setBrokenStatus] = useState<string | null | undefined>(b.broken_status);
  const [brokenActionOpen, setBrokenActionOpen] = useState(false);
  const [verifyingBroken, setVerifyingBroken] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const dropDepthRef = useRef(0);
  const coverPending =
    b.screenshot_status === "pending" || b.screenshot_status === "processing";

  useEffect(() => {
    setBrokenStatus(b.broken_status);
  }, [b.broken_status]);

  // Close the card menu on any click outside .actions (or Escape).
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!actionsRef.current) return;
      if (event.target instanceof Node && actionsRef.current.contains(event.target)) return;
      setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    // Defer so the opening click doesn't close it on the same tick.
    const t = window.setTimeout(() => {
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!showTagOverlay) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowTagOverlay(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showTagOverlay]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener?.("change", h);
    return () => mq.removeEventListener?.("change", h);
  }, []);

  const tint = tintForDomain(b.url, isDark);
  const host = domainOf(b.url);
  const effectivePreviewVersion = previewNonce ?? b.preview_version ?? null;
  const customSrc = storedPreviewUrl(b.custom_preview_path, {
    previewVersion: effectivePreviewVersion,
  });
  const storedSrc = storedPreviewUrl(b.preview_path, {
    previewVersion: effectivePreviewVersion,
  });
  const screenshotSrc =
    previewStage === "custom"
      ? customSrc
      : previewStage === "stored"
      ? storedSrc
      : previewStage === "og_image"
        ? b.og_image!
        : previewStage === "favicon"
          ? b.favicon!
          : null;

  useEffect(() => {
    setPreviewFailed(false);
    if (customSrc) setPreviewStage("custom");
    else if (storedSrc) setPreviewStage("stored");
    else if (b.og_image) setPreviewStage("og_image");
    else if (b.favicon) setPreviewStage("favicon");
    else setPreviewStage("fail");
  }, [customSrc, storedSrc, b.og_image, b.favicon]);

  useEffect(() => {
    if (previewNonce !== null && b.preview_version === previewNonce) {
      setPreviewNonce(null);
    }
  }, [b.preview_version, previewNonce]);

  async function handleDelete(event: { stopPropagation: () => void }) {
    event.stopPropagation();
    setMenuOpen(false);
    setConfirmDeleteOpen(true);
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
      setConfirmDeleteOpen(false);
    }
  }

  function handleTagActivate(tag: string, event: { stopPropagation: () => void }) {
    event.stopPropagation();
    onTagClick(tag);
  }

  function handleEdit(event: { stopPropagation: () => void }) {
    event.stopPropagation();
    setMenuOpen(false);
    onEdit();
  }

  async function handleReloadPreview(event: { stopPropagation: () => void }) {
    event.stopPropagation();
    setMenuOpen(false);
    setReloading(true);
    setPreviewFailed(false);
    if (storedSrc) setPreviewStage("stored");
    else if (b.og_image) setPreviewStage("og_image");
    else if (b.favicon) setPreviewStage("favicon");
    else setPreviewStage("fail");
    const nextVersion = Date.now();
    setPreviewNonce(nextVersion);
    try {
      await onRefreshPreview(nextVersion);
    } catch {
      setReloading(false);
      setPreviewNonce(null);
    }
  }

  async function handleTogglePin(event: { stopPropagation: () => void }) {
    event.stopPropagation();
    if (pinning) return;
    setPinning(true);
    try {
      await onPin();
    } finally {
      setPinning(false);
    }
  }

  async function handleRecheckLink(event: { stopPropagation: () => void }) {
    event.stopPropagation();
    setMenuOpen(false);
    if (rechecking) return;
    setRechecking(true);
    try {
      await api.recheckLink(b.id);
    } catch {
      // Silently ignore
    } finally {
      setRechecking(false);
    }
  }

  async function handleVerifyBroken(action: "confirm" | "dispute", event: { stopPropagation: () => void }) {
    event.stopPropagation();
    if (verifyingBroken) return;
    setVerifyingBroken(true);
    try {
      if (action === "confirm") {
        await onDelete();
        return;
      }
      const result = await api.resetLinkStatus(b.id, "active");
      setBrokenStatus(result.bookmark.broken_status);
      await onPatchBookmark(result.bookmark);
      setBrokenActionOpen(false);
    } catch {
      // Silently ignore
    } finally {
      setVerifyingBroken(false);
    }
  }

  // During dragenter/dragover/dragleave, browsers expose item metadata
  // (kind + type) but NOT the actual files — `dataTransfer.files` is empty
  // until the `drop` event fires. So we detect "is an image being dragged"
  // by sniffing items/types here, and only read `.files` on drop itself.
  function tryParseRemoteImageUrl(event: React.DragEvent) {
    const dt = event.dataTransfer;
    if (!dt) return null;

    const candidates = [
      dt.getData("text/uri-list"),
      dt.getData("text/plain"),
    ]
      .map((value) => value.trim())
      .filter(Boolean);

    for (const candidate of candidates) {
      try {
        const parsed = new URL(candidate);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          return parsed.href;
        }
      } catch {
        // try the next payload shape
      }
    }

    const html = dt.getData("text/html");
    const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (match?.[1]) {
      try {
        const parsed = new URL(match[1]);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          return parsed.href;
        }
      } catch {
        return null;
      }
    }

    return null;
  }

  function isImageDrag(event: React.DragEvent) {
    const dt = event.dataTransfer;
    if (!dt) return false;
    const items = Array.from(dt.items ?? []);
    if (items.length > 0) {
      if (items.some(
        (item) => item.kind === "file" && item.type.startsWith("image/")
      )) {
        return true;
      }
    }
    // Safari/older paths sometimes don't expose items — fall back to types.
    const types = Array.from(dt.types ?? []);
    return (
      types.includes("Files") ||
      types.includes("text/uri-list") ||
      types.includes("text/html") ||
      !!tryParseRemoteImageUrl(event)
    );
  }

  function pickPreviewSource(event: React.DragEvent): CustomPreviewSource | null {
    const files = Array.from(event.dataTransfer?.files ?? []);
    const file = files.find((value) => value.type.startsWith("image/")) ?? null;
    if (file) return file;

    const remoteUrl = tryParseRemoteImageUrl(event);
    if (remoteUrl) {
      return { remoteUrl };
    }

    return null;
  }

  function handlePreviewDragEnter(event: React.DragEvent) {
    if (!isImageDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dropDepthRef.current += 1;
    setDropActive(true);
  }

  function handlePreviewDragOver(event: React.DragEvent) {
    if (!isImageDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setDropActive(true);
  }

  function handlePreviewDragLeave(event: React.DragEvent) {
    if (!isImageDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dropDepthRef.current -= 1;
    if (dropDepthRef.current <= 0) {
      dropDepthRef.current = 0;
      setDropActive(false);
    }
  }

  async function handlePreviewDrop(event: React.DragEvent) {
    if (!isImageDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dropDepthRef.current = 0;
    setDropActive(false);

    const source = pickPreviewSource(event);
    if (!source || uploadingPreview) return;

    setUploadingPreview(true);

    try {
      if (source instanceof File) {
        const prepared = await compressImageForPreview(source);
        await onUploadCustomPreview(prepared);
      } else {
        await onUploadCustomPreview(source);
      }
      setPreviewFailed(false);
      setPreviewNonce(null);
      setUndoPromptOpen(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to upload image");
    } finally {
      setUploadingPreview(false);
    }
  }

  async function handleUndoCustomPreview(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (undoing) return;
    setUndoing(true);
    try {
      await onClearCustomPreview();
      if (storedSrc) setPreviewStage("stored");
      else if (b.og_image) setPreviewStage("og_image");
      else if (b.favicon) setPreviewStage("favicon");
      else setPreviewStage("fail");
      setPreviewFailed(false);
      setPreviewNonce(null);
      setUndoPromptOpen(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to undo");
    } finally {
      setUndoing(false);
    }
  }

  function handleKeepCustomPreview(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setUndoPromptOpen(false);
  }

  return (
    <motion.div
      className="card-shell"
      layout
      transition={{ type: "spring", stiffness: 400, damping: 35 }}
    >
      <ConfirmDialog
        open={confirmDeleteOpen}
        title={`Delete "${b.title || host}"?`}
        description="This bookmark will be removed from Savers."
        confirmLabel="Delete"
        busy={deleting}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={confirmDelete}
      />
      {isEditMode && (
        <button
          type="button"
          className={`select-btn ${isSelected ? "select-btn-on" : ""}`}
          aria-label={isSelected ? "Deselect bookmark" : "Select bookmark"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect?.(b.id, e.shiftKey);
          }}
        >
          {isSelected && (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      )}
      <div className="card" title={b.title ?? b.url}>
        <div className="thumb-wrap">
          <a
            className={`thumb thumb-link ${dropActive ? "is-drop-active" : ""}`}
            href={b.url}
            target="_blank"
            rel="noopener noreferrer"
            draggable={false}
            style={{ background: tint }}
            onClick={(event) => {
              event.stopPropagation();
              if (isNativeShell()) {
                event.preventDefault();
                void openExternalLink(b.url);
              }
            }}
            onDragEnter={handlePreviewDragEnter}
            onDragOver={handlePreviewDragOver}
            onDragLeave={handlePreviewDragLeave}
            onDrop={handlePreviewDrop}
          >
            {screenshotSrc && !previewFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={screenshotSrc}
                src={screenshotSrc}
                alt={`Preview of ${host}`}
                data-asset-type={b.asset_type ?? undefined}
                draggable={false}
                onLoad={() => setReloading(false)}
                onError={() => {
                  if (previewStage === "custom") {
                    setPreviewStage(storedSrc ? "stored" : b.og_image ? "og_image" : b.favicon ? "favicon" : "fail");
                    return;
                  }
                  if (previewStage === "stored") {
                    setPreviewStage(b.og_image ? "og_image" : b.favicon ? "favicon" : "fail");
                    return;
                  }
                  if (previewStage === "og_image") {
                    setPreviewStage(b.favicon ? "favicon" : "fail");
                    return;
                  }
                  setReloading(false);
                  setPreviewFailed(true);
                  setPreviewStage("fail");
                }}
                loading="lazy"
              />
            ) : (
              <span className="thumb-fallback small muted">Preview unavailable</span>
            )}
            {(dropActive || uploadingPreview) && (
              <span className="drop-overlay">
                <span className="drop-copy">
                  {uploadingPreview ? "Uploading image…" : "Drop image to replace preview"}
                </span>
              </span>
            )}
            {coverPending && !dropActive && !uploadingPreview && (
              <span className="cover-refresh-overlay">
                <span className="cover-refresh-copy">Updating cover…</span>
              </span>
            )}
          </a>

          {/* Broken link overlay — outside the <a> tag so clicks don't navigate */}
          {b.link_status === "broken" && brokenStatus !== "verified_active" && (
            <span className="broken-overlay">
                {/* Backdrop — click to dismiss */}
                {brokenActionOpen && (
                  <span className="broken-backdrop" onClick={() => setBrokenActionOpen(false)} />
                )}

                {/* Initial: trigger badge */}
                {!brokenActionOpen && (
                  <button
                    type="button"
                    className="broken-trigger"
                    onClick={(e) => {
                      e.stopPropagation();
                      setBrokenActionOpen(true);
                    }}
                    aria-label="Broken link — view options"
                  >
                    <span className="text-full">Broken link</span>
                    <span className="text-short">Broken</span>
                  </button>
                )}

                {/* Action pills */}
                {brokenActionOpen && (
                  <span className="broken-actions broken-actions-in">
                    <button
                      type="button"
                    className="broken-pill broken-pill-confirm"
                    disabled={verifyingBroken}
                    onClick={(e) => {
                      void handleVerifyBroken("confirm", e);
                    }}
                    >
                      Confirm Broken
                    </button>
                    <button
                      type="button"
                      className="broken-pill broken-pill-active"
                      disabled={verifyingBroken}
                      onClick={(e) => {
                        void handleVerifyBroken("dispute", e);
                      }}
                    >
                      Still Works
                    </button>
                  </span>
                )}
              </span>
            )}
            {undoPromptOpen && !uploadingPreview && (
              <span
                className="undo-strip"
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="undo-btn undo-btn-secondary"
                  onClick={handleUndoCustomPreview}
                  disabled={undoing}
                >
                  {undoing ? "Undoing…" : "Undo"}
                </button>
                <button
                  type="button"
                  className="undo-btn undo-btn-primary"
                  onClick={handleKeepCustomPreview}
                  disabled={undoing}
                >
                  Keep
                </button>
              </span>
            )}
          {b.tags && b.tags.length > 0 && (
            <div className="tags-overlay">
              {b.tags.slice(0, maxTags).map((t) => (
                <button
                  type="button"
                  key={t}
                  className="tag tag-interactive"
                  onClick={(event) => handleTagActivate(t, event)}
                  title={`Filter by ${t}`}
                >
                  {t}
                </button>
              ))}
              {b.tags.length > maxTags && (
                <button
                  type="button"
                  className="tag tag-overflow"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setShowTagOverlay(true);
                  }}
                  title={`${b.tags.length - maxTags} more tags`}
                >
                  +{b.tags.length - maxTags}
                </button>
              )}
            </div>
          )}
          {showTagOverlay && (
            <div
              className="tag-overlay-backdrop"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setShowTagOverlay(false);
              }}
            >
              <div className="tag-overlay-panel">
                {b.tags.map((t) => (
                  <button
                    type="button"
                    key={t}
                    className="tag tag-interactive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTagActivate(t, e);
                      setShowTagOverlay(false);
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
          {b.tagging_status === "pending" || b.tagging_status === "processing" ? (
            <div className="tagging-badge" title="Auto-tagging in progress" />
          ) : null}
        </div>

        <div
          className="body"
          role="button"
          tabIndex={0}
          onClick={onEdit}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onEdit();
            }
          }}
        >
          <div className="body-button">
            <div className="title">{b.title || host}</div>
            <div className="meta">
              {b.favicon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="fav" src={b.favicon} alt="" />
              )}
              <span className="host small muted">{host}</span>
            </div>
            {b.description && <div className="desc small muted">{b.description}</div>}
          </div>
        </div>
      </div>

      <div
        ref={actionsRef}
        className={`actions ${menuOpen ? "actions-open" : ""} ${collapseActions ? "actions-collapsed" : ""}`}
      >
        <button
          className={`action-btn pin-btn ${b.pinned ? "is-pinned" : ""}`}
          aria-label={b.pinned ? "Unpin bookmark" : "Pin bookmark"}
          aria-pressed={b.pinned}
          title={b.pinned ? "Unpin" : "Pin"}
          onClick={handleTogglePin}
          disabled={pinning}
        >
          <PushPin size={14} weight={b.pinned ? "fill" : "regular"} />
        </button>
        <button
          className="action-btn menu-trigger"
          aria-label="Bookmark options"
          aria-expanded={menuOpen}
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((open) => !open);
          }}
        >
          ⋮
        </button>
        {menuOpen && (
          <div className="menu" onClick={(event) => event.stopPropagation()}>
            {collapseActions && (
              <button
                className="menu-item menu-item-pin"
                onClick={(event) => {
                  setMenuOpen(false);
                  handleTogglePin(event);
                }}
                disabled={pinning}
              >
                {b.pinned ? "Unpin" : "Pin"}
              </button>
            )}
            <button className="menu-item" onClick={handleEdit}>
              Edit
            </button>
            <button className="menu-item" onClick={handleReloadPreview} disabled={reloading}>
              {reloading ? "Reloading…" : "Reload preview"}
            </button>
            <button className="menu-item danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </button>
            {b.link_status === "broken" && brokenStatus !== "verified_active" && (
              <>
                <div className="menu-separator" />
                <button
                  className="menu-item"
                  onClick={(e) => handleVerifyBroken("dispute", e)}
                  disabled={verifyingBroken}
                >
                  {verifyingBroken ? "Marking…" : "Mark as Active"}
                </button>
                <button className="menu-item" onClick={handleRecheckLink} disabled={rechecking}>
                  {rechecking ? "Checking…" : "Re-check Link"}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .card-shell {
          position: relative;
          min-height: 340px;
        }
        .card {
          display: flex;
          flex-direction: column;
          border: 1px solid var(--color-border);
          border-radius: var(--radius);
          overflow: hidden;
          background: var(--color-bg);
          height: 100%;
          min-height: 340px;
          width: 100%;
          transition: border-color 200ms ease, transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 250ms ease;
        }
        @media (max-width: 768px) {
          .card-shell,
          .card {
            min-height: 0;
          }
        }
        .card:hover {
          border-color: var(--color-border-strong);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
        }
        .card:active {
          transform: scale(0.98);
        }
        @media (prefers-reduced-motion: reduce) {
          .card {
            transition: border-color 120ms ease;
          }
          .card:hover {
            transform: none;
            box-shadow: none;
          }
        }
        @media (hover: none) {
          .card:active {
            transform: scale(0.97);
          }
        }
        .select-btn {
          position: absolute;
          top: 8px;
          left: 8px;
          z-index: 3;
          width: 32px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: color-mix(in srgb, var(--color-bg) 94%, transparent);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          color: var(--color-text-muted);
        }
        .select-btn:hover {
          background: var(--color-bg);
          color: var(--color-text);
          border-color: var(--color-border-strong);
        }
        .select-btn-on {
          background: var(--color-text);
          border-color: var(--color-text);
          color: var(--color-bg);
        }
        .select-btn-on:hover {
          opacity: 0.88;
        }
        .actions {
          position: absolute;
          top: 8px;
          right: 8px;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }
        .action-btn {
          width: 32px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: color-mix(in srgb, var(--color-bg) 94%, transparent);
          font-size: 12px;
          line-height: 17px;
          color: var(--color-text-muted);
          opacity: 0;
          transform: translateY(6px) scale(0.92);
          pointer-events: none;
          transition:
            opacity 160ms ease,
            transform 180ms cubic-bezier(0.2, 0.8, 0.25, 1),
            color 120ms ease,
            background 120ms ease,
            border-color 120ms ease;
        }
        .card-shell:hover .action-btn,
        .card-shell:focus-within .action-btn,
        .actions.actions-open .action-btn,
        .action-btn.is-pinned {
          opacity: 1;
          transform: translateY(0) scale(1);
          pointer-events: auto;
        }
        /* Touch devices: always show action buttons so there's no hover gate. */
        @media (hover: none) {
          .action-btn {
            opacity: 1;
            transform: none;
            pointer-events: auto;
            box-shadow: none;
          }
        }
        @media (max-width: 768px) {
          .actions {
            top: 6px;
            right: 6px;
            gap: 4px;
          }
          .action-btn {
            width: 26px;
            height: 26px;
            font-size: 12px;
          }
          .action-btn :global(svg) {
            width: 12px;
            height: 12px;
          }
          /* Smallest (3-col) preset: collapse pin into the overflow menu. */
          .actions-collapsed {
            gap: 0;
          }
          .actions-collapsed .pin-btn {
            display: none;
          }
          .actions-collapsed .action-btn {
            width: 22px;
            height: 22px;
            font-size: 12px;
          }
          .actions-collapsed .action-btn :global(svg) {
            width: 10px;
            height: 10px;
          }
        }
        .action-btn:hover:not(:disabled) {
          color: var(--color-text);
          border-color: var(--color-border-strong);
          background: var(--color-bg);
        }
        .action-btn:disabled {
          cursor: default;
        }
        .pin-btn.is-pinned {
          color: var(--color-text);
          border-color: var(--color-border-strong);
          background: var(--color-bg);
        }
        @media (prefers-reduced-motion: reduce) {
          .action-btn {
            transition: opacity 120ms ease;
            transform: none;
          }
          .card-shell:hover .action-btn,
          .card-shell:focus-within .action-btn,
          .actions.actions-open .action-btn,
          .action-btn.is-pinned {
            transform: none;
          }
        }
        .menu {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          min-width: 112px;
          border: 1px solid var(--color-border);
          border-radius: 10px;
          background: var(--color-bg);
          overflow: hidden;
          z-index: 4;
        }
        .menu-item {
          width: 100%;
          text-align: left;
          padding: 8px 10px;
          font-size: 12px;
          color: var(--color-text);
        }
        .menu-item:hover {
          background: var(--color-bg-hover);
        }
        .menu-separator {
          height: 1px;
          margin: 4px 8px;
          background: var(--color-border);
        }
        .thumb-wrap {
          position: relative;
          aspect-ratio: 16 / 10;
          border-bottom: 1px solid var(--color-border);
          overflow: hidden;
        }
        .thumb {
          position: absolute;
          inset: 0;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .thumb.is-drop-active {
          outline: 1px solid color-mix(in srgb, var(--color-text) 18%, transparent);
          outline-offset: -1px;
        }
        .thumb :global(img) {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: top center;
          display: block;
          transition:
            filter 220ms ease,
            opacity 220ms ease,
            transform 300ms ease;
        }
        /* Recipe hero and product inset images are framed compositions
           (1280×800 = 16:10, matching the card exactly) or centered
           product shots — vertically center them so food photos and
           product images don't crop to the top. */
        .thumb :global(img[data-asset-type="recipe_hero"]),
        .thumb :global(img[data-asset-type="product_inset"]) {
          object-position: center center;
        }
        @media (hover: hover) {
          .card-shell:hover .thumb :global(img),
          .card-shell:focus-within .thumb :global(img) {
            transform: scale(1.04);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .thumb :global(img) {
            transition: opacity 160ms ease;
          }
        }
        .thumb-fallback {
          padding: 0 12px;
          text-align: center;
        }
        .drop-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: color-mix(in srgb, var(--color-bg) 62%, transparent);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          z-index: 2;
          padding: 12px;
          text-align: center;
        }
        .cover-refresh-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: color-mix(in srgb, var(--color-bg) 36%, transparent);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          pointer-events: none;
        }
        .cover-refresh-copy {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 188px;
          padding: 11px 20px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--color-bg) 96%, transparent);
          border: 1px solid var(--color-border);
          color: var(--color-text);
          font-size: 12px;
          line-height: 17px;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
        }
        .broken-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 3;
          pointer-events: none;
        }
        .broken-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          pointer-events: auto;
          animation: brokenBackdropIn 200ms ease;
        }
        @keyframes brokenBackdropIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .broken-trigger {
          position: relative;
          z-index: 1;
          height: 32px;
          padding: 0 16px;
          border-radius: 999px;
          border: none;
          background: #ef4444;
          color: #fff;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
          pointer-events: auto;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }
        .broken-trigger:hover {
          background: #dc2626;
        }
        .broken-trigger .text-short {
          display: none;
        }
        @media (max-width: 1024px) {
          .broken-trigger {
            height: 28px;
            padding: 0 12px;
          }
        }
        @media (max-width: 640px) {
          .broken-trigger {
            height: 26px;
            padding: 0 10px;
          }
          .broken-trigger .text-full {
            display: none;
          }
          .broken-trigger .text-short {
            display: inline;
          }
        }
        @media (max-width: 375px) {
          .broken-trigger {
            height: 24px;
            padding: 0 8px;
          }
        }
        .broken-actions {
          position: relative;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          animation: brokenActionsIn 200ms ease;
        }
        @keyframes brokenActionsIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        .broken-pill {
          height: 32px;
          padding: 0 16px;
          border-radius: 999px;
          border: none;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
          pointer-events: auto;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .broken-pill:disabled {
          opacity: 0.6;
          cursor: default;
        }
        @media (max-width: 1024px) {
          .broken-pill {
            height: 28px;
            padding: 0 12px;
          }
        }
        @media (max-width: 640px) {
          .broken-pill {
            height: 26px;
            padding: 0 10px;
          }
        }
        @media (max-width: 375px) {
          .broken-pill {
            height: 24px;
            padding: 0 8px;
          }
        }
        .broken-pill-confirm {
          background: #ef4444;
          color: #fff;
        }
        .broken-pill-confirm:hover:not(:disabled) {
          background: #dc2626;
          transform: scale(1.05);
        }
        .broken-pill-active {
          background: #22c55e;
          color: #fff;
        }
        .broken-pill-active:hover:not(:disabled) {
          background: #16a34a;
          transform: scale(1.05);
        }
        .drop-copy {
          border: 1px solid color-mix(in srgb, var(--color-border-strong) 82%, transparent);
          border-radius: 999px;
          background: color-mix(in srgb, var(--color-bg) 88%, transparent);
          padding: 7px 12px;
          font-size: 12px;
          color: var(--color-text);
        }
        .undo-strip {
          position: absolute;
          left: 8px;
          right: 8px;
          bottom: 8px;
          display: flex;
          gap: 6px;
          justify-content: flex-end;
          z-index: 3;
        }
        .undo-btn {
          border-radius: 999px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 500;
          border: 1px solid color-mix(in srgb, var(--color-border-strong) 82%, transparent);
          cursor: pointer;
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          transition: opacity 120ms ease, transform 120ms ease;
        }
        .undo-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .undo-btn-secondary {
          background: color-mix(in srgb, var(--color-bg) 82%, transparent);
          color: var(--color-text);
        }
        .undo-btn-secondary:hover:not(:disabled) {
          background: color-mix(in srgb, var(--color-bg) 94%, transparent);
        }
        .undo-btn-primary {
          background: var(--color-text);
          color: var(--color-bg);
          border-color: var(--color-text);
        }
        .undo-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
        }
        .body {
          padding: 14px 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex: 1;
          text-align: left;
          cursor: pointer;
          background: var(--color-bg-secondary);
        }
        @media (max-width: 768px) {
          .body {
            padding: 8px 10px 10px;
            gap: 3px;
          }
          .desc {
            display: none;
          }
          .meta {
            gap: 5px;
          }
          .fav {
            width: 12px;
            height: 12px;
          }
        }
        @media (hover: hover) {
          .body:hover {
            background: color-mix(in srgb, var(--color-bg-hover) 78%, transparent);
          }
        }
        .body:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--color-text) 22%, transparent);
          outline-offset: -2px;
        }
        .body-button {
          display: flex;
          flex-direction: column;
          gap: 6px;
          align-items: stretch;
          text-align: left;
          width: 100%;
        }
        .title {
          font-size: 12px;
          line-height: 17px;
          font-weight: 600;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        @media (max-width: 768px) {
          .title {
            font-size: 12px;
            font-weight: 600;
            -webkit-line-clamp: 2;
            line-height: 17px;
          }
        }
        .meta {
          display: flex;
          align-items: center;
          gap: 7px;
          min-width: 0;
        }
        .fav {
          width: 14px;
          height: 14px;
          border-radius: 2px;
          flex-shrink: 0;
        }
        .host {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .desc {
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
          line-height: 17px;
        }
        .tags-overlay {
          position: absolute;
          left: 10px;
          right: 10px;
          bottom: 10px;
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          gap: 6px;
          opacity: 0;
          transform: translateY(6px) scale(0.96);
          pointer-events: none;
          transition:
            opacity 160ms ease,
            transform 200ms cubic-bezier(0.2, 0.8, 0.25, 1);
          z-index: 1;
        }
        @media (hover: hover) {
          .card-shell:hover .tags-overlay,
          .card-shell:focus-within .tags-overlay {
            opacity: 1;
            transform: translateY(0) scale(1);
            pointer-events: auto;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .tags-overlay {
            transition: opacity 120ms ease;
            transform: none;
          }
          .card-shell:hover .tags-overlay,
          .card-shell:focus-within .tags-overlay {
            transform: none;
          }
        }
        .tag {
          font-size: 12px;
          padding: 4px 8px;
          border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
          border-radius: 999px;
          color: var(--color-text);
          background: color-mix(in srgb, var(--color-bg) 82%, transparent);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        .tag-interactive {
          cursor: pointer;
        }
        .tag-interactive:hover {
          color: var(--color-text);
          border-color: var(--color-border-strong);
          background: var(--color-bg);
        }
        .tag-overflow {
          font-size: 12px;
          padding: 4px 8px;
          border: 1px dashed color-mix(in srgb, var(--color-border) 50%, transparent);
          border-radius: 999px;
          color: var(--color-text-muted);
          background: color-mix(in srgb, var(--color-bg) 82%, transparent);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          cursor: pointer;
          font-family: inherit;
        }
        .tag-overflow:hover {
          color: var(--color-text);
          border-color: var(--color-border-strong);
          background: var(--color-bg);
        }
        .tag-overlay-backdrop {
          position: fixed;
          inset: 0;
          z-index: 80;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .tag-overlay-panel {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: center;
          max-width: 480px;
        }
        .tag-overlay-panel .tag {
          font-size: 12px;
          padding: 6px 12px;
        }
        .tagging-badge {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--color-text-muted);
          opacity: 0.5;
          z-index: 1;
        }
      `}</style>
    </motion.div>
  );
}
