"use client";

import type { FeedItem, FeedSubscription } from "@/lib/types";

type Props = {
  feed: FeedSubscription | null;
  items: FeedItem[];
  loading: boolean;
  error: string | null;
  search: string;
  onOpen: (item: FeedItem) => void;
  onKeep: (item: FeedItem) => void;
  onDismiss: (item: FeedItem) => void;
  busyItemId?: string | null;
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

export default function FeedInbox({
  feed,
  items,
  loading,
  error,
  search,
  onOpen,
  onKeep,
  onDismiss,
  busyItemId = null,
}: Props) {
  return (
    <section className="feed-inbox">
      <header className="feed-inbox-head">
        <div>
          <h2 className="feed-inbox-title">{feed?.name ?? "Feed"}</h2>
          <p className="feed-inbox-sub muted">
            Review items here before they become bookmarks.
          </p>
        </div>
        <div className="feed-inbox-count chip">
          {items.length} pending
        </div>
      </header>

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
            const busy = busyItemId === item.id;
            return (
              <article key={item.id} className="feed-inbox-item">
                <div className="feed-inbox-item-top">
                  <div className="feed-inbox-item-meta muted">
                    <span>{hostnameFromUrl(item.url)}</span>
                    {item.published_at && <span>· {formatWhen(item.published_at)}</span>}
                  </div>
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
                </div>

                <h3 className="feed-inbox-item-title">{item.title || item.url || "Untitled"}</h3>
                {item.description && (
                  <p className="feed-inbox-item-description muted">{item.description}</p>
                )}
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
        .feed-inbox-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .feed-inbox-title {
          font-size: 16px;
          line-height: 22px;
          font-weight: 500;
        }
        .feed-inbox-sub {
          margin-top: 2px;
        }
        .feed-inbox-count {
          flex-shrink: 0;
        }
        .feed-inbox-list {
          display: grid;
          gap: 10px;
        }
        .feed-inbox-item {
          border: 1px solid var(--color-border);
          border-radius: 12px;
          background: var(--color-bg);
          padding: 14px;
          display: grid;
          gap: 10px;
        }
        .feed-inbox-item-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .feed-inbox-item-meta {
          min-width: 0;
        }
        .feed-inbox-item-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .feed-inbox-item-title {
          font-size: 16px;
          line-height: 22px;
          font-weight: 500;
        }
        .feed-inbox-item-description {
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
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
          .feed-inbox-head,
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
