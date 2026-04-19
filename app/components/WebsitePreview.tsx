"use client";

import type { CSSProperties } from "react";

type Props = {
  host: string;
  title: string;
  description?: string | null;
  favicon?: string | null;
  tint?: string;
  compact?: boolean;
};

export default function WebsitePreview({
  host,
  title,
  description,
  favicon,
  tint = "var(--color-bg-secondary)",
  compact = false,
}: Props) {
  const summary = description?.trim() || "Saved preview";

  return (
    <div className={`preview ${compact ? "compact" : ""}`} style={{ "--preview-tint": tint } as CSSProperties}>
      <div className="chrome">
        <div className="tab" aria-hidden />
        <div className="address">
          {favicon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="fav" src={favicon} alt="" />
          ) : (
            <span className="site-dot" aria-hidden />
          )}
          <span>{host}</span>
        </div>
      </div>

      <div className="canvas">
        <div className="hero-row">
          <div className="identity">
            <div className="identity-mark">
              {favicon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="identity-fav" src={favicon} alt="" />
              ) : (
                <span className="identity-letter">{host.slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div className="identity-copy">
              <div className="eyebrow">{host}</div>
              <div className="title">{title || host}</div>
            </div>
          </div>
          <div className="hero-panel" aria-hidden>
            <span className="panel-chip panel-chip-wide" />
            <span className="panel-chip" />
            <span className="panel-chip panel-chip-short" />
          </div>
        </div>
        <div className="summary">{summary}</div>
        <div className="mosaic" aria-hidden>
          <span className="block block-large" />
          <span className="block" />
          <span className="block" />
          <span className="block block-wide" />
        </div>
      </div>

      <style jsx>{`
        .preview {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--preview-tint) 82%, white) 0%, var(--color-bg) 100%);
          color: var(--color-text);
        }
        .compact {
          font-size: 0.92em;
        }
        .chrome {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-bottom: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent);
          background: color-mix(in srgb, var(--color-bg) 86%, var(--preview-tint));
        }
        .tab {
          width: 48px;
          height: 12px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--color-text-muted) 12%, transparent);
          flex-shrink: 0;
        }
        .address {
          min-width: 0;
          flex: 1;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 10px;
          border: 1px solid color-mix(in srgb, var(--color-border) 84%, transparent);
          border-radius: 999px;
          background: color-mix(in srgb, var(--color-bg) 92%, transparent);
          font-size: 11px;
          color: var(--color-text-muted);
        }
        .address span:last-child {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .fav,
        .site-dot {
          width: 14px;
          height: 14px;
          flex-shrink: 0;
          border-radius: 4px;
        }
        .site-dot {
          background: color-mix(in srgb, var(--color-text-muted) 20%, transparent);
        }
        .canvas {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 14px 14px 16px;
        }
        .hero-row {
          display: grid;
          grid-template-columns: minmax(0, 1.25fr) minmax(96px, 0.9fr);
          gap: 12px;
          align-items: stretch;
        }
        .identity,
        .hero-panel {
          border: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent);
          border-radius: 14px;
          background: color-mix(in srgb, var(--color-bg) 88%, var(--preview-tint));
        }
        .identity {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
          padding: 12px;
        }
        .identity-mark {
          width: ${compact ? "40px" : "48px"};
          height: ${compact ? "40px" : "48px"};
          border-radius: 12px;
          background: linear-gradient(
            135deg,
            color-mix(in srgb, var(--preview-tint) 72%, white),
            color-mix(in srgb, var(--preview-tint) 48%, var(--color-bg))
          );
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          overflow: hidden;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
        }
        .identity-fav {
          width: 65%;
          height: 65%;
          object-fit: contain;
          display: block;
        }
        .identity-letter {
          font-size: ${compact ? "16px" : "18px"};
          font-weight: 700;
          color: var(--color-text);
        }
        .identity-copy {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .eyebrow {
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--color-text-muted);
        }
        .title {
          font-size: ${compact ? "15px" : "17px"};
          line-height: 1.25;
          font-weight: 600;
          display: -webkit-box;
          -webkit-line-clamp: ${compact ? 2 : 3};
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .summary {
          font-size: ${compact ? "11px" : "12px"};
          line-height: 1.45;
          color: var(--color-text-muted);
          display: -webkit-box;
          -webkit-line-clamp: ${compact ? 3 : 4};
          -webkit-box-orient: vertical;
          overflow: hidden;
          padding: 0 2px;
        }
        .hero-panel {
          display: grid;
          align-content: center;
          gap: 8px;
          padding: 12px;
        }
        .panel-chip,
        .block {
          display: block;
          border-radius: 999px;
          background: color-mix(in srgb, var(--color-text-muted) 14%, transparent);
        }
        .panel-chip {
          height: 10px;
          width: 76%;
        }
        .panel-chip-wide {
          width: 100%;
        }
        .panel-chip-short {
          width: 56%;
        }
        .mosaic {
          display: grid;
          grid-template-columns: 1.35fr 0.9fr;
          gap: 10px;
          flex: 1;
          min-height: 0;
        }
        .block {
          min-height: 44px;
          border-radius: 14px;
          background:
            linear-gradient(
              135deg,
              color-mix(in srgb, var(--preview-tint) 74%, white),
              color-mix(in srgb, var(--preview-tint) 44%, var(--color-bg))
            );
          border: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent);
        }
        .block-large {
          grid-row: span 2;
        }
        .block-wide {
          grid-column: 1 / -1;
          min-height: 30px;
        }
      `}</style>
    </div>
  );
}
