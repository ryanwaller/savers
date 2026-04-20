"use client";

import { useEffect, useRef, useState } from "react";
import { PushPin } from "@phosphor-icons/react";
import type { Bookmark, Collection } from "@/lib/types";
import {
  domainOf,
  previewImageUrl,
  screenshotPreviewUrl,
  storedPreviewUrl,
  tintForDomain,
} from "@/lib/api";
import CollectionIcon from "./CollectionIcon";
import ConfirmDialog from "./ConfirmDialog";

type Props = {
  bookmarks: Bookmark[];
  subCollections: Collection[];
  onOpenCollection: (id: string) => void;
  onOpenBookmark: (b: Bookmark) => void;
  onDeleteBookmark: (id: string) => Promise<void> | void;
  onPinBookmark: (id: string, pinned: boolean) => Promise<void> | void;
  onRefreshPreview: (id: string, version: number) => Promise<void> | void;
  onTagClick: (tag: string) => void;
  loading?: boolean;
  emptyLabel?: string;
};

export default function BookmarkGrid({
  bookmarks,
  subCollections,
  onOpenCollection,
  onOpenBookmark,
  onDeleteBookmark,
  onPinBookmark,
  onRefreshPreview,
  onTagClick,
  loading,
  emptyLabel,
}: Props) {
  return (
    <div className="grid">
      {subCollections.map((c) => (
        <CollectionCard key={c.id} c={c} onClick={() => onOpenCollection(c.id)} />
      ))}
      {bookmarks.map((b) => (
        <BookmarkCard
          key={b.id}
          b={b}
          onEdit={() => onOpenBookmark(b)}
          onDelete={() => onDeleteBookmark(b.id)}
          onPin={() => onPinBookmark(b.id, !b.pinned)}
          onRefreshPreview={(version) => onRefreshPreview(b.id, version)}
          onTagClick={onTagClick}
        />
      ))}
      {!loading && bookmarks.length === 0 && subCollections.length === 0 && (
        <div className="empty">{emptyLabel ?? "Nothing here yet."}</div>
      )}
      <style jsx>{`
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
          padding: 20px;
        }
        @media (max-width: 768px) {
          .grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            padding: 12px;
            gap: 12px;
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
    </div>
  );
}

function CollectionCard({ c, onClick }: { c: Collection; onClick: () => void }) {
  const childCount = c.children?.length ?? 0;
  const bmCount = c.bookmark_count ?? 0;

  return (
    <button className="folder" onClick={onClick} title={c.name}>
      <div className="folder-thumb">
        <span className="folder-icon" aria-hidden>
          <CollectionIcon name={c.icon} size={40} />
        </span>
      </div>
      <div className="folder-body">
        <div className="folder-title">{c.name}</div>
        <div className="folder-meta small muted">
          {bmCount} bookmark{bmCount === 1 ? "" : "s"}
          {childCount > 0 && ` · ${childCount} sub`}
        </div>
      </div>
      <style jsx>{`
        .folder {
          display: flex;
          flex-direction: column;
          border: 1px solid var(--color-border);
          border-radius: var(--radius);
          overflow: hidden;
          background: var(--color-bg);
          text-align: left;
          height: 100%;
          min-height: 260px;
        }
        .folder:hover {
          border-color: var(--color-border-strong);
        }
        @media (max-width: 768px) {
          .folder {
            min-height: 0;
          }
          .folder-body {
            padding: 8px 10px 10px;
            gap: 3px;
          }
        }
        .folder-thumb {
          aspect-ratio: 16 / 10;
          background: var(--color-bg-secondary);
          border-bottom: 1px solid var(--color-border);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .folder-icon {
          font-size: 40px;
          color: var(--color-text-faint);
        }
        .folder-body {
          padding: 14px 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .folder-title {
          font-size: 12px;
          line-height: 1.45;
          font-weight: 600;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </button>
  );
}

function BookmarkCard({
  b,
  onEdit,
  onDelete,
  onPin,
  onRefreshPreview,
  onTagClick,
}: {
  b: Bookmark;
  onEdit: () => void;
  onDelete: () => Promise<void> | void;
  onPin: () => Promise<void> | void;
  onRefreshPreview: (version: number) => Promise<void> | void;
  onTagClick: (tag: string) => void;
}) {
  const [isDark, setIsDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [previewNonce, setPreviewNonce] = useState<number | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [previewStage, setPreviewStage] = useState<"stored" | "microlink" | "fallback" | "fail">(
    "microlink"
  );
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

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
  const storedSrc = storedPreviewUrl(b.preview_path, {
    previewVersion: effectivePreviewVersion,
  });
  const microlinkSrc = screenshotPreviewUrl(b.url, {
    force: previewNonce !== null,
    cacheBust: effectivePreviewVersion,
  });
  const fallbackSrc = previewImageUrl(b.url, {
    ogImage: b.og_image,
    favicon: b.favicon,
    force: previewNonce !== null,
    cacheBust: previewNonce,
    previewVersion: effectivePreviewVersion,
  });
  const screenshotSrc =
    previewStage === "stored"
      ? storedSrc
      : previewStage === "microlink"
        ? microlinkSrc
        : fallbackSrc;

  useEffect(() => {
    setPreviewFailed(false);
    setPreviewStage(storedSrc ? "stored" : "microlink");
  }, [storedSrc, microlinkSrc, fallbackSrc]);

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
    setPreviewStage("microlink");
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

  return (
    <div className="card-shell">
      <ConfirmDialog
        open={confirmDeleteOpen}
        title={`Delete "${b.title || host}"?`}
        description="This bookmark will be removed from Savers."
        confirmLabel="Delete"
        busy={deleting}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={confirmDelete}
      />
      <div className="card" title={b.title ?? b.url}>
        <div className="thumb-wrap">
          <a
            className="thumb thumb-link"
            href={b.url}
            target="_blank"
            rel="noopener noreferrer"
            draggable={false}
            style={{ background: tint }}
            onClick={(event) => event.stopPropagation()}
          >
            {screenshotSrc && !previewFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={screenshotSrc}
                src={screenshotSrc}
                alt={`Preview of ${host}`}
                draggable={false}
                onLoad={() => setReloading(false)}
                onError={() => {
                  if (previewStage === "stored") {
                    setPreviewStage("microlink");
                    return;
                  }
                  if (previewStage === "microlink") {
                    setPreviewStage("fallback");
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
          </a>
          {b.tags && b.tags.length > 0 && (
            <div className="tags-overlay">
              {b.tags.slice(0, 5).map((t) => (
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
              {b.tags.length > 5 && (
                <button
                  type="button"
                  className="tag-more"
                  onClick={(event) => {
                    event.stopPropagation();
                    onEdit();
                  }}
                  title={`Show all ${b.tags.length} tags`}
                  aria-label={`Show all ${b.tags.length} tags`}
                >
                  +
                </button>
              )}
            </div>
          )}
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

      <div ref={actionsRef} className={`actions ${menuOpen ? "actions-open" : ""}`}>
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
            <button className="menu-item" onClick={handleEdit}>
              Edit
            </button>
            <button className="menu-item" onClick={handleReloadPreview} disabled={reloading}>
              {reloading ? "Reloading…" : "Reload preview"}
            </button>
            <button className="menu-item danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </button>
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
        }
        @media (max-width: 768px) {
          .card-shell,
          .card {
            min-height: 0;
          }
        }
        .card:hover {
          border-color: var(--color-border-strong);
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
          font-size: 14px;
          line-height: 1;
          color: var(--color-text-muted);
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
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
        .thumb :global(img) {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition:
            filter 220ms ease,
            opacity 220ms ease,
            transform 300ms ease;
        }
        @media (hover: hover) {
          .card-shell:hover .thumb :global(img),
          .card-shell:focus-within .thumb :global(img) {
            filter: blur(1.5px);
            opacity: 0.78;
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
        .body {
          padding: 14px 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex: 1;
          text-align: left;
          cursor: pointer;
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
          font-size: 14px;
          line-height: 1.4;
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
            line-height: 1.35;
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
          line-height: 1.4;
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
        .tag-more {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          padding: 0;
          border-radius: 999px;
          font-size: 14px;
          font-weight: 500;
          line-height: 1;
          color: var(--color-text);
          background: color-mix(in srgb, var(--color-bg) 82%, transparent);
          border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          cursor: pointer;
        }
        .tag-more:hover {
          color: var(--color-text);
          border-color: var(--color-border-strong);
          background: var(--color-bg);
        }
      `}</style>
    </div>
  );
}
