"use client";

import { useEffect, useMemo, useState } from "react";
import type { Bookmark, Collection } from "@/lib/types";
import { api } from "@/lib/api";
import ExportBookmarksButton from "./ExportBookmarksButton";

function resolveSaveUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    return `${configured.replace(/\/$/, "")}/save`;
  }
  if (typeof window !== "undefined") {
    return `${window.location.origin.replace(/\/$/, "")}/save`;
  }
  return "https://savers-production.up.railway.app/save";
}

function buildBookmarkUrl(token?: string | null): string {
  const saveUrl = resolveSaveUrl();
  return token
    ? `${saveUrl}?token=${encodeURIComponent(token)}`
    : saveUrl;
}

type TokenRow = {
  id: string;
  name: string;
  prefix: string;
  last_used_at: string | null;
  created_at: string;
};

type Props = {
  bookmarks: Bookmark[];
  flatCollections: Collection[];
  userEmail?: string | null;
  userAvatarUrl?: string | null;
  onSignOut?: () => void | Promise<void>;
  onGeneratedPreviewsQueued?: (ids: string[]) => void;
};

export default function SettingsSections({
  bookmarks,
  flatCollections,
  userEmail,
  userAvatarUrl,
  onSignOut,
  onGeneratedPreviewsQueued,
}: Props) {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTokenName, setNewTokenName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [bookmarkletCopied, setBookmarkletCopied] = useState(false);
  const [bookmarkletToken, setBookmarkletToken] = useState<string | null>(null);
  const [refreshingPreviews, setRefreshingPreviews] = useState(false);
  const [previewRefreshMessage, setPreviewRefreshMessage] = useState<string | null>(null);

  const generatedPreviewCount = bookmarks.filter((bookmark) => !bookmark.custom_preview_path).length;
  const customPreviewCount = bookmarks.filter((bookmark) => bookmark.custom_preview_path).length;
  const brokenLinkCount = bookmarks.filter((bookmark) => bookmark.link_status === "broken").length;

  const bookmarkletTokenExists = useMemo(
    () => tokens.some((token) => token.name.toLowerCase() === "bookmarklet"),
    [tokens],
  );

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listTokens();
      setTokens(data.tokens);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load tokens");
    } finally {
      setLoading(false);
    }
  }

  async function createToken() {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const result = await api.createToken(newTokenName.trim());
      setRevealedToken(result.token);
      setNewTokenName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create token");
    } finally {
      setCreating(false);
    }
  }

  async function createBookmarkletSetupLink() {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const result = await api.createToken("Bookmarklet");
      setRevealedToken(result.token);
      setBookmarkletToken(result.token);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create token");
    } finally {
      setCreating(false);
    }
  }

  async function revokeToken(id: string) {
    if (revoking) return;
    setRevoking(id);
    setError(null);
    try {
      await api.deleteToken(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke token");
    } finally {
      setRevoking(null);
    }
  }

  async function copyRevealed() {
    if (!revealedToken) return;
    try {
      await navigator.clipboard.writeText(revealedToken);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  }

  async function copyBookmarklet() {
    try {
      await navigator.clipboard.writeText(buildBookmarkUrl(bookmarkletToken));
      setBookmarkletCopied(true);
      window.setTimeout(() => setBookmarkletCopied(false), 1800);
    } catch {
      // ignore
    }
  }

  async function refreshGeneratedPreviews() {
    if (refreshingPreviews) return;
    setRefreshingPreviews(true);
    setPreviewRefreshMessage(null);
    try {
      const result = await api.refreshGeneratedPreviews();
      if (result.queued_ids.length > 0) {
        onGeneratedPreviewsQueued?.(result.queued_ids);
      }

      const parts: string[] = [];
      if (result.queued_count > 0) {
        parts.push(
          `Queued ${result.queued_count} generated preview${result.queued_count === 1 ? "" : "s"} for refresh.`,
        );
      } else {
        parts.push("No generated previews needed refreshing.");
      }
      if (result.skipped_custom_count > 0) {
        parts.push(
          `Skipped ${result.skipped_custom_count} manual upload${result.skipped_custom_count === 1 ? "" : "s"}.`,
        );
      }
      if (result.skipped_in_flight_count > 0) {
        parts.push(
          `Skipped ${result.skipped_in_flight_count} preview${result.skipped_in_flight_count === 1 ? "" : "s"} already updating.`,
        );
      }
      if (result.failed_count > 0) {
        parts.push(
          `${result.failed_count} enqueue${result.failed_count === 1 ? "" : "s"} failed.`,
        );
      }
      setPreviewRefreshMessage(parts.join(" "));
    } catch (e) {
      setPreviewRefreshMessage(e instanceof Error ? e.message : "Could not refresh previews");
    } finally {
      setRefreshingPreviews(false);
    }
  }

  return (
    <div className="settings-sections">
      <section className="settings-block">
        <div className="settings-heading">
          <div>
            <h2>Account</h2>
            <p className="settings-copy">
              Your Savers account, session, and the basics people expect to find in settings.
            </p>
          </div>
          {onSignOut && (
            <button className="btn" onClick={() => void onSignOut()}>
              Sign out
            </button>
          )}
        </div>
        <div className="settings-card account-card">
          <div className="account-avatar">
            {userAvatarUrl ? (
              <img src={userAvatarUrl} alt={userEmail ?? "Signed in"} referrerPolicy="no-referrer" />
            ) : (
              <span>{(userEmail ?? "S").slice(0, 1).toUpperCase()}</span>
            )}
          </div>
          <div className="account-meta">
            <div className="account-label">Signed in</div>
            <div className="account-email">{userEmail ?? "Loading account…"}</div>
          </div>
        </div>
      </section>

      <section className="settings-block">
        <div className="settings-heading">
          <div>
            <h2>Save to Savers</h2>
            <p className="settings-copy">
              Capture pages from anywhere. Bookmarklet setup lives here, while raw token management stays below in advanced.
            </p>
          </div>
        </div>
        <div className="settings-grid two-up">
          <div className="settings-card feature-card">
            <div className="feature-top">
              <div>
                <div className="feature-title">Bookmarklet</div>
                <div className="feature-sub">
                  A reliable fallback for saving pages from any browser.
                </div>
              </div>
              <span className={`status-chip ${bookmarkletTokenExists ? "status-ready" : "status-muted"}`}>
                {bookmarkletTokenExists ? "Set up before" : "Needs setup"}
              </span>
            </div>
            <div className="feature-actions">
              <button
                className="btn btn-primary"
                onClick={() => void createBookmarkletSetupLink()}
                disabled={creating}
              >
                {creating ? "Creating…" : bookmarkletTokenExists ? "Create fresh setup link" : "Set up bookmarklet"}
              </button>
              <button
                className="btn"
                onClick={() => void copyBookmarklet()}
                disabled={!bookmarkletToken}
              >
                {bookmarkletCopied ? "Copied!" : "Copy save URL"}
              </button>
            </div>
            <p className="small muted">
              {bookmarkletToken
                ? "Your new save URL includes a token and is ready to paste into a browser bookmark."
                : "Without a token, the save URL relies on you being signed in on this browser."}
            </p>
            <details className="details">
              <summary>Advanced setup steps</summary>
              <ol className="bookmarklet-steps">
                <li>Click <strong>{bookmarkletTokenExists ? "Create fresh setup link" : "Set up bookmarklet"}</strong>.</li>
                <li>Click <strong>Copy save URL</strong>.</li>
                <li><strong>Bookmark this page</strong> (<kbd>Ctrl+D</kbd> / <kbd>&#8984;+D</kbd>) to capture the icon.</li>
                <li>Right-click the new bookmark, choose <strong>Edit</strong>, paste the URL, and name it “Save to Savers”.</li>
              </ol>
            </details>
          </div>

          <div className="settings-card feature-card">
            <div className="feature-title">Library snapshot</div>
            <div className="feature-sub">A quick sense of what your account is holding right now.</div>
            <div className="stat-grid">
              <div className="stat">
                <span className="stat-value">{bookmarks.length}</span>
                <span className="stat-label">Bookmarks</span>
              </div>
              <div className="stat">
                <span className="stat-value">{flatCollections.length}</span>
                <span className="stat-label">Collections</span>
              </div>
              <div className="stat">
                <span className="stat-value">{generatedPreviewCount}</span>
                <span className="stat-label">Generated previews</span>
              </div>
              <div className="stat">
                <span className="stat-value">{customPreviewCount}</span>
                <span className="stat-label">Manual uploads</span>
              </div>
              <div className="stat">
                <span className="stat-value">{brokenLinkCount}</span>
                <span className="stat-label">Broken links</span>
              </div>
              <div className="stat">
                <span className="stat-value">{tokens.length}</span>
                <span className="stat-label">Active tokens</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="settings-block">
        <div className="settings-heading">
          <div>
            <h2>Library & data</h2>
            <p className="settings-copy">
              Export your library and run maintenance actions that help keep Savers clean.
            </p>
          </div>
        </div>
        <div className="settings-grid two-up">
          <div className="settings-card">
            <div className="feature-title">Export bookmarks</div>
            <div className="feature-sub">
              Download your bookmarks, images, collections, and notes as a ZIP.
            </div>
            <ExportBookmarksButton bookmarks={bookmarks} flatCollections={flatCollections} variant="button" />
          </div>

          <div className="settings-card">
            <div className="feature-title">Previews & storage</div>
            <div className="feature-sub">
              Re-run generated covers while preserving bookmarks that use manual uploaded images.
            </div>
            <button
              className="btn"
              onClick={() => void refreshGeneratedPreviews()}
              disabled={refreshingPreviews || generatedPreviewCount === 0}
            >
              {refreshingPreviews
                ? "Queueing refresh…"
                : `Refresh generated previews${generatedPreviewCount > 0 ? ` (${generatedPreviewCount})` : ""}`}
            </button>
            {previewRefreshMessage && <div className="small muted">{previewRefreshMessage}</div>}
          </div>
        </div>
      </section>

      <section className="settings-block">
        <details className="advanced-shell">
          <summary>
            <span>Privacy, security & advanced</span>
            <span className="small muted">API tokens, install credentials, and manual setup details</span>
          </summary>

          <div className="settings-card advanced-card">
            <div className="feature-title">API tokens</div>
            <div className="feature-sub">
              Long-lived tokens for clients that can&apos;t rely on your browser session, like the iPhone share flow or scripts.
            </div>

            {revealedToken && (
              <div className="reveal">
                <div className="reveal-title">Your new token</div>
                <p className="small muted">
                  Copy this now. For security, Savers won&apos;t show the full token again.
                </p>
                <code className="reveal-token">{revealedToken}</code>
                <div className="reveal-actions">
                  <button className="btn btn-primary" onClick={() => void copyRevealed()}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <button className="btn" onClick={() => setRevealedToken(null)}>
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            <div className="create-row">
              <input
                placeholder="Token name (e.g. iPhone Share)"
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void createToken();
                  }
                }}
                disabled={creating}
              />
              <button className="btn btn-primary" onClick={() => void createToken()} disabled={creating}>
                {creating ? "Creating…" : "Create token"}
              </button>
            </div>

            {error && <div className="error small">{error}</div>}

            {loading ? (
              <div className="small muted">Loading tokens…</div>
            ) : tokens.length === 0 ? (
              <div className="small muted">No tokens yet.</div>
            ) : (
              <ul className="tokens">
                {tokens.map((t) => (
                  <li key={t.id} className="token-row">
                    <div className="token-meta">
                      <div className="token-name">{t.name}</div>
                      <div className="token-sub small muted">
                        <span className="token-prefix">{t.prefix}…</span>
                        <span> · created {formatDate(t.created_at)}</span>
                        {t.last_used_at && (
                          <span> · last used {formatDate(t.last_used_at)}</span>
                        )}
                      </div>
                    </div>
                    <button
                      className="btn btn-ghost danger"
                      onClick={() => void revokeToken(t.id)}
                      disabled={revoking === t.id}
                    >
                      {revoking === t.id ? "Revoking…" : "Revoke"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      </section>

      <style jsx>{`
        .settings-sections {
          display: flex;
          flex-direction: column;
          gap: 28px;
        }
        .settings-block {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .settings-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }
        .settings-heading h2 {
          margin: 0;
          font-size: 15px;
          line-height: 1.2;
        }
        .settings-copy {
          margin: 6px 0 0;
          font-size: 13px;
          line-height: 1.45;
          color: var(--color-text-muted);
          max-width: 720px;
        }
        .settings-grid {
          display: grid;
          gap: 14px;
        }
        .two-up {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .settings-card {
          border: 1px solid var(--color-border);
          border-radius: 18px;
          padding: 18px;
          background: color-mix(in srgb, var(--color-bg-secondary) 88%, transparent);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .account-card {
          flex-direction: row;
          align-items: center;
          gap: 14px;
        }
        .account-avatar {
          width: 48px;
          height: 48px;
          border-radius: 999px;
          border: 1px solid var(--color-border);
          background: var(--color-bg);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          color: var(--color-text);
          font-weight: 600;
        }
        .account-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .account-meta {
          min-width: 0;
        }
        .account-label {
          font-size: 12px;
          color: var(--color-text-muted);
        }
        .account-email {
          margin-top: 2px;
          font-size: 16px;
          font-weight: 600;
          word-break: break-word;
        }
        .feature-card {
          min-height: 100%;
        }
        .feature-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .feature-title {
          font-size: 15px;
          font-weight: 600;
        }
        .feature-sub {
          font-size: 13px;
          line-height: 1.45;
          color: var(--color-text-muted);
        }
        .feature-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .status-chip {
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid var(--color-border);
          font-size: 11px;
          line-height: 1;
          white-space: nowrap;
        }
        .status-ready {
          background: color-mix(in srgb, #2ecc71 12%, var(--color-bg));
          color: color-mix(in srgb, #2ecc71 72%, var(--color-text));
          border-color: color-mix(in srgb, #2ecc71 35%, var(--color-border));
        }
        .status-muted {
          color: var(--color-text-muted);
          background: var(--color-bg);
        }
        .details {
          border-top: 1px solid var(--color-border);
          padding-top: 12px;
        }
        .details summary {
          cursor: pointer;
          color: var(--color-text);
          font-size: 13px;
        }
        .bookmarklet-steps {
          margin: 10px 0 0 18px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          color: var(--color-text-muted);
          font-size: 13px;
          line-height: 1.45;
        }
        .stat-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }
        .stat {
          border: 1px solid var(--color-border);
          border-radius: 14px;
          background: var(--color-bg);
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .stat-value {
          font-size: 22px;
          line-height: 1;
          font-weight: 600;
          letter-spacing: -0.02em;
        }
        .stat-label {
          font-size: 11px;
          color: var(--color-text-muted);
        }
        .advanced-shell {
          border: 1px solid var(--color-border);
          border-radius: 18px;
          background: color-mix(in srgb, var(--color-bg-secondary) 88%, transparent);
          overflow: hidden;
        }
        .advanced-shell summary {
          list-style: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 18px;
          font-size: 15px;
          font-weight: 600;
        }
        .advanced-shell summary::-webkit-details-marker {
          display: none;
        }
        .advanced-card {
          border: 0;
          border-top: 1px solid var(--color-border);
          border-radius: 0;
          background: transparent;
        }
        .small {
          font-size: 12px;
        }
        .muted {
          color: var(--color-text-muted);
        }
        .create-row {
          display: flex;
          gap: 8px;
        }
        .create-row input {
          flex: 1 1 auto;
          padding: 12px 14px;
          border: 1px solid var(--color-border);
          border-radius: 12px;
          background: var(--color-bg);
          color: var(--color-text);
          font: inherit;
        }
        .reveal {
          border: 1px solid var(--color-border);
          border-radius: 14px;
          background: var(--color-bg);
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .reveal-title {
          font-weight: 600;
        }
        .reveal-token {
          display: block;
          padding: 10px 12px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 12px;
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: 12px;
          word-break: break-all;
          user-select: all;
        }
        .reveal-actions {
          display: flex;
          gap: 8px;
        }
        .tokens {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .token-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          border: 1px solid var(--color-border);
          border-radius: 14px;
          background: var(--color-bg);
        }
        .token-meta {
          flex: 1 1 auto;
          min-width: 0;
        }
        .token-name {
          font-weight: 500;
          word-break: break-word;
        }
        .token-sub {
          margin-top: 2px;
          word-break: break-word;
        }
        .token-prefix {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .error {
          color: #ff7a7a;
        }

        @media (max-width: 820px) {
          .two-up {
            grid-template-columns: 1fr;
          }
          .stat-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .settings-heading {
            flex-direction: column;
          }
          .feature-top,
          .advanced-shell summary,
          .account-card {
            flex-direction: column;
            align-items: flex-start;
          }
          .feature-actions,
          .create-row,
          .reveal-actions {
            flex-direction: column;
          }
          .stat-grid {
            grid-template-columns: 1fr 1fr;
          }
          .token-row {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </div>
  );
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
}
