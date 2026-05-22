"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notify } from "@/lib/notify";

interface TagWithCount {
  tag: string;
  count: number;
}

interface SimilarGroup {
  tags: string[];
  counts: number[];
  totalBookmarks: number;
  reason: "case_insensitive" | "normalized" | "levenshtein";
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** All unique tags with counts from the current scope. */
  allTags: TagWithCount[];
  /** Called after a successful merge so the parent can refresh. */
  onMerged?: () => void;
};

export default function TagManagerModal({ open, onClose, allTags, onMerged }: Props) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetTag, setTargetTag] = useState<string | null>(null);
  const [newTargetName, setNewTargetName] = useState("");
  const [showNewTarget, setShowNewTarget] = useState(false);
  const [similarGroups, setSimilarGroups] = useState<SimilarGroup[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("savers.dismissed-similar");
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    mergeId: string | null;
  } | null>(null);
  const [toastTimer, setToastTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Fetch similar groups when modal opens.
  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSelected(new Set());
    setTargetTag(null);
    setNewTargetName("");
    setShowNewTarget(false);
    setToast(null);
    fetch("/api/tags/similar")
      .then((r) => r.json())
      .then((d) => setSimilarGroups(d.groups ?? []))
      .catch(() => {});
  }, [open]);

  // Clear toast timer on unmount.
  useEffect(() => {
    return () => {
      if (toastTimer) clearTimeout(toastTimer);
    };
  }, [toastTimer]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allTags;
    const q = search.toLowerCase();
    return allTags.filter((t) => t.tag.toLowerCase().includes(q));
  }, [allTags, search]);

  const selectedCount = selected.size;
  const canMerge =
    !busy &&
    selectedCount >= 1 &&
    (!!targetTag || (showNewTarget && newTargetName.trim().length > 0));

  function toggleTag(tag: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
        // If this was the target, clear it.
        if (targetTag === tag) setTargetTag(null);
      } else {
        next.add(tag);
      }
      return next;
    });
  }

  function selectAllInGroup(group: SimilarGroup) {
    const next = new Set(selected);
    for (const t of group.tags) next.add(t);
    setSelected(next);
    // Default target to the first (shortest) tag.
    const sorted = [...group.tags].sort((a, b) => a.length - b.length);
    setTargetTag(sorted[0]);
  }

  async function handleMerge() {
    const sourceTags = Array.from(selected);
    const target = showNewTarget ? newTargetName.trim().toLowerCase() : targetTag;
    if (!target || sourceTags.length === 0) return;

    setBusy(true);
    try {
      const res = await fetch("/api/tags/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceTags, targetTag: target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Merge failed");

      setSelected(new Set());
      setTargetTag(null);
      setNewTargetName("");
      setShowNewTarget(false);

      const msg =
        data.affectedBookmarks > 0
          ? `Merged ${sourceTags.length} tag${sourceTags.length > 1 ? "s" : ""} → "${target}" (${data.affectedBookmarks} bookmark${data.affectedBookmarks !== 1 ? "s" : ""})`
          : `No bookmarks affected by merge into "${target}".`;

      const timer = setTimeout(() => setToast(null), 5000);
      setToastTimer(timer);
      setToast({ message: msg, mergeId: data.mergeId ?? null });
      onMerged?.();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Merge failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleUndo() {
    if (!toast?.mergeId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/tags/merge/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mergeId: toast.mergeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Undo failed");

      if (toastTimer) clearTimeout(toastTimer);
      setToast(null);
      onMerged?.();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Undo failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="tmm-backdrop" onClick={onClose}>
      <div className="tmm-panel" onClick={(e) => e.stopPropagation()}>
        <header className="tmm-head">
          <span className="tmm-title">Manage Tags</span>
          <button className="icon-btn tmm-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="tmm-body">
          {/* Similar groups */}
          {(() => {
            const visible = similarGroups.filter((g) => {
              const key = [...g.tags].sort().join(",");
              return !dismissed.has(key);
            });
            if (visible.length === 0) return null;
            return (
              <section className="tmm-section">
                <div className="label">Similar tags</div>
                {visible.map((group, gi) => {
                  const dismissKey = [...group.tags].sort().join(",");
                  return (
                    <div key={gi} className="tmm-similar-row">
                      <div className="tmm-similar-tags">
                        {group.tags.map((t, i) => (
                          <span key={t} className="tmm-similar-tag">
                            {t}
                            <span className="tmm-similar-count">{group.counts[i]}</span>
                          </span>
                        ))}
                      </div>
                      <div className="tmm-similar-actions">
                        <button
                          className="pill-btn"
                          onClick={() => selectAllInGroup(group)}
                        >
                          Merge
                        </button>
                        <button
                          className="tmm-dismiss-btn"
                          title="Not the same — don't suggest again"
                          onClick={() => {
                            setDismissed((prev) => {
                              const next = new Set(prev);
                              next.add(dismissKey);
                              try {
                                localStorage.setItem(
                                  "savers.dismissed-similar",
                                  JSON.stringify([...next]),
                                );
                              } catch {}
                              return next;
                            });
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })()}

          {/* Search */}
          <input
            className="tmm-search"
            placeholder="Search tags…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {/* Tag list */}
          <div className="tmm-list">
            {filtered.length === 0 && (
              <div className="tmm-empty muted">No tags found.</div>
            )}
            {filtered.map((t) => {
              const isSel = selected.has(t.tag);
              const isTarget = targetTag === t.tag;
              return (
                <label
                  key={t.tag}
                  className={`tmm-row ${isSel ? "sel" : ""} ${isTarget ? "target" : ""}`}
                >
                  <input
                    type="checkbox"
                    className="tmm-check"
                    checked={isSel}
                    onChange={() => toggleTag(t.tag)}
                  />
                  <span className="tmm-tag-name">{t.tag}</span>
                  <span className="tmm-tag-count muted">{t.count}</span>
                  {isSel && !isTarget && (
                    <button
                      className="tmm-set-target"
                      onClick={(e) => {
                        e.preventDefault();
                        setTargetTag(t.tag);
                        setShowNewTarget(false);
                      }}
                    >
                      use as target
                    </button>
                  )}
                  {isTarget && (
                    <span className="tmm-target-badge">target</span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <footer className="tmm-foot">
          <div className="tmm-foot-left">
            {selectedCount > 0 && (
              <span className="muted">
                {selectedCount} tag{selectedCount > 1 ? "s" : ""} selected
              </span>
            )}
          </div>
          <div className="tmm-foot-right">
            {/* Target selector */}
            {selectedCount >= 1 && !showNewTarget && (
              <select
                className="tmm-target-select"
                value={targetTag ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__new__") {
                    setShowNewTarget(true);
                    setTargetTag(null);
                  } else {
                    setTargetTag(v || null);
                  }
                }}
              >
                <option value="">Merge into…</option>
                {Array.from(selected).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                <option value="__new__">+ New tag…</option>
              </select>
            )}
            {showNewTarget && (
              <input
                className="tmm-new-target-input"
                placeholder="New tag name"
                value={newTargetName}
                onChange={(e) => setNewTargetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setShowNewTarget(false);
                    setNewTargetName("");
                  }
                }}
                autoFocus
              />
            )}
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={!canMerge}
              onClick={handleMerge}
            >
              {busy ? "Merging…" : "Merge"}
            </button>
          </div>
        </footer>
      </div>

      {/* Toast */}
      {toast && (
        <div className="tmm-toast" role="status">
          <span>{toast.message}</span>
          {toast.mergeId && (
            <button className="tmm-undo-btn" onClick={handleUndo} disabled={busy}>
              Undo
            </button>
          )}
        </div>
      )}

      <style jsx global>{`
        .tmm-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
          z-index: 80;
        }
        .tmm-panel {
          width: 560px;
          max-width: 100%;
          max-height: 86vh;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.32);
        }
        .tmm-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 16px;
          border-bottom: 1px solid var(--color-border);
        }
        .tmm-title {
          font-size: 12px;
          font-weight: 600;
        }
        .tmm-close {
          appearance: none;
          color: var(--color-text);
        }
        .tmm-body {
          flex: 1;
          overflow-y: auto;
          padding: 16px 16px 8px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .tmm-section {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .label {
          font-size: 12px;
          color: var(--color-text-muted);
        }
        .tmm-similar-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 6px 8px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-bg-secondary);
        }
        .tmm-similar-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .tmm-similar-tag {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 1px 6px;
          border-radius: var(--radius-sm);
          background: var(--color-bg);
          font-size: 12px;
        }
        .tmm-similar-count {
          font-size: 12px;
          color: var(--color-text-muted);
          font-feature-settings: "tnum" 1;
        }
        .tmm-similar-actions {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .tmm-dismiss-btn {
          appearance: none;
          background: transparent;
          border: 0;
          color: var(--color-text-muted);
          font-size: 14px;
          cursor: pointer;
          padding: 0 2px;
          line-height: 1;
        }
        .tmm-dismiss-btn:hover {
          color: var(--color-text);
        }
        .tmm-search {
          font-size: 12px;
          padding: 6px 8px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-bg);
        }
        .tmm-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
          max-height: 360px;
          overflow-y: auto;
        }
        .tmm-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 5px 8px;
          border-radius: var(--radius-sm);
          cursor: pointer;
          font-size: 12px;
        }
        .tmm-row:hover {
          background: var(--color-bg-hover);
        }
        .tmm-row.sel {
          background: var(--color-bg-active);
        }
        .tmm-row.target {
          box-shadow: inset 0 0 0 1px var(--color-text);
        }
        .tmm-check {
          accent-color: var(--color-text);
          flex-shrink: 0;
        }
        .tmm-tag-name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .tmm-tag-count {
          font-size: 12px;
          font-feature-settings: "tnum" 1;
          flex-shrink: 0;
        }
        .tmm-set-target {
          appearance: none;
          background: none;
          border: 0;
          color: var(--color-text-muted);
          font-size: 12px;
          cursor: pointer;
          padding: 0;
          text-decoration: underline;
          text-underline-offset: 2px;
          flex-shrink: 0;
        }
        .tmm-set-target:hover {
          color: var(--color-text);
        }
        .tmm-target-badge {
          font-size: 12px;
          color: var(--color-bg);
          background: var(--color-text);
          padding: 1px 6px;
          border-radius: var(--radius-sm);
          flex-shrink: 0;
        }
        .tmm-empty {
          padding: 16px;
          text-align: center;
          font-size: 12px;
        }
        .tmm-foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 12px 16px;
          border-top: 1px solid var(--color-border);
        }
        .tmm-foot-left {
          font-size: 12px;
        }
        .tmm-foot-right {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .tmm-target-select {
          height: 28px;
          padding: 0 6px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-bg);
          font: inherit;
          font-size: 12px;
        }
        .tmm-new-target-input {
          height: 28px;
          width: 140px;
          padding: 0 8px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          font: inherit;
          font-size: 12px;
          background: var(--color-bg);
        }
        .tmm-toast {
          position: fixed;
          left: 50%;
          bottom: 24px;
          transform: translateX(-50%);
          background: var(--color-text);
          color: var(--color-bg);
          padding: 10px 16px;
          border-radius: 999px;
          font-size: 12px;
          display: inline-flex;
          align-items: center;
          gap: 14px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
          z-index: 90;
        }
        .tmm-undo-btn {
          appearance: none;
          background: transparent;
          border: 0;
          color: var(--color-bg);
          font: inherit;
          font-size: 12px;
          text-decoration: underline;
          cursor: pointer;
          padding: 0;
        }
        .muted {
          color: var(--color-text-muted);
        }
        @media (max-width: 768px) {
          .tmm-backdrop {
            padding: 0;
            align-items: flex-end;
          }
          .tmm-panel {
            width: 100%;
            max-height: 90dvh;
            border-radius: 12px 12px 0 0;
          }
        }
      `}</style>
    </div>
  );
}
