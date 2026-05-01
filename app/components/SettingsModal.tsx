"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Bookmark, Collection } from "@/lib/types";
import ExportBookmarksButton from "./ExportBookmarksButton";

const BOOKMARKLET_SRC = "https://savers-production.up.railway.app/bookmarklet.js";

function buildBookmarkletHref(token?: string | null): string {
  const src = token
    ? `${BOOKMARKLET_SRC}?token=${encodeURIComponent(token)}`
    : BOOKMARKLET_SRC;
  return `javascript:(function(){var s=document.createElement('script');s.src='${src}';document.head.appendChild(s);})();`;
}

type TokenRow = {
  id: string;
  name: string;
  prefix: string;
  last_used_at: string | null;
  created_at: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  bookmarks: Bookmark[];
  flatCollections: Collection[];
};

export default function SettingsModal({ open, onClose, bookmarks, flatCollections }: Props) {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTokenName, setNewTokenName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [bookmarkletCopied, setBookmarkletCopied] = useState(false);
  const [bookmarkletTokenId, setBookmarkletTokenId] = useState<string>("");
  const [bookmarkletToken, setBookmarkletToken] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setRevealedToken(null);
      setCopied(false);
      setError(null);
      setNewTokenName("");
      return;
    }
    void load();
  }, [open]);

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
      setBookmarkletToken(result.token);
      setBookmarkletTokenId(result.record?.id ?? "");
      setNewTokenName("");
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
      // ignore — user can select-and-copy manually
    }
  }

  async function copyBookmarklet() {
    try {
      await navigator.clipboard.writeText(buildBookmarkletHref(bookmarkletToken));
      setBookmarkletCopied(true);
      window.setTimeout(() => setBookmarkletCopied(false), 1800);
    } catch {
      // ignore
    }
  }

  if (!open) return null;

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <div className="title">Settings</div>
          <button className="close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="body">
          <section className="section">
            <ExportBookmarksButton bookmarks={bookmarks} flatCollections={flatCollections} variant="button" />
          </section>

          <section className="section">
            <div className="section-title">Bookmarklet</div>
            <p className="small muted">
              Save any page to Savers without installing an extension. Select
              an API token below so the bookmarklet works even when third-party
              cookies are blocked.
            </p>

            <div className="bookmarklet-token-row">
              <select
                className="bookmarklet-token-select"
                value={bookmarkletTokenId}
                onChange={(e) => setBookmarkletTokenId(e.target.value)}
              >
                <option value="">No token (uses cookies — may fail cross-site)</option>
                {tokens.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.prefix}…)
                  </option>
                ))}
              </select>
              <button
                className="btn"
                onClick={() => {
                  setNewTokenName("Bookmarklet");
                  // scroll to the API tokens section so user can create
                  document.getElementById("api-tokens-section")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                + New
              </button>
            </div>
            {bookmarkletToken ? (
              <div className="small muted">
                Token embedded — your bookmarklet will work cross-site without
                cookies. Create a new token here if you lose it.
              </div>
            ) : tokens.length === 0 ? (
              <div className="small muted">
                No API tokens yet. Click "+ New" to create one for the bookmarklet —
                it will be embedded directly in the bookmarklet code.
              </div>
            ) : (
              <div className="small muted">
                Select an existing token above, or click "+ New" to create one.
                Only newly created tokens can be embedded (they are shown once).
              </div>
            )}

            <ol className="bookmarklet-steps">
              <li>Select an API token above, then click the button below to copy the bookmarklet code.</li>
              <li>Create a new bookmark in your bookmarks bar (right-click → Add page).</li>
              <li>Name it "Save to Savers" and paste the code as the URL.</li>
            </ol>
            <button
              className="btn btn-primary"
              onClick={() => void copyBookmarklet()}
            >
              {bookmarkletCopied ? "Copied!" : "Copy bookmarklet code"}
            </button>
          </section>

          <section className="section" id="api-tokens-section">
            <div className="section-title">API tokens</div>
            <p className="small muted">
              Long-lived tokens for clients that can&apos;t use the web session
              (the iOS Share Extension, scripts, etc.). Treat them like
              passwords.
            </p>

            {revealedToken && (
              <div className="reveal">
                <div className="reveal-title">Your new token</div>
                <p className="small muted">
                  Copy this now — for your security we won&apos;t show it
                  again. Paste it into the iOS app when prompted.
                </p>
                <code className="reveal-token">{revealedToken}</code>
                <div className="reveal-actions">
                  <button className="btn btn-primary" onClick={copyRevealed}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <button
                    className="btn"
                    onClick={() => setRevealedToken(null)}
                  >
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
              <button
                className="btn btn-primary"
                onClick={() => void createToken()}
                disabled={creating}
              >
                {creating ? "Creating…" : "Create token"}
              </button>
            </div>

            {error && <div className="error small">{error}</div>}

            {loading ? (
              <div className="small muted">Loading…</div>
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
          </section>
        </div>
      </div>

      <style jsx>{`
        .backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.32);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 60;
          padding: 24px;
        }
        .panel {
          width: 560px;
          max-width: 100%;
          max-height: 86vh;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid var(--color-border);
        }
        .title {
          font-weight: 600;
        }
        .close {
          background: transparent;
          border: 0;
          font-size: 22px;
          line-height: 1;
          color: var(--color-text-muted);
          cursor: pointer;
          padding: 4px 8px;
        }
        .close:hover {
          color: var(--color-text);
        }
        .body {
          padding: 16px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .section {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .section-title {
          font-weight: 600;
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
          padding: 8px 10px;
          border: 1px solid var(--color-border);
          border-radius: 6px;
          background: var(--color-bg);
          color: var(--color-text);
          font: inherit;
        }
        .reveal {
          border: 1px solid var(--color-border);
          border-radius: 8px;
          background: var(--color-bg-secondary);
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .reveal-title {
          font-weight: 600;
        }
        .reveal-token {
          display: block;
          padding: 8px 10px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 12px;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: 6px;
          word-break: break-all;
          user-select: all;
        }
        .reveal-actions {
          display: flex;
          gap: 6px;
        }
        .tokens {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .token-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border: 1px solid var(--color-border);
          border-radius: 6px;
          background: var(--color-bg-secondary);
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
        .btn {
          appearance: none;
          font: inherit;
          padding: 6px 10px;
          border-radius: 6px;
          border: 1px solid var(--color-border);
          background: var(--color-bg);
          color: var(--color-text);
          cursor: pointer;
        }
        .btn:hover {
          border-color: var(--color-border-strong);
        }
        .btn-primary {
          background: var(--color-text);
          color: var(--color-bg);
          border-color: var(--color-text);
        }
        .btn-primary:hover {
          opacity: 0.9;
        }
        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .btn-ghost {
          background: transparent;
        }
        .btn-ghost.danger {
          color: #ff7a7a;
        }
        .bookmarklet-steps {
          margin: 0;
          padding-left: 18px;
          font-size: 12px;
          color: var(--color-text-muted);
          line-height: 1.7;
        }
        .bookmarklet-token-row {
          display: flex;
          gap: 8px;
        }
        .bookmarklet-token-select {
          flex: 1;
          padding: 8px 10px;
          border: 1px solid var(--color-border);
          border-radius: 6px;
          background: var(--color-bg);
          color: var(--color-text);
          font: inherit;
          font-size: 13px;
        }
        @media (max-width: 768px) {
          .backdrop {
            padding: 0;
            align-items: stretch;
          }
          .panel {
            max-height: 100dvh;
            border-radius: 0;
            width: 100%;
            border: 0;
          }
        }
      `}</style>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
