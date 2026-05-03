"use client";

import { useEffect, useRef, useState } from "react";
import type { Collection } from "@/lib/types";
import CollectionIcon from "./CollectionIcon";

type Props = {
  subs: Collection[];
  activeId?: string | null;
  onSelect: (id: string) => void;
};

export default function SubcollectionRow({ subs, activeId, onSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [leftFade, setLeftFade] = useState(false);
  const [rightFade, setRightFade] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const update = () => {
      setLeftFade(el.scrollLeft > 4);
      setRightFade(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    };

    el.addEventListener("scroll", update, { passive: true });
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);

    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [subs]);

  if (subs.length === 0) return null;

  return (
    <div className="sub-row-wrapper">
      <div ref={scrollRef} className="sub-row">
        {subs.map((sub) => {
          const childCount = sub.children?.length ?? 0;
          const bmCount = sub.bookmark_count ?? 0;
          const totalLabel = `${bmCount} bookmark${bmCount === 1 ? "" : "s"}${childCount > 0 ? ` · ${childCount} sub` : ""}`;

          return (
            <button
              key={sub.id}
              type="button"
              className={`sub-chip ${activeId === sub.id ? "active" : ""}`}
              onClick={() => onSelect(sub.id)}
              aria-pressed={activeId === sub.id}
              title={sub.name}
            >
              <span className="sub-chip-icon">
                <CollectionIcon name={sub.icon} size={20} />
              </span>
              <span className="sub-chip-body">
                <span className="sub-chip-title">{sub.name}</span>
                <span className="sub-chip-meta">{totalLabel}</span>
              </span>
              <svg
                className="sub-chip-chevron"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          );
        })}
      </div>

      <div className={`sub-fade sub-fade-left ${leftFade ? "visible" : ""}`} />
      <div className={`sub-fade sub-fade-right ${rightFade ? "visible" : ""}`} />

      <style jsx>{`
        .sub-row-wrapper {
          position: relative;
          padding: 0 20px 4px;
        }

        .sub-row {
          display: flex;
          gap: 12px;
          overflow-x: auto;
          overflow-y: hidden;
          scroll-snap-type: x mandatory;
          scrollbar-width: none;
          -ms-overflow-style: none;
          padding-bottom: 4px;
        }
        .sub-row::-webkit-scrollbar {
          display: none;
        }

        .sub-chip {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 200px;
          max-width: 340px;
          height: 68px;
          padding: 0 20px;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: 12px;
          cursor: pointer;
          text-align: left;
          flex-shrink: 0;
          scroll-snap-align: start;
          transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1),
                      border-color 160ms ease,
                      box-shadow 160ms ease;
        }
        .sub-chip:hover {
          transform: translateY(-2px);
          border-color: var(--color-border-strong);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
        }
        .sub-chip:active {
          transform: scale(0.98) translateY(0);
        }
        .sub-chip.active {
          background: var(--color-bg-secondary);
          border-color: var(--color-border-strong);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-text) 10%, transparent);
        }

        @media (prefers-reduced-motion: reduce) {
          .sub-chip {
            transition: border-color 120ms ease;
          }
          .sub-chip:hover {
            transform: none;
            box-shadow: none;
          }
          .sub-chip:active {
            transform: none;
          }
        }

        .sub-chip-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-text-muted);
          flex-shrink: 0;
        }
        .sub-chip:hover .sub-chip-icon,
        .sub-chip.active .sub-chip-icon {
          color: var(--color-text);
        }

        .sub-chip-body {
          display: flex;
          flex-direction: column;
          gap: 2px;
          flex: 1;
          min-width: 0;
        }

        .sub-chip-title {
          font-size: 14px;
          font-weight: 500;
          color: var(--color-text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .sub-chip-meta {
          font-size: 13px;
          color: var(--color-text-muted);
          white-space: nowrap;
        }

        .sub-chip-chevron {
          opacity: 0.35;
          flex-shrink: 0;
          color: var(--color-text-muted);
          transition: opacity 160ms ease, transform 160ms ease;
        }
        .sub-chip:hover .sub-chip-chevron {
          opacity: 0.7;
          transform: translateX(2px);
        }

        .sub-fade {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 48px;
          pointer-events: none;
          opacity: 0;
          transition: opacity 200ms ease;
        }
        .sub-fade.visible {
          opacity: 1;
        }
        .sub-fade-left {
          left: 0;
          background: linear-gradient(to right, var(--color-bg-page) 0%, transparent 100%);
        }
        .sub-fade-right {
          right: 0;
          background: linear-gradient(to left, var(--color-bg-page) 0%, transparent 100%);
        }
      `}</style>
    </div>
  );
}
