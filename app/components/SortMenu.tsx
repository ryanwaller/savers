"use client";

import { useEffect, useRef } from "react";

type Props = {
  sortBy: "date" | "collection";
  onSelect: (sort: "date" | "collection") => void;
  isOpen: boolean;
  onClose: () => void;
};

export default function SortMenu({ sortBy, onSelect, isOpen, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const t = window.setTimeout(() => {
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div ref={menuRef} className="sort-menu">
      <div className="sort-menu-label">Sort by</div>
      <button
        className={`sort-menu-item ${sortBy === "date" ? "sort-menu-active" : ""}`}
        onClick={() => { onSelect("date"); onClose(); }}
      >
        Date added
      </button>
      <button
        className={`sort-menu-item ${sortBy === "collection" ? "sort-menu-active" : ""}`}
        onClick={() => { onSelect("collection"); onClose(); }}
      >
        Group by collection
      </button>
      <style jsx>{`
        .sort-menu {
          position: absolute;
          bottom: calc(100% + 8px);
          left: 0;
          min-width: 172px;
          border: 1px solid var(--color-border);
          border-radius: 10px;
          background: var(--color-bg);
          padding: 4px;
          z-index: 20;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
          animation: sortMenuIn 160ms ease;
        }
        @keyframes sortMenuIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .sort-menu-label {
          padding: 6px 10px 4px;
          font-size: 12px;
          font-weight: 600;
          color: var(--color-text-muted);
        }
        .sort-menu-item {
          width: 100%;
          text-align: left;
          padding: 6px 10px;
          font-size: 12px;
          color: var(--color-text);
          border: none;
          background: transparent;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .sort-menu-item:hover {
          background: var(--color-bg-hover);
        }
        .sort-menu-active {
          font-weight: 600;
          background: var(--color-bg-secondary);
        }
        .sort-menu-active::before {
          content: "✓";
          font-size: 12px;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}
