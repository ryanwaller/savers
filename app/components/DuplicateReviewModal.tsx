"use client";

import { useEffect, useMemo, useState } from "react";
import type { DuplicateGroup } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  groups: DuplicateGroup[];
  onDeleted: () => void;
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });
  } catch {
    return iso;
  }
}

export default function DuplicateReviewModal({ open, onClose, groups, onDeleted }: Props) {
  // keptByGroup: canonicalUrl -> Set of bookmark IDs to KEEP
  const [keptByGroup, setKeptByGroup] = useState<Map<string, Set<string>>>(new Map());
  const [strategy, setStrategy] = useState<"newest" | "oldest" | "manual">("newest");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    deleteId: string | null;
  } | null>(null);
  const [toastTimer, setToastTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when modal opens or groups change.
  useEffect(() => {
    if (!open) return;
    setToast(null);
    applyStrategy("newest");
    setStrategy("newest");
  }, [open, groups]);

  // Clear toast timer on unmount.
  useEffect(() => {
    return () => {
      if (toastTimer) clearTimeout(toastTimer);
    };
  }, [toastTimer]);

  function applyStrategy(s: "newest" | "oldest" | "manual") {
    const next = new Map<string, Set<string>>();
    for (const group of groups) {
      const instances = [...group.instances];
      if (s === "newest") {
        instances.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
      } else if (s === "oldest") {
        instances.sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
      }
      // Manual: leave empty (no pre-selection) — keptByGroup entry won't exist
      if (s !== "manual") {
        next.set(group.canonicalUrl, new Set([instances[0].id]));
      }
    }
    setKeptByGroup(next);
  }

  function handleStrategyChange(s: "newest" | "oldest" | "manual") {
    setStrategy(s);
    applyStrategy(s);
  }

  function toggleInstance(canonicalUrl: string, id: string) {
    setKeptByGroup((prev) => {
      const next = new Map(prev);
      const current = next.get(canonicalUrl);
      if (!current || current.size === 0) {
        // No selection yet — check it
        next.set(canonicalUrl, new Set([id]));
      } else if (current.has(id)) {
        // Unchecking — prevent if last remaining
        if (current.size === 1) return prev;
        const nextSet = new Set(current);
        nextSet.delete(id);
        next.set(canonicalUrl, nextSet);
      } else {
        // Adding to keep set
        const nextSet = new Set(current);
        nextSet.add(id);
        next.set(canonicalUrl, nextSet);
      }
      return next;
    });
  }

  // Total IDs to delete = all instances minus those kept.
  const deleteCount = useMemo(() => {
    let count = 0;
    for (const group of groups) {
      const kept = keptByGroup.get(group.canonicalUrl);
      const keptSize = kept?.size ?? 0;
      count += group.instances.length - keptSize;
    }
    return count;
  }, [groups, keptByGroup]);

  const canDelete = !busy && deleteCount > 0;

  async function handleDelete() {
    const idsToDelete: string[] = [];
    for (const group of groups) {
      const kept = keptByGroup.get(group.canonicalUrl);
      for (const inst of group.instances) {
        if (!kept?.has(inst.id)) {
          idsToDelete.push(inst.id);
        }
      }
    }

    if (idsToDelete.length === 0) return;

    setBusy(true);
    try {
      const res = await fetch("/api/bookmarks/duplicates/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: idsToDelete }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");

      const msg = `Deleted ${data.deletedCount} bookmark${data.deletedCount !== 1 ? "s" : ""}.`;

      const timer = setTimeout(() => setToast(null), 5000);
      setToastTimer(timer);
      setToast({ message: msg, deleteId: data.deleteId ?? null });
      onDeleted();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleUndo() {
    if (!toast?.deleteId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/bookmarks/duplicates/delete/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteId: toast.deleteId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Undo failed");

      if (toastTimer) clearTimeout(toastTimer);
      setToast(null);
      onDeleted();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Undo failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="dr-backdrop" onClick={onClose}>
      <div className="dr-panel" onClick={(e) => e.stopPropagation()}>
        <header className="dr-head">
          <span className="dr-title">Review Duplicates</span>
          <button className="icon-btn dr-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {/* Toolbar */}
        <div className="dr-toolbar">
          <span className="muted">
            {groups.length} group{groups.length !== 1 ? "s" : ""} ·{" "}
            {groups.reduce((s, g) => s + g.instances.length - 1, 0)} duplicate
            {groups.reduce((s, g) => s + g.instances.length - 1, 0) !== 1 ? "s" : ""}
          </span>
          <select
            className="dr-strategy-select"
            value={strategy}
            onChange={(e) => handleStrategyChange(e.target.value as typeof strategy)}
          >
            <option value="newest">Keep Newest</option>
            <option value="oldest">Keep Oldest</option>
            <option value="manual">Manual Only</option>
          </select>
        </div>

        {/* Body */}
        <div className="dr-body">
          {groups.length === 0 && (
            <div className="dr-empty muted">No duplicate bookmarks found.</div>
          )}
          {groups.map((group) => {
            const kept = keptByGroup.get(group.canonicalUrl);
            const keptSize = kept?.size ?? 0;
            const hasNoneSelected = keptSize === 0;
            return (
              <div key={group.canonicalUrl} className="dr-group">
                <div className="dr-group-header">
                  <div className="dr-group-url">
                    <span className="dr-group-host">{group.displayHost}</span>
                    {group.displayPath && (
                      <span className="dr-group-path muted">{group.displayPath}</span>
                    )}
                  </div>
                  <div className="dr-group-badges">
                    {group.isCrossCollection && (
                      <span className="dr-badge dr-badge-cross">
                        Different collections
                      </span>
                    )}
                    {!group.isCrossCollection && (
                      <span className="dr-badge dr-badge-same">
                        ⚠ Same collection
                      </span>
                    )}
                    {hasNoneSelected && (
                      <span className="dr-badge dr-badge-warn">
                        Select at least one to keep
                      </span>
                    )}
                  </div>
                </div>
                {group.instances.map((inst) => {
                  const isKept = kept?.has(inst.id) ?? false;
                  const isLastKept = keptSize === 1 && isKept;
                  return (
                    <label
                      key={inst.id}
                      className={`dr-instance ${isKept ? "kept" : "deleted"}`}
                    >
                      <input
                        type="checkbox"
                        className="dr-check"
                        checked={isKept}
                        disabled={isLastKept}
                        onChange={() => toggleInstance(group.canonicalUrl, inst.id)}
                      />
                      {inst.favicon && (
                        <img
                          className="dr-fav"
                          src={inst.favicon}
                          alt=""
                          width={12}
                          height={12}
                        />
                      )}
                      <span className="dr-instance-title">
                        {inst.title || inst.url}
                      </span>
                      <span className="dr-instance-collection muted">
                        {inst.collection_name}
                      </span>
                      <span className="dr-instance-date muted">
                        {formatDate(inst.created_at)}
                      </span>
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <footer className="dr-foot">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!canDelete}
            onClick={handleDelete}
          >
            {busy ? "Deleting…" : `Delete ${deleteCount} Duplicate${deleteCount !== 1 ? "s" : ""}`}
          </button>
        </footer>
      </div>

      {/* Toast */}
      {toast && (
        <div className="dr-toast" role="status">
          <span>{toast.message}</span>
          {toast.deleteId && (
            <button className="dr-undo-btn" onClick={handleUndo} disabled={busy}>
              Undo
            </button>
          )}
        </div>
      )}

      <style jsx global>{`
        .dr-backdrop {
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
        .dr-panel {
          width: 640px;
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
        .dr-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 16px;
          border-bottom: 1px solid var(--color-border);
        }
        .dr-title {
          font-size: 12px;
          font-weight: 600;
        }
        .dr-close {
          appearance: none;
          color: var(--color-text);
        }
        .dr-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 16px;
          border-bottom: 1px solid var(--color-border);
          font-size: 12px;
        }
        .dr-strategy-select {
          height: 28px;
          padding: 0 6px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-bg);
          font: inherit;
          font-size: 12px;
        }
        .dr-body {
          flex: 1;
          overflow-y: auto;
          padding: 12px 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .dr-empty {
          padding: 24px;
          text-align: center;
          font-size: 12px;
        }
        .dr-group {
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          overflow: hidden;
        }
        .dr-group-header {
          padding: 8px 10px;
          background: var(--color-bg-secondary);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
        }
        .dr-group-url {
          display: flex;
          flex-direction: column;
          gap: 1px;
          min-width: 0;
          flex: 1;
        }
        .dr-group-host {
          font-size: 12px;
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .dr-group-path {
          font-size: 12px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .dr-group-badges {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .dr-badge {
          font-size: 12px;
          padding: 1px 6px;
          border-radius: var(--radius-sm);
          white-space: nowrap;
        }
        .dr-badge-cross {
          background: var(--color-bg);
          color: var(--color-text-muted);
        }
        .dr-badge-same {
          background: rgba(209, 48, 48, 0.08);
          color: var(--color-danger, #c62828);
        }
        .dr-badge-warn {
          background: rgba(209, 48, 48, 0.08);
          color: var(--color-danger, #c62828);
        }
        .dr-instance {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          border-bottom: 1px solid var(--color-border);
          cursor: pointer;
          font-size: 12px;
          transition: background 120ms ease;
        }
        .dr-instance:last-child {
          border-bottom: 0;
        }
        .dr-instance:hover {
          background: var(--color-bg-hover);
        }
        .dr-instance.kept {
          background: var(--color-bg);
        }
        .dr-instance.deleted {
          opacity: 0.5;
        }
        .dr-instance.deleted .dr-instance-title {
          text-decoration: line-through;
        }
        .dr-check {
          accent-color: var(--color-text);
          flex-shrink: 0;
        }
        .dr-fav {
          width: 12px;
          height: 12px;
          border-radius: 2px;
          flex-shrink: 0;
        }
        .dr-instance-title {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .dr-instance-collection {
          font-size: 12px;
          font-feature-settings: "tnum" 1;
          flex-shrink: 0;
        }
        .dr-instance-date {
          font-size: 12px;
          font-feature-settings: "tnum" 1;
          flex-shrink: 0;
          min-width: 60px;
          text-align: right;
        }
        .dr-foot {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          padding: 12px 16px;
          border-top: 1px solid var(--color-border);
        }
        .dr-toast {
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
        .dr-undo-btn {
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
          .dr-backdrop {
            padding: 0;
            align-items: flex-end;
          }
          .dr-panel {
            width: 100%;
            max-height: 90dvh;
            border-radius: 12px 12px 0 0;
          }
        }
      `}</style>
    </div>
  );
}
