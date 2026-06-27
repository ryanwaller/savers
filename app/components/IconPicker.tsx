"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ICONS, ICON_CATEGORIES, resolveIconName, isCuratedIconName, type IconCategory } from "@/lib/icons";
import { ALL_LUCIDE_ICONS, type LucideIconEntry } from "@/lib/lucide-all-icons";
import LazyLucideIcon from "./LazyLucideIcon";

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
 *
 * Renders two stacked sections:
 *  1. Curated catalog grouped by theme (~150 icons, all eagerly bundled).
 *  2. "All Lucide icons" — the full ~1,560 catalog, lazy-loaded per cell via
 *     IntersectionObserver so we don't blast 1.5k dynamic imports on open.
 *
 * The curated set is shown first because it has hand-tuned categories and
 * keyword search; the full catalog backstops anything the curated set is
 * missing.
 */
export default function IconPicker({ value, onPick, onClose }: Props) {
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const normalizedCuratedValue = useMemo(() => resolveIconName(value), [value]);

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

  const trimmedQuery = query.trim().toLowerCase();

  const filteredCurated = useMemo(() => {
    if (!trimmedQuery) return ICONS;
    return ICONS.filter(
      (i) =>
        i.name.toLowerCase().includes(trimmedQuery) ||
        i.keywords.some((k) => k.includes(trimmedQuery)),
    );
  }, [trimmedQuery]);

  // Group filtered curated results by category (preserves catalog order within groups).
  const grouped = useMemo(() => {
    const map = new Map<IconCategory, typeof filteredCurated>();
    for (const cat of ICON_CATEGORIES) map.set(cat, []);
    for (const def of filteredCurated) map.get(def.category)!.push(def);
    return ICON_CATEGORIES
      .map((cat) => ({ cat, items: map.get(cat)! }))
      .filter((g) => g.items.length > 0);
  }, [filteredCurated]);

  // Build the "All Lucide" list, excluding anything also present in the
  // curated catalog so the same glyph doesn't appear twice. The curated set
  // is keyed by PascalCase (e.g. "Folder"); the lucide list is kebab
  // (e.g. "folder"). Map curated → kebab via lowercase comparison on the
  // dehyphenated form.
  const curatedKebabSet = useMemo(() => {
    const set = new Set<string>();
    for (const i of ICONS) set.add(i.name.toLowerCase().replace(/[^a-z0-9]/g, ""));
    return set;
  }, []);

  const filteredLucide = useMemo<LucideIconEntry[]>(() => {
    const out: LucideIconEntry[] = [];
    for (const entry of ALL_LUCIDE_ICONS) {
      const compact = entry.name.replace(/-/g, "");
      if (curatedKebabSet.has(compact)) continue;
      if (!trimmedQuery) {
        out.push(entry);
      } else if (entry.searchTokens.some((t) => t.includes(trimmedQuery))) {
        out.push(entry);
      }
    }
    return out;
  }, [curatedKebabSet, trimmedQuery]);

  const totalResults = filteredCurated.length + filteredLucide.length;

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

      <div ref={bodyRef} className="body">
        {totalResults === 0 && <div className="empty">No matches.</div>}

        {grouped.map(({ cat, items }) => (
          <section key={cat} className="group">
            <div className="group-label">{cat}</div>
            <div className="grid">
              {items.map(({ name, Component }) => (
                <button
                  key={name}
                  type="button"
                  className={`cell ${normalizedCuratedValue === name ? "on" : ""}`}
                  title={name}
                  onClick={() => onPick(name)}
                >
                  <Component size={18} strokeWidth={1.9} />
                </button>
              ))}
            </div>
          </section>
        ))}

        {filteredLucide.length > 0 && (
          <section className="group">
            <div className="group-label">
              All Lucide
              <span className="group-count">{filteredLucide.length}</span>
            </div>
            <div className="grid">
              {filteredLucide.map((entry) => (
                <LazyCell
                  key={entry.name}
                  entry={entry}
                  scrollRoot={bodyRef}
                  selected={!isCuratedIconName(value) && value === entry.name}
                  onPick={onPick}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Global-scoped under .icon-picker so styles also apply to LazyCell,
          which lives in a separate JSX tree (styled-jsx default scope is
          per-component). */}
      <style jsx global>{`
        .icon-picker {
          width: 320px;
          max-height: 400px;
          display: flex;
          flex-direction: column;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-bg);
          overflow: hidden;
        }
        .icon-picker .head {
          display: flex;
          gap: 6px;
          padding: 8px;
          border-bottom: 1px solid var(--color-border);
        }
        .icon-picker .search {
          flex: 1;
          font-size: 12px;
          padding: 4px 8px;
          height: 28px;
        }
        .icon-picker .remove {
          font-size: 12px;
          padding: 4px 8px;
          border-radius: 3px;
          color: var(--color-text-muted);
        }
        .icon-picker .remove:hover:not(:disabled) {
          color: var(--color-text);
          background: var(--color-bg-hover);
        }
        .icon-picker .remove:disabled {
          opacity: 0.4;
          cursor: default;
        }
        .icon-picker .body {
          overflow-y: auto;
          padding: 4px 10px 10px;
          min-height: 0;
        }
        .icon-picker .group {
          padding-top: 10px;
        }
        .icon-picker .group-label {
          font-size: 12px;
          color: var(--color-text-muted);
          padding: 2px 4px;
          letter-spacing: 0.01em;
          font-weight: 500;
          text-transform: uppercase;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .icon-picker .group-count {
          font-size: 10px;
          color: var(--color-text-muted);
          opacity: 0.7;
          text-transform: none;
          letter-spacing: 0;
          font-weight: 400;
        }
        .icon-picker .grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 4px;
          padding-top: 6px;
        }
        .icon-picker .cell {
          aspect-ratio: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          color: var(--color-text-muted);
          transition: background 120ms ease, color 120ms ease;
          background: transparent;
          border: none;
          padding: 0;
          cursor: pointer;
        }
        .icon-picker .cell:hover {
          background: var(--color-bg-hover);
          color: var(--color-text);
        }
        .icon-picker .cell.on {
          background: var(--color-bg-active);
          color: var(--color-text);
        }
        .icon-picker .empty {
          padding: 16px 8px;
          font-size: 12px;
          color: var(--color-text-muted);
          text-align: center;
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LazyCell — a single cell in the "All Lucide" grid. Uses IntersectionObserver
// against the scroll body so the icon's dynamic import only fires once the
// cell scrolls into view (or within a 200px pre-render margin). This keeps
// the picker snappy even with ~1,500 cells in the DOM.
// ---------------------------------------------------------------------------

type LazyCellProps = {
  entry: LucideIconEntry;
  scrollRoot: React.RefObject<HTMLDivElement | null>;
  selected: boolean;
  onPick: (name: string) => void;
};

function LazyCell({ entry, scrollRoot, selected, onPick }: LazyCellProps) {
  const cellRef = useRef<HTMLButtonElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const el = cellRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            obs.disconnect();
            break;
          }
        }
      },
      { root: scrollRoot.current, rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visible, scrollRoot]);

  return (
    <button
      ref={cellRef}
      type="button"
      className={`cell ${selected ? "on" : ""}`}
      title={entry.name}
      onClick={() => onPick(entry.name)}
    >
      {visible ? <LazyLucideIcon name={entry.name} size={18} /> : null}
    </button>
  );
}
