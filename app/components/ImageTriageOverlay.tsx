"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ImageRow } from "./ImageGrid";
import CollectionIcon from "./CollectionIcon";

type ImageCollection = {
  id: string;
  name: string;
  parent_id: string | null;
  icon?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  imageCollections: ImageCollection[];
  /**
   * Notified after each mutation so the parent can refresh the grid +
   * counts (the unsorted image list shrinks as the user assigns or
   * deletes each one).
   */
  onMutated?: () => void;
};

type Step =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "empty" }
  | { kind: "error"; message: string };

/**
 * Triage flow for images:
 *   Load the user's unsorted images (collection_id IS NULL), present them
 *   one at a time, and let the user route each one with one click:
 *
 *     • Move to a folder        → assigns collection_id, advances
 *     • Trash                   → DELETE, advances
 *     • Skip                    → advances without mutation
 *
 * No AI suggestion step yet — the auto-tagger already runs at upload, so
 * by the time you triage these the AI tags should be there. This is the
 * "where does this belong?" step, not "what is this?".
 */
export default function ImageTriageOverlay({
  open,
  onClose,
  imageCollections,
  onMutated,
}: Props) {
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [queue, setQueue] = useState<ImageRow[]>([]);
  const [busy, setBusy] = useState(false);

  const current = queue[0] ?? null;
  const remaining = queue.length;

  const loadQueue = useCallback(async () => {
    setStep({ kind: "loading" });
    try {
      const res = await fetch("/api/images?unsorted=1&sort=newest&limit=200", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStep({ kind: "error", message: body?.error || "Couldn't load unsorted images." });
        return;
      }
      const rows = (body.images as ImageRow[]) || [];
      setQueue(rows);
      setStep(rows.length === 0 ? { kind: "empty" } : { kind: "ready" });
    } catch (err) {
      setStep({ kind: "error", message: err instanceof Error ? err.message : "Network error." });
    }
  }, []);

  useEffect(() => {
    if (open) void loadQueue();
  }, [open, loadQueue]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  const advance = useCallback(() => {
    setQueue((prev) => {
      const next = prev.slice(1);
      if (next.length === 0) setStep({ kind: "empty" });
      return next;
    });
  }, []);

  const moveTo = useCallback(
    async (collectionId: string) => {
      if (!current || busy) return;
      setBusy(true);
      try {
        const res = await fetch(`/api/images/${current.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collection_id: collectionId }),
        });
        if (!res.ok) {
          console.error("[image-triage] move failed", await res.text().catch(() => ""));
          return;
        }
        onMutated?.();
        advance();
      } finally {
        setBusy(false);
      }
    },
    [current, busy, onMutated, advance],
  );

  const trash = useCallback(async () => {
    if (!current || busy) return;
    if (!confirm(`Delete "${current.title || "this image"}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/images/${current.id}`, { method: "DELETE" });
      if (!res.ok) {
        console.error("[image-triage] delete failed", await res.text().catch(() => ""));
        return;
      }
      onMutated?.();
      advance();
    } finally {
      setBusy(false);
    }
  }, [current, busy, onMutated, advance]);

  const skip = useCallback(() => {
    if (busy) return;
    advance();
  }, [busy, advance]);

  const sortedFolders = useMemo(
    () => [...imageCollections].sort((a, b) => a.name.localeCompare(b.name)),
    [imageCollections],
  );

  if (!open) return null;

  return (
    <div className="it-backdrop" onClick={onClose}>
      <div className="it-panel" onClick={(e) => e.stopPropagation()}>
        <div className="it-head">
          <div className="it-title">
            Triage images
            {step.kind === "ready" && (
              <span className="it-counter"> · {remaining} left</span>
            )}
          </div>
          <button
            className="it-close"
            onClick={onClose}
            aria-label="Close"
            disabled={busy}
          >
            ×
          </button>
        </div>

        <div className="it-body">
          {step.kind === "loading" && <div className="it-msg">Loading unsorted images…</div>}
          {step.kind === "error" && <div className="it-msg it-msg-err">{step.message}</div>}
          {step.kind === "empty" && (
            <div className="it-msg">
              All caught up — no unsorted images. <br />
              <button className="it-link" onClick={onClose}>Close</button>
            </div>
          )}
          {step.kind === "ready" && current && (
            <>
              <div className="it-stage">
                {current.preview_url ? (
                  <img
                    src={current.preview_url}
                    alt={current.title || ""}
                    draggable={false}
                  />
                ) : (
                  <div className="it-placeholder">
                    {current.processing_status === "pending"
                      ? "Preview rendering…"
                      : "No preview available"}
                  </div>
                )}
              </div>
              <div className="it-meta">
                <div className="it-card-title">{current.title || "Untitled"}</div>
                <div className="it-card-sub">
                  {current.file_kind?.toUpperCase()} ·{" "}
                  {current.width && current.height
                    ? `${current.width} × ${current.height}`
                    : "—"}
                </div>
              </div>

              <div className="it-actions-row">
                <button
                  type="button"
                  className="it-btn"
                  onClick={skip}
                  disabled={busy}
                >
                  Skip
                </button>
                <button
                  type="button"
                  className="it-btn danger"
                  onClick={() => void trash()}
                  disabled={busy}
                >
                  Trash
                </button>
              </div>

              <div className="it-folder-label">Move to folder</div>
              <div className="it-folders">
                {sortedFolders.length === 0 ? (
                  <div className="small muted">
                    No image folders yet. Create one from the sidebar first.
                  </div>
                ) : (
                  sortedFolders.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="it-folder-btn"
                      onClick={() => void moveTo(c.id)}
                      disabled={busy}
                      title={c.name}
                    >
                      <span className="it-folder-icon" aria-hidden>
                        <CollectionIcon name={c.icon ?? null} size={14} />
                      </span>
                      <span className="it-folder-name">{c.name}</span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        .it-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.45);
          z-index: 150;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .it-panel {
          width: 100%;
          max-width: 920px;
          max-height: 90vh;
          background: var(--color-bg);
          color: var(--color-text);
          border: 1px solid var(--color-border);
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
        }
        .it-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
          border-bottom: 1px solid var(--color-border);
        }
        .it-title { font-size: 14px; font-weight: 600; }
        .it-counter { color: var(--color-text-muted); font-weight: 400; }
        .it-close {
          width: 28px;
          height: 28px;
          border-radius: 14px;
          border: 1px solid var(--color-border);
          background: transparent;
          color: var(--color-text);
          font-size: 18px;
          line-height: 1;
          cursor: pointer;
        }
        .it-close:hover { background: var(--color-bg-hover); }
        .it-close:disabled { opacity: 0.4; cursor: not-allowed; }

        .it-body {
          padding: 18px;
          overflow-y: auto;
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .it-msg { padding: 32px; text-align: center; color: var(--color-text-muted); }
        .it-msg-err { color: #d96a6a; }
        .it-link {
          background: none;
          border: none;
          color: var(--color-text);
          text-decoration: underline;
          cursor: pointer;
          font-size: inherit;
          padding: 4px 0;
        }

        .it-stage {
          width: 100%;
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: 10px;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 280px;
          max-height: 60vh;
        }
        .it-stage img {
          max-width: 100%;
          max-height: 60vh;
          object-fit: contain;
        }
        .it-placeholder {
          padding: 40px;
          color: var(--color-text-muted);
          text-align: center;
        }
        .it-meta {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .it-card-title { font-weight: 500; font-size: 14px; }
        .it-card-sub { color: var(--color-text-muted); font-size: 12px; }

        .it-actions-row {
          display: flex;
          gap: 8px;
        }
        .it-btn {
          padding: 8px 16px;
          border: 1px solid var(--color-border);
          border-radius: 8px;
          background: var(--color-bg);
          color: var(--color-text);
          font-size: 13px;
          cursor: pointer;
        }
        .it-btn:hover { background: var(--color-bg-hover); }
        .it-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .it-btn.danger { color: #d96a6a; }
        .it-btn.danger:hover { background: rgba(220, 80, 80, 0.08); }

        .it-folder-label {
          font-size: 11px;
          color: var(--color-text-muted);
          letter-spacing: 0.05em;
          text-transform: uppercase;
          margin-top: 4px;
        }
        .it-folders {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .it-folder-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px 6px 8px;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: var(--color-bg);
          color: var(--color-text);
          font-size: 13px;
          cursor: pointer;
        }
        .it-folder-btn:hover {
          background: var(--color-bg-hover);
          border-color: var(--color-border-strong);
        }
        .it-folder-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .it-folder-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--color-text-muted);
          width: 14px;
          height: 14px;
        }
        .it-folder-btn:hover .it-folder-icon { color: var(--color-text); }
        .it-folder-name {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 180px;
        }
      `}</style>
    </div>
  );
}
