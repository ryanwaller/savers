"use client";

import type { FeedItem, FeedSubscription } from "@/lib/types";

type Props = {
  feed: FeedSubscription | null;
  items: FeedItem[];
  loading: boolean;
  error: string | null;
  search: string;
  isEditMode?: boolean;
  selectedIds?: ReadonlySet<string>;
  onOpen: (item: FeedItem) => void;
  onKeep: (item: FeedItem) => void;
  onDismiss: (item: FeedItem) => void;
  onToggleSelect?: (id: string, shiftKey: boolean) => void;
  busyItemIds?: ReadonlySet<string>;
  bulkBusy?: boolean;
};

function formatWhen(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(date);
}

function hostnameFromUrl(url: string | null) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function itemTitle(item: FeedItem) {
  if (item.title?.trim()) return item.title.trim();
  if (item.url) return hostnameFromUrl(item.url);
  return "Untitled";
}

export default function FeedInbox({
  feed,
  items,
  loading,
  error,
  search,
  isEditMode = false,
  selectedIds,
  onOpen,
  onKeep,
  onDismiss,
  onToggleSelect,
  busyItemIds,
  bulkBusy = false,
}: Props) {
  return (
    <section className="feed-inbox">
      {loading ? (
        <div className="feed-inbox-state muted">Loading feed items…</div>
      ) : error ? (
        <div className="feed-inbox-state feed-inbox-error">{error}</div>
      ) : items.length === 0 ? (
        <div className="feed-inbox-state muted">
          {search.trim() ? "No feed items match that search." : "Nothing waiting in this feed."}
        </div>
      ) : (
        <div className="feed-inbox-list">
          {items.map((item) => {
            const busy = bulkBusy || (busyItemIds?.has(item.id) ?? false);
            const hasPreview = Boolean(item.preview_image);
            const selected = selectedIds?.has(item.id) ?? false;
            return (
              <article
                key={item.id}
                className={`feed-inbox-item${hasPreview ? " has-preview" : ""}${selected ? " is-selected" : ""}${isEditMode ? " is-edit-mode" : ""}`}
              >
                <div className="feed-inbox-item-main">
                  {isEditMode ? (
                    <button
                      type="button"
                      className={`feed-inbox-select-toggle${selected ? " is-selected" : ""}`}
                      onClick={(event) => onToggleSelect?.(item.id, event.shiftKey)}
                      aria-pressed={selected}
                      aria-label={selected ? `Deselect ${itemTitle(item)}` : `Select ${itemTitle(item)}`}
                    >
                      <span className="feed-inbox-select-dot" />
                    </button>
                  ) : null}

                  <div className="feed-inbox-item-body">
                    <div className="feed-inbox-item-top">
                      <div className="feed-inbox-item-meta muted">
                        <span>{hostnameFromUrl(item.url)}</span>
                        {item.published_at && <span>· {formatWhen(item.published_at)}</span>}
                      </div>
                      {!isEditMode && (
                        <div className="feed-inbox-item-actions">
                          <button
                            className="pill-btn pill-btn-sm"
                            onClick={() => onOpen(item)}
                            disabled={busy}
                          >
                            Open
                          </button>
                          <button
                            className="pill-btn pill-btn-sm"
                            onClick={() => onDismiss(item)}
                            disabled={busy}
                          >
                            {busy ? "Working…" : "Dismiss"}
                          </button>
                          <button
                            className="pill-btn pill-btn-primary pill-btn-sm"
                            onClick={() => onKeep(item)}
                            disabled={busy}
                          >
                            {busy ? "Keeping…" : "Keep"}
                          </button>
                        </div>
                      )}
                    </div>

                    <h3 className="feed-inbox-item-title">
                      <button
                        type="button"
                        className="feed-inbox-item-title-button"
                        onClick={(event) => {
                          if (isEditMode) {
                            onToggleSelect?.(item.id, event.shiftKey);
                            return;
                          }
                          onOpen(item);
                        }}
                        disabled={!item.url && !isEditMode}
                      >
                        {itemTitle(item)}
                      </button>
                    </h3>
                    {item.description && (
                      <p className="feed-inbox-item-description muted">{item.description}</p>
                    )}
                  </div>

                  {hasPreview ? (
                    <button
                      type="button"
                      className="feed-inbox-item-thumb"
                      onClick={() => onOpen(item)}
                      disabled={!item.url || bulkBusy}
                      aria-label={`Open ${itemTitle(item)}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.preview_image ?? undefined} alt="" />
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .feed-inbox {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 16px 20px 20px;
        }
        .feed-inbox-list {
          display: grid;
          gap: 10px;
        }
        .feed-inbox-item {
          border: 1px solid var(--color-border);
          border-radius: 12px;
          background: var(--color-bg);
          padding: 16px;
        }
        .feed-inbox-item.is-selected {
          border-color: var(--color-text);
          background: color-mix(in srgb, var(--color-text) 3%, var(--color-bg));
        }
        .feed-inbox-item-main {
          display: grid;
          gap: 18px;
          align-items: start;
        }
        .feed-inbox-item.has-preview .feed-inbox-item-main {
          grid-template-columns: minmax(0, 1fr) 240px;
        }
        .feed-inbox-item.is-edit-mode .feed-inbox-item-main {
          grid-template-columns: auto minmax(0, 1fr);
        }
        .feed-inbox-select-toggle {
          width: 26px;
          height: 26px;
          margin-top: 2px;
          border-radius: 999px;
          border: 1px solid var(--color-border);
          background: transparent;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          cursor: pointer;
        }
        .feed-inbox-select-toggle.is-selected {
          border-color: var(--color-text);
          background: var(--color-text);
        }
        .feed-inbox-select-dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          border: 1px solid var(--color-text);
          background: transparent;
        }
        .feed-inbox-select-toggle.is-selected .feed-inbox-select-dot {
          border-color: var(--color-bg);
          background: var(--color-bg);
        }
        .feed-inbox-item-thumb {
          aspect-ratio: 16 / 10;
          border-radius: 10px;
          overflow: hidden;
          background: color-mix(in srgb, var(--color-text) 6%, var(--color-bg));
          border: 1px solid var(--color-border);
          padding: 0;
          cursor: pointer;
          align-self: stretch;
          min-height: 140px;
        }
        .feed-inbox-item-thumb:disabled {
          cursor: default;
        }
        .feed-inbox-item-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .feed-inbox-item-body {
          display: grid;
          gap: 10px;
          min-width: 0;
          align-content: start;
        }
        .feed-inbox-item-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .feed-inbox-item-meta {
          min-width: 0;
          font-size: 13px;
          line-height: 18px;
        }
        .feed-inbox-item-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .feed-inbox-item-title {
          font-size: 22px;
          line-height: 30px;
          font-weight: 500;
        }
        .feed-inbox-item-title-button {
          appearance: none;
          border: 0;
          background: transparent;
          padding: 0;
          margin: 0;
          color: inherit;
          font: inherit;
          line-height: inherit;
          text-align: left;
          cursor: pointer;
        }
        .feed-inbox-item-title-button:disabled {
          cursor: default;
        }
        .feed-inbox-item-title-button:hover,
        .feed-inbox-item-title-button:focus-visible {
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .feed-inbox-item-description {
          display: -webkit-box;
          -webkit-line-clamp: 4;
          -webkit-box-orient: vertical;
          overflow: hidden;
          font-size: 15px;
          line-height: 23px;
        }
        .feed-inbox-state {
          border: 1px dashed var(--color-border);
          border-radius: 12px;
          padding: 16px;
          background: var(--color-bg);
        }
        .feed-inbox-error {
          color: #d13030;
        }
        @media (max-width: 900px) {
          .feed-inbox {
            padding: 14px 14px 18px;
          }
          .feed-inbox-item.has-preview .feed-inbox-item-main {
            grid-template-columns: 1fr;
          }
          .feed-inbox-item.is-edit-mode .feed-inbox-item-main {
            grid-template-columns: auto minmax(0, 1fr);
          }
          .feed-inbox-item-thumb {
            aspect-ratio: 16 / 9;
          }
          .feed-inbox-item-top {
            flex-direction: column;
          }
          .feed-inbox-item-actions {
            justify-content: flex-start;
          }
        }
      `}</style>
    </section>
  );
}
