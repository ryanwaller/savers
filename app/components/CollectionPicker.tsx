"use client";

import { useMemo, useState } from "react";
import type { Collection } from "@/lib/types";
import CollectionIcon from "./CollectionIcon";

type Props = {
  flat: Collection[];
  value: string | null;
  onChange: (id: string | null) => void;
  onCreateCollection?: (name: string, parentId: string | null) => Promise<Collection>;
  allowUnsorted?: boolean;
  placeholder?: string;
  openDirection?: "down" | "up";
};

// Builds a "Parent / Child / Grandchild" path string for each collection
function pathMap(flat: Collection[]): Map<string, string> {
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
}

export default function CollectionPicker({
  flat,
  value,
  onChange,
  onCreateCollection,
  allowUnsorted = true,
  placeholder = "Choose a collection",
  openDirection = "down",
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);

  const paths = useMemo(() => pathMap(flat), [flat]);
  const byId = useMemo(() => new Map(flat.map((c) => [c.id, c])), [flat]);

  const depthMap = useMemo(() => {
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
  }, [flat, byId]);

  const sorted = useMemo(
    () =>
      [...flat].sort((a, b) =>
        (paths.get(a.id) || "").localeCompare(paths.get(b.id) || "")
      ),
    [flat, paths]
  );

  const filtered = useMemo(() => {
    if (!q.trim()) return sorted;
    const needle = q.toLowerCase();
    return sorted.filter((c) =>
      (paths.get(c.id) || "").toLowerCase().includes(needle)
    );
  }, [sorted, paths, q]);

  const label =
    value === null
      ? allowUnsorted ? "Unsorted" : placeholder
      : paths.get(value) || placeholder;

  async function submitNewCollection() {
    const name = newName.trim();
    if (!name || !onCreateCollection) return;
    setCreatingBusy(true);
    try {
      const collection = await onCreateCollection(name, createParentId);
      onChange(collection.id);
      setQ("");
      setNewName("");
      setCreateParentId(null);
      setCreating(false);
      setOpen(false);
    } finally {
      setCreatingBusy(false);
    }
  }

  const selectedIcon = value ? byId.get(value)?.icon ?? null : null;

  return (
    <div className={`picker ${openDirection === "up" ? "up" : "down"}`}>
      <button className="trigger" onClick={() => setOpen((v) => !v)} type="button">
        <span className={`trigger-label ${value === null && !allowUnsorted ? "muted" : ""}`}>
          {value !== null && (
            <span className="opt-icon">
              <CollectionIcon name={selectedIcon} size={13} />
            </span>
          )}
          <span className="trigger-text">{label}</span>
        </span>
        <span className="chev">▾</span>
      </button>
      {open && (
        <div className="panel" onMouseLeave={() => setOpen(false)}>
          <input
            autoFocus
            className="search"
            placeholder="Find collection…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                const firstMatch = filtered[0];
                if (firstMatch) {
                  onChange(firstMatch.id);
                  setOpen(false);
                } else if (allowUnsorted && !q.trim()) {
                  onChange(null);
                  setOpen(false);
                }
              }
            }}
          />
          {onCreateCollection && (
            creating ? (
              <div className="create-box">
                <input
                  autoFocus
                  className="search"
                  placeholder="Collection name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onBlur={() => {
                    if (!newName.trim() && !creatingBusy) setCreating(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setCreating(false);
                      setNewName("");
                      return;
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void submitNewCollection();
                    }
                  }}
                />
                <div className="parent-tree-list">
                  <button
                    type="button"
                    className={`parent-tree-opt ${createParentId === null ? "on" : ""}`}
                    onClick={() => setCreateParentId(null)}
                  >
                    No Parent
                  </button>
                  {sorted.map((c) => {
                    const depth = depthMap.get(c.id) ?? 0;
                    const isChild = depth > 0;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`parent-tree-opt ${createParentId === c.id ? "on" : ""} ${isChild ? "child" : "parent"}`}
                        style={{ paddingLeft: isChild ? `${8 + depth * 16}px` : undefined }}
                        onClick={() => setCreateParentId(c.id)}
                        title={paths.get(c.id)}
                      >
                        {isChild ? `↳ ${c.name}` : c.name}
                      </button>
                    );
                  })}
                </div>
                <div className="create-actions">
                  <button
                    type="button"
                    className="create-btn"
                    onClick={() => {
                      setCreating(false);
                      setNewName("");
                      setCreateParentId(null);
                    }}
                    disabled={creatingBusy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="create-btn primary"
                    onClick={() => void submitNewCollection()}
                    disabled={creatingBusy || !newName.trim()}
                  >
                    {creatingBusy ? "Creating…" : "Create"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="new-opt"
                onClick={() => {
                  setCreating(true);
                  setNewName(q.trim());
                  setCreateParentId(null);
                }}
              >
                + New collection
              </button>
            )
          )}
          <div className="list">
            {allowUnsorted && (
              <button
                className={`opt ${value === null ? "on" : ""}`}
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                Unsorted
              </button>
            )}
            {filtered.map((c) => {
              const depth = depthMap.get(c.id) ?? 0;
              const isChild = depth > 0;

              return (
                <button
                  key={c.id}
                  className={`opt ${value === c.id ? "on" : ""} ${isChild ? "opt-child" : ""}`}
                  style={{ paddingLeft: isChild ? `${8 + depth * 16}px` : undefined }}
                  onClick={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                  title={paths.get(c.id)}
                >
                  <span className="opt-icon">
                    <CollectionIcon name={c.icon} size={13} />
                  </span>
                  <span className={`opt-label ${!isChild ? "opt-label-bold" : ""}`}>
                    {isChild ? `↳ ${c.name}` : paths.get(c.id)}
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="empty">No matches.</div>
            )}
          </div>
        </div>
      )}
      <style jsx>{`
        .picker { position: relative; }
        .trigger {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          height: 28px;
          padding: 0 8px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-bg);
          font-size: 12px;
          text-align: left;
        }
        .trigger:hover { background: var(--color-bg-hover); }
        .chev { font-size: 12px; color: var(--color-text-muted); margin-left: 8px; }
        .panel {
          position: absolute;
          left: 0;
          right: 0;
          z-index: 20;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          padding: 6px;
          display: flex;
          flex-direction: column;
          max-height: 260px;
        }
        .picker.down .panel { top: 32px; }
        .picker.up .panel { bottom: 32px; }
        .search { font-size: 12px; margin-bottom: 4px; }
        .create-box {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 4px;
        }
        .parent-tree-list {
          max-height: 180px;
          overflow-y: auto;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-bg);
        }
        .parent-tree-opt {
          display: block;
          width: 100%;
          text-align: left;
          padding: 5px 8px;
          font-size: 12px;
          border-radius: 3px;
          color: var(--color-text);
        }
        .parent-tree-opt:hover {
          background: var(--color-bg-hover);
        }
        .parent-tree-opt.on {
          background: var(--color-bg-active);
        }
        .parent-tree-opt.parent {
          font-weight: 600;
        }
        .parent-tree-opt.child {
          color: var(--color-text-muted);
        }
        .parent-tree-opt.child:hover,
        .parent-tree-opt.child.on {
          color: var(--color-text);
        }
        .create-actions {
          display: flex;
          justify-content: flex-end;
          gap: 6px;
        }
        .new-opt,
        .create-btn {
          display: block;
          width: 100%;
          text-align: left;
          padding: 6px 8px;
          border-radius: 3px;
          font-size: 12px;
        }
        .new-opt {
          margin-bottom: 4px;
          color: var(--color-text);
        }
        .new-opt:hover,
        .create-btn:hover {
          background: var(--color-bg-hover);
        }
        .create-btn {
          width: auto;
          color: var(--color-text-muted);
        }
        .create-btn.primary {
          color: var(--color-text);
          border: 1px solid var(--color-border);
        }
        .list { overflow-y: auto; min-height: 0; }
        .opt {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          text-align: left;
          padding: 5px 8px;
          border-radius: 3px;
          font-size: 12px;
        }
        .opt:hover { background: var(--color-bg-hover); }
        .opt.on { background: var(--color-bg-active); }
        .opt-label {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
          font-size: 12px;
        }
        .opt-label-bold {
          font-weight: 600;
        }
        .opt-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--color-text-muted);
          flex-shrink: 0;
        }
        .opt:hover .opt-icon,
        .opt.on .opt-icon { color: var(--color-text); }
        .opt-child .opt-label { color: var(--color-text-muted); }
        .opt-child:hover .opt-label,
        .opt-child.on .opt-label { color: var(--color-text); }
        .trigger-label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          overflow: hidden;
        }
        .trigger-text {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .empty { padding: 8px; font-size: 12px; color: var(--color-text-muted); }
      `}</style>
    </div>
  );
}
