"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ICONS, ICON_CATEGORIES, type IconCategory } from "@/lib/icons";

type Props = {
  /** Currently-selected icon name (or null for default). */
  value: string | null;
  /** Called with the picked icon name, or `null` to remove and use the default. */
  onPick: (name: string | null) => void;
  /** Called when the user clicks outside or hits escape without picking. */
  onClose: () => void;
};

/**
 * Popover icon picker. Position yourself (absolute) in the parent — this
 * component only renders the inner content. Use the `root` wrapper class to
 * get a tidy card.
 */
export default function IconPicker({ value, onPick, onClose }: Props) {
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Dismiss on outside click / escape.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!(e.target instanceof Node)) return;
      if (!ref.current.contains(e.target)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Defer attach so the click that opened us doesn't immediately close us.
    const t = window.setTimeout(() => {
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ICONS;
    return ICONS.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.keywords.some((k) => k.includes(q)),
    );
  }, [query]);

  // Group filtered results by category (preserves catalog order within groups).
  const grouped = useMemo(() => {
    const map = new Map<IconCategory, typeof filtered>();
    for (const cat of ICON_CATEGORIES) map.set(cat, []);
    for (const def of filtered) map.get(def.category)!.push(def);
    return ICON_CATEGORIES
      .map((cat) => ({ cat, items: map.get(cat)! }))
      .filter((g) => g.items.length > 0);
  }, [filtered]);

  return (
    <div ref={ref} className="icon-picker" role="dialog" aria-label="Pick icon">
      <div className="head">
        <input
          autoFocus
          className="search"
          placeholder="Search icons…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className="remove"
          onClick={() => onPick(null)}
          disabled={value === null}
          title="Remove icon (use default folder)"
        >
          Remove
        </button>
      </div>

      <div className="body">
        {grouped.length === 0 && <div className="empty">No matches.</div>}
        {grouped.map(({ cat, items }) => (
          <section key={cat} className="group">
            <div className="group-label">{cat}</div>
            <div className="grid">
              {items.map(({ name, Component }) => (
                <button
                  key={name}
                  type="button"
                  className={`cell ${value === name ? "on" : ""}`}
                  title={name}
                  onClick={() => onPick(name)}
                >
                  <Component size={16} weight="regular" />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <style jsx>{`
        .icon-picker {
          width: 280px;
          max-height: 360px;
          display: flex;
          flex-direction: column;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-bg);
          overflow: hidden;
        }
        .head {
          display: flex;
          gap: 6px;
          padding: 8px;
          border-bottom: 1px solid var(--color-border);
        }
        .search {
          flex: 1;
          font-size: 12px;
          padding: 4px 8px;
          height: 28px;
        }
        .remove {
          font-size: 12px;
          padding: 4px 8px;
          border-radius: 3px;
          color: var(--color-text-muted);
        }
        .remove:hover:not(:disabled) {
          color: var(--color-text);
          background: var(--color-bg-hover);
        }
        .remove:disabled {
          opacity: 0.4;
          cursor: default;
        }
        .body {
          overflow-y: auto;
          padding: 4px 8px 8px;
          min-height: 0;
        }
        .group {
          padding-top: 8px;
        }
        .group-label {
          font-size: 11px;
          color: var(--color-text-muted);
          padding: 2px 4px;
          letter-spacing: 0.01em;
          font-weight: 500;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(8, 1fr);
          gap: 2px;
          padding-top: 4px;
        }
        .cell {
          aspect-ratio: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          color: var(--color-text-muted);
        }
        .cell:hover {
          background: var(--color-bg-hover);
          color: var(--color-text);
        }
        .cell.on {
          background: var(--color-bg-active);
          color: var(--color-text);
        }
        .empty {
          padding: 16px 8px;
          font-size: 12px;
          color: var(--color-text-muted);
          text-align: center;
        }
      `}</style>
    </div>
  );
}
