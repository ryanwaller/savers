"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Bookmark, Collection } from "@/lib/types";
import { api, canonicalBookmarkUrl, domainOf } from "@/lib/api";
import CollectionPicker from "./CollectionPicker";
import ConfirmDialog from "./ConfirmDialog";

type Props = {
  bookmark: Bookmark;
  existingBookmarks: Bookmark[];
  flat: Collection[];
  tree: Collection[];
  onCreateCollection: (name: string, parentId: string | null) => Promise<Collection>;
  onClose: () => void;
  onSaved: (b: Bookmark) => void;
  onPatched: (b: Bookmark) => void;
  onDeleted: (id: string) => void;
};

export default function BookmarkDetail({
  bookmark,
  existingBookmarks,
  flat,
  tree,
  onCreateCollection,
  onClose,
  onSaved,
  onPatched,
  onDeleted,
}: Props) {
  const [title, setTitle] = useState(bookmark.title ?? "");
  const [description, setDescription] = useState(bookmark.description ?? "");
  const [notes, setNotes] = useState(bookmark.notes ?? "");
  const [tags, setTags] = useState<string[]>(bookmark.tags ?? []);
  const [autoTags, setAutoTags] = useState<string[]>(bookmark.auto_tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [collectionId, setCollectionId] = useState<string | null>(bookmark.collection_id);
  const [saving, setSaving] = useState(false);
  const [tagSaving, setTagSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{
    collection_id: string | null;
    collection_path: string | null;
    proposed_collection_name?: string | null;
    proposed_parent_collection_id?: string | null;
    proposed_parent_collection_path?: string | null;
    confidence: "high" | "medium" | "low";
  } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiApplying, setAiApplying] = useState(false);
  const [aiDismissed, setAiDismissed] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [showCreateCollection, setShowCreateCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const [urlSaving, setUrlSaving] = useState(false);
  const [tagProposals, setTagProposals] = useState<string[]>([]);
  const [tagSuggestLoading, setTagSuggestLoading] = useState(false);
  const [tagSuggestStatus, setTagSuggestStatus] = useState<string | null>(null);

  // Real-time autosuggest state
  const [tagAutosuggestions, setTagAutosuggestions] = useState<string[]>([]);
  const [collectionAutosuggestions, setCollectionAutosuggestions] = useState<Collection[]>([]);
  const [activeTagIndex, setActiveTagIndex] = useState(-1);
  const [activeCollectionIndex, setActiveCollectionIndex] = useState(-1);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const b of existingBookmarks) {
      if (b.tags) {
        for (const t of b.tags) set.add(t.trim().toLowerCase());
      }
    }
    return Array.from(set).sort();
  }, [existingBookmarks]);

  useEffect(() => {
    const trimmed = tagInput.trim().toLowerCase();
    if (!trimmed) {
      setTagAutosuggestions([]);
      setActiveTagIndex(-1);
      return;
    }
    const filtered = allTags.filter(
      (t) => t.includes(trimmed) && !tags.some(existing => existing.toLowerCase() === t)
    ).slice(0, 8);
    setTagAutosuggestions(filtered);
    setActiveTagIndex(filtered.length > 0 ? 0 : -1);
  }, [tagInput, allTags, tags]);

  useEffect(() => {
    const trimmed = newCollectionName.trim().toLowerCase();
    if (!trimmed) {
      setCollectionAutosuggestions([]);
      setActiveCollectionIndex(-1);
      return;
    }
    const filtered = flat.filter(
      (c) => c.name.toLowerCase().includes(trimmed)
    ).slice(0, 8);
    setCollectionAutosuggestions(filtered);
    setActiveCollectionIndex(filtered.length > 0 ? 0 : -1);
  }, [newCollectionName, flat]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setAiSuggestion(null);
    setAiDismissed(false);
    setAiStatus(null);
    setShowCreateCollection(false);
    setNewCollectionName("");
    setTagProposals([]);
    setTagSuggestStatus(null);
    setEditingUrl(false);
    setUrlValue("");
    setUrlSaving(false);
  }, [bookmark.id]);

  const runSuggest = useCallback(async () => {
    if (!tree.length) return;
    setAiLoading(true);
    setAiStatus("Suggesting a collection…");
    try {
      const { suggestion } = await api.categorize({
        url: bookmark.url,
        title: title.trim() || bookmark.title,
        description: description.trim() || bookmark.description,
        collections: tree,
      });

      if (
        !suggestion ||
        suggestion.confidence === "low" ||
        (suggestion.collection_id && suggestion.collection_id === collectionId)
      ) {
        setAiSuggestion(null);
        setAiStatus("No clear suggestion.");
        return;
      }

      setAiSuggestion(suggestion);
      setAiDismissed(false);
      setAiStatus("Suggestion ready.");
    } catch (e) {
      setAiSuggestion(null);
      setAiStatus(
        `Suggestion failed: ${e instanceof Error ? e.message : "unknown error"}`
      );
    } finally {
      setAiLoading(false);
    }
  }, [bookmark.description, bookmark.title, bookmark.url, collectionId, description, title, tree]);

  async function createInlineCollection() {
    const name = newCollectionName.trim();
    if (!name) return;
    setCreatingCollection(true);
    setError(null);
    try {
      const created = await onCreateCollection(name, null);
      setCollectionId(created.id);
      setNewCollectionName("");
      setShowCreateCollection(false);
      setAiStatus(`Created ${created.name}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create collection");
    } finally {
      setCreatingCollection(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const { bookmark: updated } = await api.updateBookmark(bookmark.id, {
        title: title.trim() || null,
        description: description.trim() || null,
        notes: notes.trim() || null,
        tags,
        collection_id: collectionId,
      });
      onSaved(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function patchTags(nextTags: string[]) {
    setTagSaving(true);
    setError(null);
    try {
      const { bookmark: updated } = await api.updateBookmark(bookmark.id, {
        tags: nextTags,
      });
      onPatched(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save tags");
      setTags(bookmark.tags ?? []);
    } finally {
      setTagSaving(false);
    }
  }

  function buildNextTags(rawValue: string) {
    const next = normalizeTag(rawValue);
    if (!next) return null;
    if (tags.some((tag) => tag.toLowerCase() === next.toLowerCase())) return null;
    return [...tags, next];
  }

  async function commitTag(rawValue: string) {
    const nextTags = buildNextTags(rawValue);
    setTagInput("");
    if (!nextTags) return;
    setTags(nextTags);
    await patchTags(nextTags);
  }

  async function removeTag(tagToRemove: string) {
    const nextTags = tags.filter((tag) => tag !== tagToRemove);
    setTags(nextTags);
    await patchTags(nextTags);
  }

  async function acceptAutoTag(tag: string) {
    const prevAuto = [...autoTags];
    const prevUser = [...tags];
    setAutoTags((prev) => prev.filter((t) => t !== tag));
    setTags((prev) => [...prev, tag]);
    try {
      await api.acceptAutoTag(bookmark.id, tag);
    } catch {
      setAutoTags(prevAuto);
      setTags(prevUser);
    }
  }

  async function rejectAutoTag(tag: string) {
    const prev = [...autoTags];
    setAutoTags((prev) => prev.filter((t) => t !== tag));
    try {
      await api.rejectAutoTag(bookmark.id, tag);
    } catch {
      setAutoTags(prev);
    }
  }

  function pathFor(id: string | null): string | null {
    if (!id) return null;
    const byId = new Map(flat.map((c) => [c.id, c]));
    const segments: string[] = [];
    let current = byId.get(id);
    let safety = 0;
    while (current && safety < 50) {
      segments.unshift(current.name);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
      safety += 1;
    }
    return segments.length ? segments.join(" / ") : null;
  }

  async function runTagSuggest() {
    if (tagSuggestLoading) return;
    setTagSuggestLoading(true);
    setTagSuggestStatus("Reading the page…");
    try {
      const { tags: proposed } = await api.suggestTags({
        url: bookmark.url,
        title: title.trim() || bookmark.title,
        description: description.trim() || bookmark.description,
        existing_tags: tags,
        collection_path: pathFor(collectionId),
      });
      const fresh = proposed.filter(
        (t) => !tags.some((existing) => existing.toLowerCase() === t.toLowerCase())
      );
      setTagProposals(fresh);
      setTagSuggestStatus(
        fresh.length ? null : "No new tags to suggest."
      );
    } catch (e) {
      setTagProposals([]);
      setTagSuggestStatus(
        `Couldn't suggest tags: ${e instanceof Error ? e.message : "unknown error"}`
      );
    } finally {
      setTagSuggestLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshLoading(true);
    setError(null);
    try {
      const result = await api.refreshMetadata(bookmark.id);
      if (!result.title && !result.description) {
        setError("No metadata found on this page.");
        return;
      }
      if (result.title && !title.trim()) setTitle(result.title);
      if (result.description && !description.trim()) setDescription(result.description);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setRefreshLoading(false);
    }
  }

  async function saveUrl() {
    const next = urlValue.trim();
    if (!next || next === bookmark.url) {
      setEditingUrl(false);
      return;
    }
    setUrlSaving(true);
    setError(null);
    try {
      const { bookmark: updated } = await api.updateUrl(bookmark.id, next);
      onPatched(updated);
      setEditingUrl(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update URL");
    } finally {
      setUrlSaving(false);
    }
  }

  async function acceptProposal(tag: string) {
    setTagProposals((prev) => prev.filter((t) => t !== tag));
    const nextTags = buildNextTags(tag);
    if (!nextTags) return;
    setTags(nextTags);
    await patchTags(nextTags);
  }

  function dismissProposal(tag: string) {
    setTagProposals((prev) => prev.filter((t) => t !== tag));
  }

  async function doDelete() {
    setDeleting(true);
    try {
      await api.deleteBookmark(bookmark.id);
      setConfirmDeleteOpen(false);
      onDeleted(bookmark.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
      setDeleting(false);
    }
  }

  async function applyAiSuggestion() {
    if (!aiSuggestion) return;
    setAiApplying(true);
    setError(null);
    try {
      let nextCollectionId = aiSuggestion.collection_id;
      let pathLabel = aiSuggestion.collection_path;

      if (!nextCollectionId && aiSuggestion.proposed_collection_name) {
        const created = await onCreateCollection(
          aiSuggestion.proposed_collection_name,
          aiSuggestion.proposed_parent_collection_id ?? null
        );
        nextCollectionId = created.id;
        pathLabel = aiSuggestion.proposed_parent_collection_path
          ? `${aiSuggestion.proposed_parent_collection_path} / ${created.name}`
          : created.name;
      }

      if (!nextCollectionId) return;

      const { bookmark: updated } = await api.updateBookmark(bookmark.id, {
        collection_id: nextCollectionId,
      });
      setCollectionId(updated.collection_id);
      setAiSuggestion(null);
      setAiDismissed(false);
      setAiStatus(pathLabel ? `Using ${pathLabel}.` : "Suggestion applied.");
      onPatched(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply suggestion");
    } finally {
      setAiApplying(false);
    }
  }

  const host = domainOf(bookmark.url);
  const duplicateBookmarks = useMemo(() => {
    const canonical = canonicalBookmarkUrl(bookmark.url);
    return existingBookmarks.filter(
      (candidate) =>
        candidate.id !== bookmark.id && canonicalBookmarkUrl(candidate.url) === canonical
    );
  }, [bookmark.id, bookmark.url, existingBookmarks]);
  const showAiSuggestion = !aiDismissed && !!aiSuggestion;
  const aiTargetLabel = aiSuggestion?.collection_path
    ? aiSuggestion.collection_path
    : aiSuggestion?.proposed_parent_collection_path
      ? `${aiSuggestion.proposed_parent_collection_path} / ${aiSuggestion.proposed_collection_name}`
      : aiSuggestion?.proposed_collection_name;

  return (
    <div className="backdrop" onClick={onClose}>
      <ConfirmDialog
        open={confirmDeleteOpen}
        title={`Delete "${bookmark.title ?? host}"?`}
        description="This bookmark will be removed from Savers."
        confirmLabel="Delete"
        busy={deleting}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={doDelete}
      />
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <div className="title small muted">Bookmark</div>
          <button className="close" onClick={onClose} aria-label="Close">
            <span className="close-glyph">×</span>
          </button>
        </div>

        <div className="body">
          <div className="field url-field">
            <div className="label">URL</div>
            {editingUrl ? (
              <div className="url-edit-wrap">
                <input
                  autoFocus
                  className="url-input"
                  value={urlValue}
                  onChange={(e) => setUrlValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveUrl();
                    if (e.key === "Escape") setEditingUrl(false);
                  }}
                />
                <button
                  className="btn btn-small"
                  onClick={() => void saveUrl()}
                  disabled={urlSaving}
                >
                  {urlSaving ? "Saving…" : "Save"}
                </button>
                <button
                  className="btn btn-small btn-ghost"
                  onClick={() => setEditingUrl(false)}
                  disabled={urlSaving}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="url-row">
                <div className="url-domain-wrap">
                  {bookmark.favicon && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="fav" src={bookmark.favicon} alt="" />
                  )}
                  <span className="url-domain">{host}</span>
                </div>
                <div className="url-actions">
                  <button
                    className="url-edit-btn"
                    onClick={() => {
                      setUrlValue(bookmark.url);
                      setEditingUrl(true);
                      setError(null);
                    }}
                  >
                    Edit URL
                  </button>
                  <a
                    className="site-link"
                    href={bookmark.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open site <span className="ext small muted">↗</span>
                  </a>
                </div>
              </div>
            )}
          </div>

          {duplicateBookmarks.length > 0 && (
            <div className="duplicate-card">
              <div className="duplicate-title">Duplicate warning</div>
              <div className="duplicate-copy">
                {duplicateBookmarks.length === 1
                  ? "There is 1 other saved copy of this page."
                  : `There are ${duplicateBookmarks.length} other saved copies of this page.`}
              </div>
              <div className="duplicate-list small muted">
                {duplicateBookmarks.slice(0, 3).map((item) => (
                  <div key={item.id} className="duplicate-item">
                    {item.title || domainOf(item.url)}
                  </div>
                ))}
                {duplicateBookmarks.length > 3 && (
                  <div className="duplicate-item">
                    +{duplicateBookmarks.length - 3} more
                  </div>
                )}
              </div>
            </div>
          )}

          <label className="field">
            <div className="label">Title</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
            {!title.trim() && (
              <div className="ai-actions">
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => void handleRefresh()}
                  disabled={refreshLoading}
                >
                  {refreshLoading ? "Refreshing…" : "Refresh"}
                </button>
              </div>
            )}
          </label>

          <label className="field">
            <div className="label">Description</div>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            {!description.trim() && (
              <div className="ai-actions">
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => void handleRefresh()}
                  disabled={refreshLoading}
                >
                  {refreshLoading ? "Refreshing…" : "Refresh"}
                </button>
              </div>
            )}
          </label>

          <div className="field">
            <div className="label">Collection</div>
            <CollectionPicker
              flat={flat}
              value={collectionId}
              onChange={setCollectionId}
              onCreateCollection={onCreateCollection}
            />

            {aiStatus && <div className="ai-status small muted">{aiStatus}</div>}

            <div className="ai-actions">
              <button
                type="button"
                className="btn btn-small"
                onClick={() => void runSuggest()}
                disabled={aiLoading}
              >
                {aiLoading ? "Suggesting…" : "Suggest"}
              </button>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  setShowCreateCollection((value) => !value);
                  setNewCollectionName("");
                }}
                disabled={creatingCollection}
              >
                + New collection
              </button>
            </div>

            {showCreateCollection && (
              <div className="create-wrap">
                <div className="autosuggest-container">
                  <input
                    autoFocus
                    style={{ width: "100%", boxSizing: "border-box" }}
                    placeholder="Collection name"
                    value={newCollectionName}
                    onChange={(event) => setNewCollectionName(event.target.value)}
                    onBlur={() => {
                      setTimeout(() => {
                        setCollectionAutosuggestions([]);
                      }, 200);
                    }}
                    onKeyDown={(event) => {
                      if (collectionAutosuggestions.length > 0) {
                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          setActiveCollectionIndex((prev) => (prev + 1) % collectionAutosuggestions.length);
                        } else if (event.key === "ArrowUp") {
                          event.preventDefault();
                          setActiveCollectionIndex((prev) => (prev - 1 + collectionAutosuggestions.length) % collectionAutosuggestions.length);
                        } else if (event.key === "Enter" || event.key === "Tab") {
                          if (activeCollectionIndex >= 0) {
                            event.preventDefault();
                            const selected = collectionAutosuggestions[activeCollectionIndex];
                            setCollectionId(selected.id);
                            setShowCreateCollection(false);
                            setNewCollectionName("");
                            setCollectionAutosuggestions([]);
                          } else if (event.key === "Enter") {
                            event.preventDefault();
                            void createInlineCollection();
                          }
                        } else if (event.key === "Escape") {
                          setCollectionAutosuggestions([]);
                        }
                      } else {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void createInlineCollection();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setShowCreateCollection(false);
                          setNewCollectionName("");
                        }
                      }
                    }}
                  />
                  {collectionAutosuggestions.length > 0 && (
                    <div className="autosuggest-list">
                      {collectionAutosuggestions.map((suggestion, index) => (
                        <button
                          key={suggestion.id}
                          className={`autosuggest-item ${index === activeCollectionIndex ? "active" : ""}`}
                          onClick={() => {
                            setCollectionId(suggestion.id);
                            setShowCreateCollection(false);
                            setNewCollectionName("");
                            setCollectionAutosuggestions([]);
                          }}
                          onMouseEnter={() => setActiveCollectionIndex(index)}
                        >
                          {suggestion.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="ai-actions">
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => void createInlineCollection()}
                    disabled={creatingCollection || !newCollectionName.trim()}
                  >
                    {creatingCollection ? "Creating…" : "Create"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-small btn-ghost"
                    onClick={() => {
                      setShowCreateCollection(false);
                      setNewCollectionName("");
                    }}
                    disabled={creatingCollection}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {showAiSuggestion && aiTargetLabel && (
            <div className="ai-card">
              <div className="ai-title">Suggestion</div>
              <div className="ai-copy">
                <span className="ai-confidence">{capitalize(aiSuggestion.confidence)}</span>
                {": "}
                {aiTargetLabel}
              </div>
              <div className="ai-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => void applyAiSuggestion()}
                  disabled={aiApplying}
                >
                  {aiApplying ? "Applying…" : "Use suggestion"}
                </button>
                <button
                  className="btn"
                  onClick={() => setAiDismissed(true)}
                  disabled={aiApplying}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <label className="field">
            <div className="label">Tags <span className="small muted">(press Enter)</span></div>
            <div className={`tag-editor ${tagSaving ? "busy" : ""}`}>
              {tags.map((tag) => (
                <span key={tag} className="tag-pill">
                  <span>{tag}</span>
                  <button
                    type="button"
                    className="tag-pill-remove"
                    aria-label={`Remove ${tag}`}
                    onClick={() => void removeTag(tag)}
                    disabled={tagSaving}
                  >
                    ×
                  </button>
                </span>
              ))}
              <div className="autosuggest-container tag-autosuggest-container">
                <input
                  className="tag-input"
                  style={{ width: "100%", boxSizing: "border-box" }}
                  value={tagInput}
                  placeholder={tags.length ? "Add tag" : "Add a tag"}
                  onChange={(e) => setTagInput(e.target.value)}
                  onBlur={() => {
                    setTimeout(() => {
                      if (tagInput.trim() && tagAutosuggestions.length === 0) void commitTag(tagInput);
                      setTagAutosuggestions([]);
                    }, 200);
                  }}
                  onKeyDown={(e) => {
                    if (tagAutosuggestions.length > 0) {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setActiveTagIndex((prev) => (prev + 1) % tagAutosuggestions.length);
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setActiveTagIndex((prev) => (prev - 1 + tagAutosuggestions.length) % tagAutosuggestions.length);
                      } else if (e.key === "Enter" || e.key === "Tab") {
                        if (activeTagIndex >= 0) {
                          e.preventDefault();
                          void commitTag(tagAutosuggestions[activeTagIndex]);
                        } else if (e.key === "Enter") {
                          e.preventDefault();
                          void commitTag(tagInput);
                        }
                      } else if (e.key === "Escape") {
                        setTagAutosuggestions([]);
                      }
                    } else {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        void commitTag(tagInput);
                        return;
                      }
                      if (e.key === "Backspace" && !tagInput && tags.length) {
                        e.preventDefault();
                        void removeTag(tags[tags.length - 1]);
                      }
                    }
                  }}
                />
                {tagAutosuggestions.length > 0 && (
                  <div className="autosuggest-list">
                    {tagAutosuggestions.map((suggestion, index) => (
                      <button
                        key={suggestion}
                        className={`autosuggest-item ${index === activeTagIndex ? "active" : ""}`}
                        onClick={() => void commitTag(suggestion)}
                        onMouseEnter={() => setActiveTagIndex(index)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {autoTags.length > 0 && (
              <div className="auto-tags-section">
                <div className="auto-tags-label">Auto-detected — click to keep</div>
                <div className="auto-tags-list">
                  {autoTags.map((tag) => (
                    <span key={tag} className="auto-tag-pill">
                      <button
                        type="button"
                        className="auto-tag-accept"
                        onClick={(e) => { e.preventDefault(); void acceptAutoTag(tag); }}
                        title={`Accept "${tag}"`}
                      >
                        + {tag}
                      </button>
                      <button
                        type="button"
                        className="auto-tag-reject"
                        aria-label={`Reject ${tag}`}
                        onClick={(e) => { e.preventDefault(); void rejectAutoTag(tag); }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {bookmark.tagging_status === "processing" && (
              <div className="auto-tags-processing">Auto-tagging in progress…</div>
            )}

            <div className="ai-actions">
              <button
                type="button"
                className="btn btn-small"
                onClick={(event) => {
                  event.preventDefault();
                  void runTagSuggest();
                }}
                disabled={tagSuggestLoading}
              >
                {tagSuggestLoading ? "Suggesting…" : "Suggest"}
              </button>
            </div>

            {(tagProposals.length > 0 || tagSuggestStatus) && (
              <div className="tag-proposals">
                {tagProposals.map((tag) => (
                  <span key={tag} className="tag-proposal">
                    <button
                      type="button"
                      className="tag-proposal-add"
                      onClick={(event) => {
                        event.preventDefault();
                        void acceptProposal(tag);
                      }}
                      title={`Add "${tag}"`}
                    >
                      + {tag}
                    </button>
                    <button
                      type="button"
                      className="tag-proposal-skip"
                      aria-label={`Skip ${tag}`}
                      onClick={(event) => {
                        event.preventDefault();
                        dismissProposal(tag);
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {tagSuggestStatus && (
                  <span className="tag-proposals-status small muted">
                    {tagSuggestStatus}
                  </span>
                )}
              </div>
            )}
          </label>

          <label className="field">
            <div className="label">Notes</div>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          <div className="field">
            <div className="label">Saved</div>
            <div className="small muted">{formatDate(bookmark.created_at)}</div>
          </div>

          {error && <div className="error small">{error}</div>}
        </div>

        <div className="foot" style={{ display: "flex", flexDirection: "row", flexWrap: "nowrap", alignItems: "center" }}>
          <button
            className="btn btn-ghost danger"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={deleting || saving}
            style={{ flexShrink: 0 }}
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={onClose} disabled={saving} style={{ flexShrink: 0 }}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ flexShrink: 0 }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <style jsx>{`
        .autosuggest-container {
          position: relative;
          display: block;
          width: 100%;
        }
        .tag-autosuggest-container {
          flex: 1 1 0%;
          min-width: 0;
          width: 100%;
        }
        .autosuggest-list {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          z-index: 100;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          max-height: 200px;
          overflow-y: auto;
          margin-top: 2px;
        }
        .autosuggest-item {
          display: block;
          width: 100%;
          text-align: left;
          padding: 6px 10px;
          font-size: 12px;
          border: none;
          background: transparent;
          color: var(--color-text);
          cursor: pointer;
        }
        .autosuggest-item:hover,
        .autosuggest-item.active {
          background: var(--color-bg-hover);
        }
        .backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.28);
          display: flex;
          justify-content: flex-end;
          padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 8px);
          z-index: 50;
        }
        .panel {
          width: 440px;
          max-width: 100%;
          height: 100%;
          background: var(--color-bg);
          border-left: 1px solid var(--color-border);
          display: flex;
          flex-direction: column;
          animation: slideIn 180ms ease;
        }
        @media (max-width: 768px) {
          .backdrop {
            padding: 0;
            background: transparent;
          }
          .panel {
            width: 100%;
            max-width: 100%;
            height: 100dvh;
            margin-top: 0;
            border: 0;
            border-radius: 0;
          }
          .body :global(input),
          .body :global(textarea),
          .body :global(select) {
            font-size: 13px;
            padding: 8px 10px;
          }
          .head {
            padding: calc(env(safe-area-inset-top, 0px) + 8px) 16px 8px;
            height: auto;
            min-height: calc(env(safe-area-inset-top, 0px) + 54px);
            box-sizing: border-box;
          }
        }
        @keyframes slideIn {
          from { transform: translateX(30px); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
        .head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 54px;
          padding: 0 16px;
          gap: 12px;
          border-bottom: 1px solid var(--color-border);
          box-sizing: border-box;
        }
        .title { font-size: 12px; }
        .close {
          width: 32px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: var(--color-bg);
          color: var(--color-text);
          font-size: 18px;
          line-height: 1;
          padding-bottom: 2px;
          flex-shrink: 0;
        }
        .close-glyph {
          display: block;
          line-height: 1;
          transform: translateY(-1px);
        }
        .close:hover { border-color: var(--color-border-strong); }
        .body {
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow-y: auto;
          overflow-x: hidden;
          flex: 1;
        }
        .url-field {
          gap: 6px;
        }
        .url-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-height: 30px;
        }
        .url-domain-wrap {
          display: flex;
          align-items: center;
          gap: 7px;
          min-width: 0;
          flex: 1 1 auto;
        }
        .url-domain {
          font-size: 13px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .url-actions {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
        }
        .url-edit-btn {
          font-size: 12px;
          color: var(--color-text-muted);
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .url-edit-btn:hover {
          color: var(--color-text);
        }
        .url-edit-wrap {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .url-input {
          flex: 1 1 200px;
          min-width: 0;
        }
        .site-link {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: var(--color-text);
          white-space: nowrap;
          margin-left: 4px;
        }
        .site-link:hover { color: var(--color-text-muted); }
        .fav { width: 12px; height: 12px; border-radius: 2px; flex-shrink: 0; }
        .field { display: flex; flex-direction: column; gap: 5px; }
        .label { font-size: 12px; color: var(--color-text-muted); }
        .btn-small {
          height: 26px;
          padding: 0 10px;
          font-size: 12px;
        }
        .ai-card {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 12px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius);
          background: var(--color-bg-secondary);
        }
        .ai-title {
          font-size: 12px;
          color: var(--color-text-muted);
        }
        .ai-status {
          margin-top: 4px;
        }
        .ai-copy {
          font-size: 12px;
          color: var(--color-text);
          line-height: 1.45;
        }
        .ai-confidence {
          font-weight: 600;
        }
        .ai-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .create-wrap {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 8px;
        }
        .create-wrap input {
          width: 100%;
        }
        .duplicate-card {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 10px 12px;
          border: 1px solid #ff8f8f;
          border-radius: var(--radius);
          background: rgba(255, 90, 90, 0.08);
        }
        .duplicate-title {
          font-size: 12px;
          color: #ff8f8f;
          font-weight: 600;
        }
        .duplicate-copy {
          font-size: 12px;
          color: #ff8f8f;
        }
        .duplicate-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
          color: #ffb4b4;
        }
        .duplicate-item {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .tag-proposals {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
          padding: 4px 0 2px;
        }
        .tag-proposal {
          display: inline-flex;
          align-items: stretch;
          border: 1px dashed var(--color-border-strong);
          border-radius: 999px;
          background: var(--color-bg-secondary);
          overflow: hidden;
          line-height: 1;
        }
        .tag-proposal-add {
          padding: 4px 8px;
          font-size: 12px;
          color: var(--color-text);
          line-height: 1;
        }
        .tag-proposal-add:hover {
          background: var(--color-bg-hover);
        }
        .tag-proposal-skip {
          padding: 0 7px;
          font-size: 12px;
          color: var(--color-text-muted);
          border-left: 1px dashed var(--color-border-strong);
        }
        .tag-proposal-skip:hover {
          background: var(--color-bg-hover);
          color: var(--color-text);
        }
        .tag-proposals-status {
          padding: 2px 4px;
        }
        .auto-tags-section {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .auto-tags-label {
          font-size: 11px;
          color: var(--color-text-muted);
        }
        .auto-tags-list {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .auto-tag-pill {
          display: inline-flex;
          align-items: center;
          border-radius: var(--radius-sm);
          border: 1px dashed var(--color-border);
          overflow: hidden;
        }
        .auto-tag-accept {
          background: none;
          border: none;
          cursor: pointer;
          padding: 3px 8px;
          font-size: 13px;
          color: var(--color-text-muted);
          font-family: inherit;
        }
        .auto-tag-accept:hover {
          color: var(--color-text);
          background: var(--color-bg-hover);
        }
        .auto-tag-reject {
          background: none;
          border: none;
          border-left: 1px dashed var(--color-border);
          cursor: pointer;
          padding: 3px 6px;
          font-size: 14px;
          color: var(--color-text-muted);
          font-family: inherit;
          line-height: 1;
        }
        .auto-tag-reject:hover {
          color: var(--color-text);
          background: var(--color-bg-hover);
        }
        .auto-tags-processing {
          font-size: 12px;
          color: var(--color-text-muted);
          font-style: italic;
        }
        .tag-editor {
          min-height: 32px;
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          padding: 6px 8px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-bg);
        }
        .tag-editor.busy {
          opacity: 0.8;
        }
        .tag-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 7px;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: var(--color-bg-secondary);
          color: var(--color-text);
          line-height: 1;
        }
        .tag-pill-remove {
          width: 14px;
          height: 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          color: var(--color-text-muted);
          line-height: 1;
        }
        .tag-pill-remove:hover:not(:disabled) {
          color: var(--color-text);
          background: var(--color-bg-hover);
        }
        .tag-input {
          width: 100%;
          padding: 0;
          border: 0;
          background: transparent;
        }
        .tag-input:focus {
          border: 0;
        }
        .error {
          padding: 8px 10px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-bg-secondary);
        }
        .foot {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          border-top: 1px solid var(--color-border);
          padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
        }
        .spacer { flex: 1; }
        .danger:hover { background: var(--color-bg-hover); }
        @media (max-width: 768px) {
          .foot {
            gap: 6px;
            padding: 8px 10px;
            padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 10px);
          }
          .foot :global(.btn) {
            flex: 0 0 auto;
            height: 34px;
            padding: 0 10px;
            font-size: 12px;
            white-space: nowrap;
          }
        }
      `}</style>
    </div>
  );
}

function normalizeTag(value: string) {
  return value.trim().replace(/^#+/, "").replace(/\s+/g, " ");
}

function capitalize(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : "";
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
