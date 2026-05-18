"use client";

import { useEffect, useMemo, useState } from "react";
import type { Bookmark, Collection, DuplicateGroup, FeedSubscription } from "@/lib/types";
import { api, canonicalBookmarkUrl } from "@/lib/api";
import ExportBookmarksButton from "./ExportBookmarksButton";

import { buildBookmarkletCode } from "@/lib/save-url";

type TokenRow = {
  id: string;
  name: string;
  prefix: string;
  last_used_at: string | null;
  created_at: string;
};

type QueueStatus = {
  configured: boolean;
  reachable: boolean;
  counts: {
    waiting: number;
    active: number;
    delayed: number;
    failed: number;
  } | null;
};

type SystemHealth = {
  services: {
    redis: { configured: boolean; reachable: boolean };
    ai: { configured: boolean };
    screenshotQueue: QueueStatus;
    autoTagQueue: QueueStatus;
    linkCheckQueue: QueueStatus;
  };
};

type Props = {
  bookmarks: Bookmark[];
  flatCollections: Collection[];
  userEmail?: string | null;
  userAvatarUrl?: string | null;
  onSignOut?: () => void | Promise<void>;
  onGeneratedPreviewsQueued?: (ids: string[]) => void;
  onBookmarksChanged?: () => void;
};

export default function SettingsSections({
  bookmarks,
  flatCollections,
  userEmail,
  userAvatarUrl,
  onSignOut,
  onGeneratedPreviewsQueued,
  onBookmarksChanged,
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
  const [refreshingPreviews, setRefreshingPreviews] = useState(false);
  const [previewRefreshMessage, setPreviewRefreshMessage] = useState<string | null>(null);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [loadingDuplicateGroups, setLoadingDuplicateGroups] = useState(false);
  const [keptByGroup, setKeptByGroup] = useState<Map<string, Set<string>>>(new Map());
  const [dupStrategy, setDupStrategy] = useState<"newest" | "oldest" | "manual">("newest");
  const [dupBusy, setDupBusy] = useState(false);
  const [dupToast, setDupToast] = useState<{
    message: string;
    deleteId: string | null;
  } | null>(null);
  const [dupToastTimer, setDupToastTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [feeds, setFeeds] = useState<FeedSubscription[]>([]);
  const [loadingFeeds, setLoadingFeeds] = useState(false);
  const [newFeedName, setNewFeedName] = useState("");
  const [newFeedUrl, setNewFeedUrl] = useState("");

  const [addingFeed, setAddingFeed] = useState(false);
  const [removingFeed, setRemovingFeed] = useState<string | null>(null);
  const [checkingFeeds, setCheckingFeeds] = useState(false);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [loadingSystemHealth, setLoadingSystemHealth] = useState(false);
  const [systemHealthError, setSystemHealthError] = useState<string | null>(null);

  const generatedPreviewCount = bookmarks.filter((bookmark) => !bookmark.custom_preview_path).length;
  const customPreviewCount = bookmarks.filter((bookmark) => bookmark.custom_preview_path).length;
  const brokenLinkCount = bookmarks.filter((bookmark) => bookmark.link_status === "broken").length;

  const duplicateCount = (() => {
    const seen = new Set<string>();
    let count = 0;
    for (const b of bookmarks) {
      const key = canonicalBookmarkUrl(b.url);
      if (seen.has(key)) count++;
      else seen.add(key);
    }
    return count;
  })();

  const hasIPhoneShareToken = useMemo(
    () => tokens.some((token) => token.name.toLowerCase().includes("iphone share")),
    [tokens],
  );

  useEffect(() => {
    void load();
    void loadSystemHealth();
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

  async function loadSystemHealth() {
    setLoadingSystemHealth(true);
    setSystemHealthError(null);
    try {
      const data = await api.systemHealth();
      setSystemHealth(data);
    } catch (e) {
      setSystemHealthError(e instanceof Error ? e.message : "Could not load system status");
    } finally {
      setLoadingSystemHealth(false);
    }
  }

  async function createNamedToken(name: string) {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const result = await api.createToken(name.trim());
      setRevealedToken(result.token);
      await load();
      return result.token;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create token");
    } finally {
      setCreating(false);
    }
  }

  async function createToken() {
    const name = newTokenName.trim();
    if (!name) return;
    const token = await createNamedToken(name);
    if (token) {
      setNewTokenName("");
    }
  }

  async function createIPhoneShareToken() {
    await createNamedToken("iPhone Share");
  }

  async function copyBookmarklet() {
    try {
      await navigator.clipboard.writeText(buildBookmarkletCode());
      setBookmarkletCopied(true);
      window.setTimeout(() => setBookmarkletCopied(false), 1800);
    } catch {
      // ignore
    }
  }

  function openBookmarkletSetupPage() {
    window.open("/bookmarklet", "_blank", "noopener,noreferrer");
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

  const deleteCount = useMemo(() => {
    let count = 0;
    for (const group of duplicateGroups) {
      const kept = keptByGroup.get(group.canonicalUrl);
      const keptSize = kept?.size ?? 0;
      count += group.instances.length - keptSize;
    }
    return count;
  }, [duplicateGroups, keptByGroup]);

  const canDelete = !dupBusy && deleteCount > 0;

  async function handleOpenDuplicates(open: boolean) {
    if (!open || duplicateGroups.length > 0) return;
    setLoadingDuplicateGroups(true);
    try {
      const data = await api.getDuplicateGroups();
      setDuplicateGroups(data.groups);
      applyStrategyToGroups("newest", data.groups);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to load duplicates");
    } finally {
      setLoadingDuplicateGroups(false);
    }
  }

  function applyStrategyToGroups(s: "newest" | "oldest" | "manual", groups: DuplicateGroup[]) {
    const next = new Map<string, Set<string>>();
    for (const group of groups) {
      const instances = [...group.instances];
      if (s === "newest") {
        instances.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
      } else if (s === "oldest") {
        instances.sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
      }
      if (s !== "manual") {
        next.set(group.canonicalUrl, new Set([instances[0].id]));
      }
    }
    setKeptByGroup(next);
  }

  function handleStrategyChange(s: "newest" | "oldest" | "manual") {
    setDupStrategy(s);
    applyStrategyToGroups(s, duplicateGroups);
  }

  function toggleInstance(canonicalUrl: string, id: string) {
    setKeptByGroup((prev) => {
      const next = new Map(prev);
      const current = next.get(canonicalUrl);
      if (!current || current.size === 0) {
        next.set(canonicalUrl, new Set([id]));
      } else if (current.has(id)) {
        if (current.size === 1) return prev;
        const nextSet = new Set(current);
        nextSet.delete(id);
        next.set(canonicalUrl, nextSet);
      } else {
        const nextSet = new Set(current);
        nextSet.add(id);
        next.set(canonicalUrl, nextSet);
      }
      return next;
    });
  }

  async function loadFeeds() {
    setLoadingFeeds(true);
    try {
      const data = await api.listFeeds();
      setFeeds(data.subscriptions);
    } catch {
      // ignore
    } finally {
      setLoadingFeeds(false);
    }
  }

  async function handleAddFeed() {
    if (addingFeed || !newFeedName.trim() || !newFeedUrl.trim()) return;
    setAddingFeed(true);
    try {
      await api.createFeed(newFeedUrl.trim(), newFeedName.trim());
      setNewFeedName("");
      setNewFeedUrl("");

      await loadFeeds();
      // Immediately check the new feed, then refresh bookmarks so counts appear
      try { await api.checkFeeds(); } catch { /* ok */ }
      onBookmarksChanged?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to add feed");
    } finally {
      setAddingFeed(false);
    }
  }

  async function handleRemoveFeed(id: string) {
    if (removingFeed) return;
    setRemovingFeed(id);
    try {
      await api.deleteFeed(id);
      await loadFeeds();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to remove feed");
    } finally {
      setRemovingFeed(null);
    }
  }

  async function handleCheckFeeds() {
    if (checkingFeeds || feeds.length === 0) return;
    setCheckingFeeds(true);
    try {
      const result = await api.checkFeeds();
      const lines = result.results.map(
        (r) => `${r.name}: ${r.error ? `❌ ${r.error}` : `${r.newItems} new / ${r.totalEntries} entries`}`
      );
      alert(`${result.totalNew} new total\n\n${lines.join("\n")}`);
      onBookmarksChanged?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Check failed");
    } finally {
      setCheckingFeeds(false);
    }
  }

  async function handleDeleteDuplicates() {
    const idsToDelete: string[] = [];
    for (const group of duplicateGroups) {
      const kept = keptByGroup.get(group.canonicalUrl);
      for (const inst of group.instances) {
        if (!kept?.has(inst.id)) {
          idsToDelete.push(inst.id);
        }
      }
    }

    if (idsToDelete.length === 0) return;

    setDupBusy(true);
    try {
      const res = await fetch("/api/bookmarks/duplicates/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: idsToDelete }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");

      const msg = `Deleted ${data.deletedCount} bookmark${data.deletedCount !== 1 ? "s" : ""}.`;

      const timer = setTimeout(() => setDupToast(null), 5000);
      setDupToastTimer(timer);
      setDupToast({ message: msg, deleteId: data.deleteId ?? null });
      onBookmarksChanged?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDupBusy(false);
    }
  }

  async function handleUndoDelete() {
    if (!dupToast?.deleteId) return;
    setDupBusy(true);
    try {
      const res = await fetch("/api/bookmarks/duplicates/delete/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteId: dupToast.deleteId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Undo failed");

      if (dupToastTimer) clearTimeout(dupToastTimer);
      setDupToast(null);
      onBookmarksChanged?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Undo failed");
    } finally {
      setDupBusy(false);
    }
  }

  return (
    <div className="settings-sections">
      <section className="settings-block">
        <div className="settings-heading">
          <div>
            <h2>Account</h2>
          </div>
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
          {onSignOut && (
            <button className="btn account-signout" onClick={() => void onSignOut()}>
              Sign out
            </button>
          )}
        </div>
      </section>

      <section className="settings-block">
        <div className="settings-heading">
          <div>
            <h2>Save to Savers</h2>
          </div>
        </div>
        <div className="settings-grid three-up">
          <div className="settings-card feature-card">
            <div className="feature-top">
              <div>
                <div className="feature-title">Browser extension</div>
                <div className="feature-sub">
                  Best in Chrome. Save the current page, suggest tags, and jump back into Savers from the toolbar.
                </div>
              </div>
              <span className="status-chip status-ready">Fastest</span>
            </div>
            <p className="small muted">
              If the Savers icon is already in your browser toolbar, you have the quickest save flow available.
            </p>
          </div>

          <div className="settings-card feature-card">
            <div className="feature-top">
              <div>
                <div className="feature-title">Quick save link</div>
                <div className="feature-sub">
                  Works from any browser bookmark bar. Best fallback when the extension is not available.
                </div>
              </div>
              <span className="status-chip status-ready">Ready</span>
            </div>
            <div className="feature-actions">
              <button
                className="btn btn-primary"
                onClick={() => void copyBookmarklet()}
              >
                {bookmarkletCopied ? "Copied!" : "Copy bookmarklet code"}
              </button>
              <button
                className="btn"
                onClick={openBookmarkletSetupPage}
              >
                Open setup page
              </button>
            </div>
            <p className="small muted">
              Uses your existing session &mdash; no token needed. The overlay opens right on the page you are saving.
            </p>
            <details className="details">
              <summary>
                <span>Manual setup steps</span>
                <span className="dropdown-circle" aria-hidden="true">
                  <svg viewBox="0 0 16 16" fill="none">
                    <path d="M4 6.5 8 10.5 12 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </summary>
              <ol className="bookmarklet-steps">
                <li>Click Copy bookmarklet code.</li>
                <li>Bookmark this page (<kbd>Ctrl+D</kbd> / <kbd>&#8984;+D</kbd>) to capture the icon.</li>
                <li>Right-click the new bookmark, choose Edit, paste the copied code, and name it &ldquo;Save to Savers&rdquo;.</li>
              </ol>
            </details>
          </div>

          <div className="settings-card feature-card">
            <div className="feature-top">
              <div>
                <div className="feature-title">iPhone / iPad share</div>
                <div className="feature-sub">
                  Use a token in the iOS share extension so saves still work when Safari is not signed in here.
                </div>
              </div>
              <span className={`status-chip ${hasIPhoneShareToken ? "status-ready" : "status-muted"}`}>
                {hasIPhoneShareToken ? "Ready" : "Needs setup"}
              </span>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => void createIPhoneShareToken()}
              disabled={creating}
            >
              {creating ? "Creating…" : hasIPhoneShareToken ? "Create fresh share token" : "Create share token"}
            </button>
            <p className="small muted">
              After you create it, copy the token below and paste it into the iPhone share extension setup.
            </p>
          </div>
        </div>

        {revealedToken && (
          <div className="settings-card reveal-card">
            <div className="feature-title">New token ready</div>
            <p className="small muted">
              Copy this now. For security, Savers won&apos;t show the full token again.
            </p>
            <code className="reveal-token">{revealedToken}</code>
            <div className="reveal-actions">
              <button className="btn btn-primary" onClick={() => void copyRevealed()}>
                {copied ? "Copied" : "Copy token"}
              </button>
              <button className="btn" onClick={() => setRevealedToken(null)}>
                Dismiss
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="settings-block">
        <details
          className="advanced-shell"
          onToggle={async (e) => {
            if ((e.target as HTMLDetailsElement).open) {
              await loadFeeds();
            }
          }}
        >
          <summary>
            <span className="summary-copy">
              <span>RSS Feeds</span>
              <span className="small muted">
                Monitor RSS/Atom feeds and review new entries before keeping them.
              </span>
            </span>
            <span className="dropdown-circle" aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none">
                <path d="M4 6.5 8 10.5 12 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </summary>

          <div className="advanced-card">
            <div className="feature-title">Add a feed</div>
            <div className="feature-sub">
              Paste an RSS or Atom feed URL. New entries will appear in that feed as a review queue.
            </div>
            <div className="create-row">
              <input
                placeholder="Feed name"
                value={newFeedName}
                onChange={(e) => setNewFeedName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAddFeed();
                  }
                }}
                disabled={addingFeed}
              />
              <input
                placeholder="Feed URL"
                value={newFeedUrl}
                onChange={(e) => setNewFeedUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAddFeed();
                  }
                }}
                disabled={addingFeed}
              />
              <button
                className="btn btn-primary"
                onClick={() => void handleAddFeed()}
                disabled={addingFeed || !newFeedName.trim() || !newFeedUrl.trim()}
              >
                {addingFeed ? "Adding…" : "Add feed"}
              </button>
            </div>
            {loadingFeeds ? (
              <div className="small muted">Loading feeds…</div>
            ) : feeds.length === 0 ? (
              <div className="small muted">No feeds yet.</div>
            ) : (
              <ul className="tokens">
                {feeds.map((f) => (
                  <li key={f.id} className="token-row">
                    <div className="token-meta">
                      <div className="token-name">{f.name}</div>
                      <div className="token-sub small muted">
                        {f.collection_id && (
                          <span>{flatCollections.find((c) => c.id === f.collection_id)?.name ?? "Unknown"} · </span>
                        )}
                        <span>{f.feed_url}</span>
                        {f.last_checked_at && (
                          <span> · last checked {formatDate(f.last_checked_at)}</span>
                        )}
                      </div>
                    </div>
                    <button
                      className="btn btn-ghost danger"
                      onClick={() => void handleRemoveFeed(f.id)}
                      disabled={removingFeed === f.id}
                    >
                      {removingFeed === f.id ? "Removing…" : "Remove"}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {feeds.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => void handleCheckFeeds()}
                  disabled={checkingFeeds}
                >
                  {checkingFeeds ? "Checking…" : "Check feeds now"}
                </button>
              </div>
            )}
          </div>
        </details>
      </section>

      {duplicateCount > 0 && (
        <section className="settings-block">
          <details
            className="advanced-shell"
            onToggle={async (e) => {
              if ((e.target as HTMLDetailsElement).open) {
                // Reset state when opening
                setDuplicateGroups([]);
                setKeptByGroup(new Map());
                setDupStrategy("newest");
                setDupToast(null);
                if (dupToastTimer) clearTimeout(dupToastTimer);
                await handleOpenDuplicates(true);
              }
            }}
          >
            <summary>
              <span className="summary-copy">
                <span>Duplicates</span>
                <span className="small muted">
                  {duplicateCount} duplicate bookmark{duplicateCount !== 1 ? "s" : ""} found across your library.
                </span>
              </span>
              <span className="dropdown-circle" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none">
                  <path d="M4 6.5 8 10.5 12 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </summary>

            <div className="advanced-card">
              {loadingDuplicateGroups ? (
                <div className="small muted" style={{ padding: "24px 0", textAlign: "center" }}>
                  Loading duplicates…
                </div>
              ) : duplicateGroups.length === 0 ? (
                <div className="small muted" style={{ padding: "24px 0", textAlign: "center" }}>
                  No duplicate bookmarks found.
                </div>
              ) : (
                <>
                  {/* Toolbar */}
                  <div className="dup-toolbar">
                    <span className="muted">
                      {duplicateGroups.length} group{duplicateGroups.length !== 1 ? "s" : ""},{" "}
                      {duplicateGroups.reduce((s, g) => s + g.instances.length - 1, 0)} duplicate
                      {duplicateGroups.reduce((s, g) => s + g.instances.length - 1, 0) !== 1 ? "s" : ""}
                    </span>
                    <select
                      className="dup-strategy-select"
                      value={dupStrategy}
                      onChange={(e) => handleStrategyChange(e.target.value as typeof dupStrategy)}
                    >
                      <option value="newest">Keep Newest</option>
                      <option value="oldest">Keep Oldest</option>
                      <option value="manual">Manual Only</option>
                    </select>
                  </div>

                  {/* Groups */}
                  <div className="dup-body">
                    {duplicateGroups.map((group) => {
                      const kept = keptByGroup.get(group.canonicalUrl);
                      const keptSize = kept?.size ?? 0;
                      const hasNoneSelected = keptSize === 0;
                      return (
                        <div key={group.canonicalUrl} className="dup-group">
                          <div className="dup-group-header">
                            <div className="dup-group-url">
                              <span className="dup-group-host">{group.displayHost}</span>
                              {group.displayPath && (
                                <span className="dup-group-path muted">{group.displayPath}</span>
                              )}
                            </div>
                            <div className="dup-group-badges">
                              {group.isCrossCollection ? (
                                <span className="dup-badge dup-badge-cross">
                                  Different collections
                                </span>
                              ) : (
                                <span className="dup-badge dup-badge-same">
                                  Same collection
                                </span>
                              )}
                              {hasNoneSelected && (
                                <span className="dup-badge dup-badge-warn">
                                  Select at least one to keep
                                </span>
                              )}
                            </div>
                          </div>
                          {group.instances.map((inst) => {
                            const isKept = kept?.has(inst.id) ?? false;
                            const isLastKept = keptSize === 1 && isKept;
                            return (
                              <label
                                key={inst.id}
                                className={`dup-instance ${isKept ? "kept" : "deleted"}`}
                              >
                                <input
                                  type="checkbox"
                                  className="dup-check"
                                  checked={isKept}
                                  disabled={isLastKept}
                                  onChange={() => toggleInstance(group.canonicalUrl, inst.id)}
                                />
                                {inst.favicon && (
                                  <img
                                    className="dup-fav"
                                    src={inst.favicon}
                                    alt=""
                                    width={12}
                                    height={12}
                                  />
                                )}
                                <span className="dup-instance-title">
                                  {inst.title || inst.url}
                                </span>
                                <span className="dup-instance-collection muted">
                                  {inst.collection_name}
                                </span>
                                <span className="dup-instance-date muted">
                                  {formatDate(inst.created_at)}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer */}
                  <div className="dup-foot">
                    <button
                      className="btn btn-primary"
                      disabled={!canDelete}
                      onClick={() => void handleDeleteDuplicates()}
                    >
                      {dupBusy ? "Deleting…" : `Delete ${deleteCount} Duplicate${deleteCount !== 1 ? "s" : ""}`}
                    </button>
                  </div>

                  {/* Toast */}
                  {dupToast && (
                    <div className="dup-toast" role="status">
                      <span>{dupToast.message}</span>
                      {dupToast.deleteId && (
                        <button className="dup-undo-btn" onClick={() => void handleUndoDelete()} disabled={dupBusy}>
                          Undo
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </details>
        </section>
      )}

      <section className="settings-block">
        <div className="settings-heading">
          <div>
            <h2>Library & data</h2>
          </div>
        </div>
        <div className="settings-grid two-up">
          <div className="settings-card feature-card">
            <div className="feature-title">Library snapshot</div>
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
                <span className="stat-value">{duplicateCount}</span>
                <span className="stat-label">Duplicates</span>
              </div>
            </div>
          </div>

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
            <span className="summary-copy">
              <span>Privacy, security & advanced</span>
              <span className="small muted">Tokens, background services, and manual setup details</span>
            </span>
            <span className="dropdown-circle" aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none">
                <path d="M4 6.5 8 10.5 12 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </summary>

          <div className="settings-grid two-up advanced-grid">
          <div className="settings-card advanced-card">
            <div className="feature-top">
              <div>
                <div className="feature-title">System status</div>
                <div className="feature-sub">
                  A quick read on the background services that power previews, AI, and link checks.
                </div>
              </div>
              <button className="btn" onClick={() => void loadSystemHealth()} disabled={loadingSystemHealth}>
                {loadingSystemHealth ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            {systemHealthError ? (
              <div className="small error">{systemHealthError}</div>
            ) : !systemHealth ? (
              <div className="small muted">Loading system status…</div>
            ) : (
              <div className="health-list">
                <div className="health-row">
                  <div className="health-label">Redis</div>
                  <div className={`health-badge ${systemHealth.services.redis.reachable ? "status-ready" : "status-danger"}`}>
                    {systemHealth.services.redis.reachable
                      ? "Connected"
                      : systemHealth.services.redis.configured
                        ? "Unreachable"
                        : "Not configured"}
                  </div>
                </div>
                <div className="health-row">
                  <div className="health-label">AI suggestions</div>
                  <div className={`health-badge ${systemHealth.services.ai.configured ? "status-ready" : "status-muted"}`}>
                    {systemHealth.services.ai.configured ? "Configured" : "Unavailable"}
                  </div>
                </div>
                {[
                  { label: "Screenshot jobs", queue: systemHealth.services.screenshotQueue },
                  { label: "Auto-tag jobs", queue: systemHealth.services.autoTagQueue },
                  { label: "Link checks", queue: systemHealth.services.linkCheckQueue },
                ].map(({ label, queue }) => (
                  <div className="health-row" key={label}>
                    <div className="health-meta">
                      <div className="health-label">{label}</div>
                      {queue.counts && (
                        <div className="small muted">
                          {queue.counts.waiting} waiting · {queue.counts.active} active · {queue.counts.delayed} delayed · {queue.counts.failed} failed
                        </div>
                      )}
                    </div>
                    <div
                      className={`health-badge ${
                        queue.reachable ? "status-ready" : queue.configured ? "status-danger" : "status-muted"
                      }`}
                    >
                      {queue.reachable
                        ? "Ready"
                        : queue.configured
                          ? "Needs attention"
                          : "Not configured"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="settings-card advanced-card">
            <div className="feature-title">API tokens</div>
            <div className="feature-sub">
              Long-lived tokens for clients that can&apos;t rely on your browser session, like the iPhone share flow or scripts.
            </div>

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
          </div>
        </details>
      </section>

      <style jsx>{`
        .settings-sections {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .settings-block {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .settings-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }
        .settings-heading h2 {
          margin: 0;
          font-size: 13px;
          line-height: 1.2;
          font-weight: 400;
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
        .three-up {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .settings-card {
          border: 1px solid var(--color-border);
          border-radius: 18px;
          padding: 16px;
          background: color-mix(in srgb, var(--color-bg-secondary) 88%, transparent);
          display: flex;
          flex-direction: column;
          gap: 10px;
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
          font-weight: 400;
        }
        .account-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .account-meta {
          flex: 1 1 auto;
          min-width: 0;
        }
        .account-label {
          font-size: 13px;
          color: var(--color-text-muted);
        }
        .account-email {
          margin-top: 2px;
          font-size: 13px;
          font-weight: 400;
          word-break: break-word;
        }
        .account-signout {
          margin-left: auto;
          white-space: nowrap;
        }
        .feature-card {
          min-height: 100%;
        }
        .reveal-card {
          margin-top: 2px;
        }
        .feature-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .feature-title {
          font-size: 13px;
          font-weight: 400;
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
          font-size: 13px;
          line-height: 1;
          white-space: nowrap;
          font-weight: 400;
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
        .status-danger {
          background: color-mix(in srgb, #ff5a5a 10%, var(--color-bg));
          color: color-mix(in srgb, #ff5a5a 72%, var(--color-text));
          border-color: color-mix(in srgb, #ff5a5a 28%, var(--color-border));
        }
        .details {
          border-top: 1px solid var(--color-border);
          padding-top: 12px;
        }
        .details summary {
          cursor: pointer;
          color: var(--color-text);
          font-size: 13px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          list-style: none;
        }
        .details summary::-webkit-details-marker {
          display: none;
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
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .stat-value {
          font-size: 13px;
          line-height: 1;
          font-weight: 400;
          letter-spacing: 0;
        }
        .stat-label {
          font-size: 13px;
          color: var(--color-text-muted);
        }
        .advanced-shell {
          border: 1px solid var(--color-border);
          border-radius: 18px;
          background: color-mix(in srgb, var(--color-bg-secondary) 88%, transparent);
        }
        .advanced-shell summary {
          list-style: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 16px;
          font-size: 13px;
          font-weight: 400;
        }
        .advanced-shell summary::-webkit-details-marker {
          display: none;
        }
        .summary-copy {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }
        .dropdown-circle {
          flex: 0 0 auto;
          width: 28px;
          height: 28px;
          border-radius: 999px;
          border: 1px solid var(--color-border);
          background: var(--color-bg);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--color-text-muted);
          transition: transform 180ms ease, color 180ms ease, background 180ms ease;
        }
        .dropdown-circle svg {
          width: 14px;
          height: 14px;
        }
        .details[open] .dropdown-circle,
        .advanced-shell[open] .dropdown-circle {
          transform: rotate(180deg);
          color: var(--color-text);
          background: color-mix(in srgb, var(--color-bg-secondary) 82%, transparent);
        }
        .advanced-card {
          border: 0;
          border-top: 1px solid var(--color-border);
          border-radius: 0;
          background: transparent;
          padding: 16px;
        }
        .advanced-grid {
          padding-top: 12px;
        }
        .small {
          font-size: 13px;
        }
        .muted {
          color: var(--color-text-muted);
        }
        .health-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .health-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border: 1px solid var(--color-border);
          border-radius: 14px;
          background: var(--color-bg);
          padding: 10px 12px;
        }
        .health-meta {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }
        .health-label {
          font-size: 13px;
          color: var(--color-text);
        }
        .health-badge {
          flex: 0 0 auto;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid var(--color-border);
          font-size: 13px;
          line-height: 1;
          white-space: nowrap;
          font-weight: 400;
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
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .reveal-title {
          font-size: 13px;
          font-weight: 400;
        }
        .reveal-token {
          display: block;
          padding: 10px 12px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 13px;
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
          padding: 10px 12px;
          border: 1px solid var(--color-border);
          border-radius: 14px;
          background: var(--color-bg);
        }
        .token-meta {
          flex: 1 1 auto;
          min-width: 0;
        }
        .token-name {
          font-size: 13px;
          font-weight: 400;
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
          .three-up {
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
          .account-card {
            flex-direction: column;
            align-items: flex-start;
          }
          .advanced-shell summary {
            align-items: flex-start;
          }
          .summary-copy {
            width: 100%;
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
          .health-row {
            flex-direction: column;
            align-items: flex-start;
          }
          .health-badge {
            width: 100%;
            text-align: center;
          }
          .account-signout {
            margin-left: 0;
            width: 100%;
          }
        }

        /* Duplicate review (inline in settings) */
        .dup-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 12px;
          border-bottom: 1px solid var(--color-border);
          font-size: 13px;
        }
        .dup-strategy-select {
          height: 28px;
          padding: 0 6px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-bg);
          font: inherit;
          font-size: 13px;
        }
        .dup-body {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 12px 12px;
        }
        .dup-group {
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          overflow: hidden;
        }
        .dup-group-header {
          padding: 8px 10px;
          background: var(--color-bg-secondary);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
        }
        .dup-group-url {
          display: flex;
          flex-direction: column;
          gap: 1px;
          min-width: 0;
          flex: 1;
        }
        .dup-group-host {
          font-size: 13px;
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .dup-group-path {
          font-size: 13px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .dup-group-badges {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .dup-badge {
          font-size: 13px;
          padding: 1px 6px;
          border-radius: var(--radius-sm);
          white-space: nowrap;
        }
        .dup-badge-cross {
          background: var(--color-bg);
          color: var(--color-text-muted);
        }
        .dup-badge-same {
          background: rgba(209, 48, 48, 0.08);
          color: var(--color-danger, #c62828);
        }
        .dup-badge-warn {
          background: rgba(209, 48, 48, 0.08);
          color: var(--color-danger, #c62828);
        }
        .dup-instance {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          border-bottom: 1px solid var(--color-border);
          cursor: pointer;
          font-size: 13px;
          transition: background 120ms ease;
        }
        .dup-instance:last-child {
          border-bottom: 0;
        }
        .dup-instance:hover {
          background: var(--color-bg-hover);
        }
        .dup-instance.kept {
          background: var(--color-bg);
        }
        .dup-instance.deleted {
          opacity: 0.5;
        }
        .dup-instance.deleted .dup-instance-title {
          text-decoration: line-through;
        }
        .dup-check {
          accent-color: var(--color-text);
          flex-shrink: 0;
        }
        .dup-fav {
          width: 12px;
          height: 12px;
          border-radius: 2px;
          flex-shrink: 0;
        }
        .dup-instance-title {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .dup-instance-collection {
          font-size: 13px;
          font-feature-settings: "tnum" 1;
          flex-shrink: 0;
        }
        .dup-instance-date {
          font-size: 13px;
          font-feature-settings: "tnum" 1;
          flex-shrink: 0;
          min-width: 60px;
          text-align: right;
        }
        .dup-foot {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          padding: 12px 12px 18px;
          border-top: 1px solid var(--color-border);
        }
        .dup-toast {
          margin-top: 10px;
          background: var(--color-text);
          color: var(--color-bg);
          padding: 10px 16px;
          border-radius: 999px;
          font-size: 13px;
          display: inline-flex;
          align-items: center;
          gap: 14px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
        }
        .dup-undo-btn {
          appearance: none;
          background: transparent;
          border: 0;
          color: var(--color-bg);
          font: inherit;
          font-size: 13px;
          text-decoration: underline;
          cursor: pointer;
          padding: 0;
        }

        @media (max-width: 640px) {
          .dup-toolbar {
            flex-direction: column;
            align-items: flex-start;
          }
          .dup-instance {
            flex-wrap: wrap;
            gap: 4px 8px;
          }
          .dup-instance-date {
            min-width: 0;
            text-align: left;
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
