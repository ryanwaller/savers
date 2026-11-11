"use client";
/* eslint-disable @next/next/no-img-element -- Fixture SVGs and browser-local upload data URLs are intentionally rendered without an image optimizer. */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  Folder,
  FolderPlus,
  Grid2X2,
  Heart,
  Image as ImageIcon,
  Link2,
  List,
  LockKeyhole,
  Unlock,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Tag,
  Upload,
  UsersRound,
  X,
} from "lucide-react";
import { type CardKind, type PreviewCard } from "./fixtures";

type Destination = "library" | "collections";
type Filter = CardKind | "all" | "tags" | "favorites" | "social" | "substack" | "youtube" | "x";
type Composer = CardKind | "collection" | null;
type PreviewCollection = {
  id: string;
  name: string;
  count: number | null;
  description?: string;
  image?: string;
  parentId?: string;
  group?: "links" | "images" | "smart";
  isPrivate?: boolean;
};
type SmartRule = {
  field: "tags" | "title" | "domain" | "url";
  operator: "contains" | "not_contains";
  value: string;
};
type SmartDefinition = { match: "all" | "any"; rules: SmartRule[] };

function matchesSmart(card: PreviewCard, definition: SmartDefinition): boolean {
  const rules = definition.rules.filter((rule) => rule.value.trim());
  if (!rules.length) return false;
  const checks = rules.map((rule) => {
    const haystack = rule.field === "tags"
      ? card.tags?.join(" ") || ""
      : rule.field === "domain"
        ? card.source || ""
        : rule.field === "url"
          ? card.url || ""
          : card.title;
    const contains = haystack.toLowerCase().includes(rule.value.trim().toLowerCase());
    return rule.operator === "contains" ? contains : !contains;
  });
  return definition.match === "all" ? checks.every(Boolean) : checks.some(Boolean);
}

function relatedScore(card: PreviewCard, candidate: PreviewCard): number {
  if (card.id === candidate.id) return 0;
  let score = 0;
  if (card.collection && card.collection === candidate.collection) score += 3;
  if (card.source && card.source === candidate.source) score += 4;
  const tags = new Set(card.tags?.map((tag) => tag.toLowerCase()) || []);
  for (const tag of candidate.tags || []) if (tags.has(tag.toLowerCase())) score += 5;
  const words = new Set((card.title.toLowerCase().match(/[a-z0-9]+/g) || []).filter((word) => word.length > 3));
  for (const word of (candidate.title.toLowerCase().match(/[a-z0-9]+/g) || [])) {
    if (words.has(word) && word.length > 3) score += 1;
  }
  return score;
}

function socialSource(card: PreviewCard): "substack" | "youtube" | "x" | null {
  if (card.kind !== "link") return null;
  const source = (card.source || "").toLowerCase();
  if (source.endsWith("substack.com")) return "substack";
  if (source === "youtube.com" || source.endsWith(".youtube.com") || source === "youtu.be") return "youtube";
  if (source === "x.com" || source.endsWith(".x.com") || source === "twitter.com" || source.endsWith(".twitter.com")) return "x";
  return null;
}

const storageKey = "savers.rebuild.preview.v3";
const icons = { link: Link2, image: ImageIcon, note: FileText, file: Upload };
const typeLabels: Record<CardKind, string> = {
  link: "Link",
  image: "Image",
  note: "Note",
  file: "File",
};

function CardTile({
  card,
  onOpen,
  onToggleFavorite,
  onTogglePrivacy,
  onEditTags,
  favorite = false,
  list = false,
}: {
  card: PreviewCard;
  onOpen: () => void;
  onToggleFavorite: () => void;
  onTogglePrivacy: () => void;
  onEditTags: () => void;
  favorite?: boolean;
  list?: boolean;
}) {
  const KindIcon = icons[card.kind];
  const content = (
    <>
      {card.image && (
        <div className="rb-card-image">
          <img src={card.image} alt="" loading="lazy" onError={(event) => event.currentTarget.parentElement?.setAttribute("data-failed", "true")} />
        </div>
      )}
      {card.kind === "file" && (
        <div className="rb-file-art">
          <span>PDF</span>
          <FileText size={57} strokeWidth={1.2} />
        </div>
      )}
      <div className="rb-card-content">
        <div className="rb-card-topline">
          <span><KindIcon size={14} /> {typeLabels[card.kind]} {card.isPrivate !== false && <LockKeyhole className="rb-card-lock" size={14} aria-label="Private" />}</span>
        </div>
        <h3>{card.title}</h3>
        {card.description && <p>{card.description}</p>}
        <div className="rb-card-footer">
          <span>{card.source || "Your note"}</span>
          {card.url && <ArrowUpRight size={16} aria-hidden="true" />}
        </div>
      </div>
    </>
  );
  return (
    <article
      className={`rb-card rb-card-${card.kind} ${card.tone ? `rb-tone-${card.tone}` : ""} ${list ? "rb-card-list" : ""}`}
    >
      {card.kind === "link" && card.url ? (
        <a className="rb-card-primary" href={card.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${card.title} in a new tab`}>
          {content}
        </a>
      ) : (
        <button className="rb-card-primary" onClick={onOpen} aria-label={`View ${card.title} in Savers`}>
          {content}
        </button>
      )}
      <div className="rb-card-actions">
        <button onClick={onTogglePrivacy} aria-label={`${card.isPrivate === false ? "Make private" : "Make public"}: ${card.title}`} title={card.isPrivate === false ? "Public in this preview" : "Private in this preview"}>
          {card.isPrivate === false ? <Unlock size={18} /> : <LockKeyhole size={18} />}
        </button>
        <button onClick={onToggleFavorite} aria-label={`${favorite ? "Remove favorite" : "Add favorite"}: ${card.title}`} title={favorite ? "Remove favorite" : "Add favorite"}>
          <Heart size={18} fill={favorite ? "currentColor" : "none"} />
        </button>
        <button onClick={onEditTags} aria-label={`Edit tags: ${card.title}`} title="Edit tags"><Tag size={18} /></button>
        {card.kind === "link" && card.url && <button onClick={onOpen} aria-label={`View ${card.title} in Savers`} title="Details in Savers"><MoreHorizontal size={18} /></button>}
      </div>
    </article>
  );
}

export default function RebuildPreview({
  seedCollections,
  seedCards,
}: {
  seedCollections: PreviewCollection[];
  seedCards: PreviewCard[];
}) {
  const [destination, setDestination] = useState<Destination>("library");
  const [cards, setCards] = useState<PreviewCard[]>(seedCards);
  const [allCollections, setAllCollections] = useState<PreviewCollection[]>(seedCollections);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(
    null,
  );
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [listMode, setListMode] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [composer, setComposer] = useState<Composer>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [detailMenuOpen, setDetailMenuOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [tagBrowserOpen, setTagBrowserOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [tagSearch, setTagSearch] = useState("");
  const [tagEditorId, setTagEditorId] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [collectionView, setCollectionView] = useState<"tree" | "grid">("tree");
  const [expandedCollections, setExpandedCollections] = useState<string[]>(["links-design"]);
  const [sortNewest, setSortNewest] = useState(true);
  const [visibleCount, setVisibleCount] = useState(48);
  const [relatedCanGoBack, setRelatedCanGoBack] = useState(false);
  const [formUrl, setFormUrl] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formTags, setFormTags] = useState("");
  const [formCollection, setFormCollection] = useState("");
  const [formFile, setFormFile] = useState<File | null>(null);
  const [formPrivate, setFormPrivate] = useState(true);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [smartRules, setSmartRules] = useState<Record<string, SmartDefinition>>({});
  const [smartEditorId, setSmartEditorId] = useState<string | null>(null);
  const [smartDraft, setSmartDraft] = useState<SmartDefinition>({
    match: "all",
    rules: [{ field: "tags", operator: "contains", value: "" }],
  });
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [collectionGroup, setCollectionGroup] = useState<"links" | "images" | "smart">("links");
  const [ready, setReady] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const tagBrowserRef = useRef<HTMLElement>(null);
  const relatedTrackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored) as {
            cards?: PreviewCard[];
            collections?: PreviewCollection[];
            favorites?: string[];
            theme?: "light" | "dark";
            smartRules?: Record<string, SmartDefinition>;
          };
          if (Array.isArray(parsed.cards)) setCards(parsed.cards);
          if (Array.isArray(parsed.collections))
            setAllCollections(parsed.collections);
          if (Array.isArray(parsed.favorites)) setFavorites(parsed.favorites);
          if (parsed.smartRules && typeof parsed.smartRules === "object") setSmartRules(parsed.smartRules);
          if (parsed.theme === "light" || parsed.theme === "dark")
            setTheme(parsed.theme);
        }
      } catch {
        /* The fixture preview remains usable if browser storage is unavailable. */
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          cards,
          collections: allCollections,
          favorites,
          theme,
          smartRules,
        }),
      );
    } catch {
      /* A full browser storage quota only affects persistence of the preview. */
    }
  }, [cards, allCollections, favorites, theme, smartRules, ready]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (tagBrowserOpen && window.innerWidth <= 620) {
      window.requestAnimationFrame(() => tagBrowserRef.current?.scrollIntoView({ block: "start" }));
    }
  }, [tagBrowserOpen]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveCardId(null);
        setComposer(null);
        setCreateOpen(false);
        setAccountOpen(false);
        setDetailMenuOpen(false);
        setSortOpen(false);
        setSmartEditorId(null);
        setSearchOpen(false);
        setTagEditorId(null);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setDestination("library");
        setActiveCardId(null);
        setSearchOpen(true);
        window.setTimeout(() => searchRef.current?.focus(), 0);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const activeCard = cards.find((card) => card.id === activeCardId) || null;
  const smartEditorCollection = allCollections.find((item) => item.id === smartEditorId);
  const tagEditorCard = cards.find((item) => item.id === tagEditorId);
  const tagCounts = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const card of cards) {
      const seen = new Set<string>();
      for (const name of (card.tags || []).map((tag) => tag.trim()).filter(Boolean)) {
        const key = name.toLocaleLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const current = counts.get(key);
        counts.set(key, { name: current?.name || name, count: (current?.count || 0) + 1 });
      }
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [cards]);
  const smartPreviewCount = cards.filter((card) => matchesSmart(card, smartDraft)).length;
  const relatedCards = activeCard
    ? cards
        .map((item) => ({ item, score: relatedScore(activeCard, item) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ item }) => item)
        .slice(0, 12)
    : [];
  const collection = allCollections.find(
    (item) => item.id === selectedCollection,
  );
  const parentCollection = collection?.parentId
    ? allCollections.find((item) => item.id === collection.parentId)
    : null;
  const subcollections = allCollections.filter(
    (item) => item.parentId === selectedCollection,
  );
  const filteredCards = useMemo(() => {
    const match = cards.filter((card) => {
      if (selectedCollection) {
        const selected = allCollections.find((item) => item.id === selectedCollection);
        if (selected?.group === "smart") {
          const definition = smartRules[selectedCollection];
          if (!definition || !matchesSmart(card, definition)) return false;
        } else if (card.collection !== selectedCollection) return false;
      }
      if (filter === "social" && !socialSource(card)) return false;
      if (filter === "favorites" && !favorites.includes(card.id)) return false;
      if (["substack", "youtube", "x"].includes(filter) && socialSource(card) !== filter) return false;
      if (["link", "image", "note", "file"].includes(filter) && card.kind !== filter) return false;
      if (selectedTag && !card.tags?.some((tag) => tag.toLocaleLowerCase() === selectedTag.toLocaleLowerCase())) return false;
      if (!query.trim()) return true;
      const text =
        `${card.title} ${card.description || ""} ${card.source || ""} ${card.note || ""} ${card.tags?.join(" ") || ""}`.toLowerCase();
      return text.includes(query.trim().toLowerCase());
    });
    return sortNewest ? match : [...match].reverse();
  }, [cards, allCollections, smartRules, favorites, selectedCollection, filter, selectedTag, query, sortNewest]);

  function openTagEditor(card: PreviewCard) {
    setTagEditorId(card.id);
    setTagDraft(card.tags || []);
    setTagInput("");
  }

  function addDraftTag() {
    const name = tagInput.trim();
    if (!name) return;
    setTagDraft((tags) => tags.some((tag) => tag.toLocaleLowerCase() === name.toLocaleLowerCase()) ? tags : [...tags, name]);
    setTagInput("");
  }

  function applyTags() {
    if (!tagEditorId) return;
    const extra = tagInput.trim();
    const next = extra && !tagDraft.some((tag) => tag.toLocaleLowerCase() === extra.toLocaleLowerCase()) ? [...tagDraft, extra] : tagDraft;
    setCards((items) => items.map((item) => item.id === tagEditorId ? { ...item, tags: next } : item));
    setTagEditorId(null);
    setTagInput("");
    setToast("Tags updated in this preview");
  }

  function displayCount(item: PreviewCollection): number | null {
    const definition = smartRules[item.id];
    return definition && item.group === "smart"
      ? cards.filter((card) => matchesSmart(card, definition)).length
      : item.count;
  }

  function openSmartEditor(id: string) {
    setSmartDraft(smartRules[id] || {
      match: "all",
      rules: [{ field: "tags", operator: "contains", value: "" }],
    });
    setSmartEditorId(id);
  }

  function navigate(next: Destination) {
    setDestination(next);
    setSelectedCollection(null);
    setActiveCardId(null);
    setCreateOpen(false);
    setAccountOpen(false);
    setQuery("");
    setFilter("all");
    setSelectedTag(null);
    setTagBrowserOpen(false);
    window.scrollTo(0, 0);
  }

  function openComposer(kind: Composer) {
    setComposer(kind);
    setCreateOpen(false);
    setFormUrl("");
    setFormTitle("");
    setFormNote("");
    setFormTags("");
    setFormCollection(selectedCollection || "");
    setFormFile(null);
    setFormPrivate(true);
    setFormError("");
  }

  async function saveComposer() {
    const nextTags = [...new Set(formTags.split(",").map((tag) => tag.trim()).filter(Boolean))];
    if (composer === "collection") {
      if (!formTitle.trim()) {
        setFormError("Give your collection a name.");
        return;
      }
      const id = `local-${Date.now()}`;
      setAllCollections((prev) => [
        {
          id,
          name: formTitle.trim(),
          count: 0,
          description: formNote.trim() || undefined,
          parentId: formCollection || undefined,
          group: allCollections.find((item) => item.id === formCollection)?.group || collectionGroup,
          isPrivate: formPrivate,
        },
        ...prev,
      ]);
      setSelectedCollection(id);
      setDestination("library");
      setComposer(null);
      setToast("Collection created in this preview");
      return;
    }
    if (composer === "link") {
      let url: URL;
      try {
        url = new URL(formUrl.trim());
        if (!/^https?:$/.test(url.protocol)) throw new Error("protocol");
      } catch {
        setFormError("Enter a full link beginning with https:// or http://.");
        return;
      }
      const newCard: PreviewCard = {
        id: `local-${Date.now()}`,
        kind: "link",
        title: formTitle.trim() || url.hostname.replace(/^www\./, ""),
        description: formNote.trim() || undefined,
        note: formNote.trim() || undefined,
        source: url.hostname.replace(/^www\./, ""),
        url: url.href,
        collection: formCollection || undefined,
        date: "Just now",
        isPrivate: formPrivate,
        tags: nextTags,
        tone: "cream",
      };
      setCards((prev) => [newCard, ...prev]);
    } else if (composer === "note") {
      if (!formTitle.trim() && !formNote.trim()) {
        setFormError("Write a title or a note first.");
        return;
      }
      setCards((prev) => [
        {
          id: `local-${Date.now()}`,
          kind: "note",
          title: formTitle.trim() || "Untitled note",
          description: formNote.trim(),
          collection: formCollection || undefined,
          date: "Just now",
          isPrivate: formPrivate,
          tags: nextTags,
          tone: "sage",
        },
        ...prev,
      ]);
    } else if (composer === "image" || composer === "file") {
      if (!formFile) {
        setFormError("Choose a file first.");
        return;
      }
      if (formFile.size > 1_500_000) {
        setFormError(
          "For this browser-local preview, choose a file under 1.5 MB.",
        );
        return;
      }
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(formFile);
      });
      setCards((prev) => [
        {
          id: `local-${Date.now()}`,
          kind: composer,
          title: formTitle.trim() || formFile.name,
          description: formNote.trim() || undefined,
          source: formFile.name,
          image: composer === "image" ? fileData : undefined,
          fileData,
          collection: formCollection || undefined,
          date: "Just now",
          isPrivate: formPrivate,
          tags: nextTags,
          tone: "stone",
        },
        ...prev,
      ]);
    } else return;
    setComposer(null);
    setDestination("library");
    setSelectedCollection(null);
    setFilter("all");
    setQuery("");
    setToast("Saved in this browser preview");
  }

  function toggleFavorite(id: string) {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function togglePrivacy(id: string) {
    setCards((items) => items.map((item) => item.id === id ? { ...item, isPrivate: item.isPrivate === false } : item));
    setToast("Visibility updated in this preview");
  }

  function toggleCollectionPrivacy(id: string) {
    setAllCollections((items) => items.map((item) => item.id === id ? { ...item, isPrivate: item.isPrivate === false } : item));
    setToast("Visibility updated in this preview");
  }

  function renderCollectionTree(item: PreviewCollection, depth = 0): React.ReactNode {
    const children = allCollections.filter((child) => child.parentId === item.id);
    const expanded = expandedCollections.includes(item.id);
    return (
      <div key={item.id}>
        <div className="rb-tree-row" style={{ marginLeft: depth * 26 }}>
          {children.length ? (
            <button className="rb-tree-toggle" onClick={() => setExpandedCollections((ids) => expanded ? ids.filter((id) => id !== item.id) : [...ids, item.id])} aria-label={`${expanded ? "Collapse" : "Expand"} ${item.name}`} aria-expanded={expanded}>
              <ChevronRight className={expanded ? "expanded" : ""} size={21} />
            </button>
          ) : <span className="rb-tree-spacer" />}
          <button className="rb-tree-name" onClick={() => { setSelectedCollection(item.id); setDestination("library"); }}>
            <Folder size={22} /> <span>{item.name}</span>{item.isPrivate !== false && <LockKeyhole size={17} aria-label="Private" />}
          </button>
          {item.group === "smart" && <button className="rb-tree-rules" onClick={() => openSmartEditor(item.id)}>Edit rules</button>}
          <span className="rb-tree-count">{displayCount(item) ?? ""}</span>
        </div>
        {expanded && children.map((child) => renderCollectionTree(child, depth + 1))}
      </div>
    );
  }

  return (
    <div
      className={`rebuild-app ${theme === "dark" ? "rb-theme-dark" : ""}`}
      data-rebuild-root
    >
      <div className="rb-preview-flag">
        <span className="rb-pulse" /> Preview
        <span className="rb-flag-note">Saves stay in this browser</span>
      </div>

      <header className="rb-topbar">
        <button
          className="rb-mark"
          onClick={() => navigate("library")}
          aria-label="Savers home"
        >
          <span className="rb-mark-glyph">✳</span>
          <span>savers</span>
        </button>
        <div className="rb-top-actions">
          <div className="rb-account-wrap">
            <button
              className="rb-avatar"
              onClick={() => setAccountOpen(!accountOpen)}
              aria-label="Open preview menu"
              aria-expanded={accountOpen}
            >
              RW
            </button>
            {accountOpen && (
              <div className="rb-account-menu">
                <div className="rb-account-title">
                  Preview
                  <span>Browser-local saves</span>
                </div>
                <div
                  className="rb-theme-picker"
                  role="group"
                  aria-label="Appearance"
                >
                  <button
                    className={theme === "light" ? "active" : ""}
                    onClick={() => setTheme("light")}
                  >
                    Light
                  </button>
                  <button
                    className={theme === "dark" ? "active" : ""}
                    onClick={() => setTheme("dark")}
                  >
                    Dark
                  </button>
                </div>
                <button
                  onClick={() => {
                    setCards(seedCards);
                    setAllCollections(seedCollections);
                    setFavorites([]);
                    setSmartRules({});
                    setAccountOpen(false);
                    setToast("Preview reset");
                  }}
                >
                  Reset preview
                </button>
                <a
                  href="https://savers-production.up.railway.app"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open current Savers <ExternalLink size={14} />
                </a>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="rb-main">
        {destination === "library" && (
          <>
            {collection && (
              <button
                className="rb-back-link"
                onClick={() =>
                  setSelectedCollection(parentCollection?.id || null)
                }
              >
                <ArrowLeft size={17} /> {parentCollection?.name || "All cards"}
              </button>
            )}
            <div className="rb-page-heading">
              <div className="rb-heading-line">
                <h1>{collection ? collection.name : "Library"}</h1>
                {collection && <button className="rb-heading-privacy" onClick={() => toggleCollectionPrivacy(collection.id)} aria-label={`${collection.isPrivate === false ? "Make private" : "Make public"}: ${collection.name}`} title={collection.isPrivate === false ? "Public in this preview" : "Private in this preview"}>{collection.isPrivate === false ? <Unlock size={20} /> : <LockKeyhole size={20} />}</button>}
              </div>
              {collection?.description && <p>{collection.description}</p>}
              {collection?.group === "smart" && <button className="rb-edit-rules" onClick={() => openSmartEditor(collection.id)}>Edit rules</button>}
            </div>
            {(!collection || subcollections.length > 0) && (
              <div className="rb-collection-rail">
                <div className="rb-section-intro">
                  <span>{collection ? "Subfolders" : "Collections"}</span>
                  {!collection && (
                    <button onClick={() => navigate("collections")}>
                      View all <ArrowRight size={14} />
                    </button>
                  )}
                </div>
                <div className="rb-rail-items">
                  {(collection
                    ? subcollections
                    : allCollections
                        .filter((item) => !item.parentId && (item.group || "links") === "links")
                        .slice(0, 4)
                  ).map((item) => (
                    <button
                      key={item.id}
                      className="rb-rail-item"
                      onClick={() => setSelectedCollection(item.id)}
                    >
                      {item.image ? <img src={item.image} alt="" /> : <Folder size={20} />}
                      <span>{item.name}</span>
                      {item.isPrivate !== false && <LockKeyhole className="rb-folder-lock" size={16} aria-label="Private" />}
                      <span className="rb-rail-count">
                        {displayCount(item) ?? ""}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="rb-library-toolbar">
              <div className="rb-filter-group">
                {(["all", "tags", "favorites", "link", "social", "image", "note", "file"] as Filter[]).map(
                  (kind) => (
                    <div className="rb-filter-entry" key={kind}>
                      <button
                        className={kind === "tags" ? (selectedTag || tagBrowserOpen ? "active" : "") : filter === kind || (kind === "social" && ["substack", "youtube", "x"].includes(filter)) ? "active" : ""}
                        onClick={() => kind === "tags" ? setTagBrowserOpen((open) => !open) : setFilter(kind)}
                        aria-expanded={kind === "social" ? ["social", "substack", "youtube", "x"].includes(filter) : kind === "tags" ? tagBrowserOpen : undefined}
                      >
                        {kind === "all" ? <Grid2X2 size={18} /> : kind === "tags" ? <Tag size={18} /> : kind === "favorites" ? <Heart size={18} /> : kind === "social" ? <UsersRound size={18} /> : (() => { const Icon = icons[kind as CardKind]; return <Icon size={18} />; })()}
                        {kind === "all" ? "All" : kind === "tags" ? selectedTag || "Tags" : kind === "favorites" ? "Favorites" : kind === "social" ? "Social" : `${typeLabels[kind as CardKind]}s`}
                        {kind === "social" && <ChevronRight className="rb-filter-chevron" size={18} />}
                      </button>
                      {kind === "social" && ["social", "substack", "youtube", "x"].includes(filter) && (
                        <div className="rb-filter-suboptions">
                          {(["substack", "youtube", "x"] as Filter[]).map((source) => <button key={source} className={filter === source ? "active" : ""} onClick={() => setFilter(source)}>{source === "x" ? "X" : source === "youtube" ? "YouTube" : "Substack"}</button>)}
                        </div>
                      )}
                    </div>
                  ),
                )}
              </div>
              <div className="rb-toolbar-end">
                <span>
                  {seedCards.length === 0 && !query && !selectedTag && filter === "all"
                    ? `${collection ? displayCount(collection) ?? "—" : 815}`
                    : filteredCards.length}
                </span>
                <div className="rb-sort-wrap">
                  <button
                    className="rb-small-icon"
                    onClick={() => setSortOpen(!sortOpen)}
                    aria-label="Sort cards"
                    aria-expanded={sortOpen}
                  >
                    <SlidersHorizontal size={17} />
                  </button>
                  {sortOpen && (
                    <div className="rb-sort-menu">
                      <button
                        onClick={() => {
                          setSortNewest(true);
                          setSortOpen(false);
                        }}
                      >
                        Export order {sortNewest && <Check size={14} />}
                      </button>
                      <button
                        onClick={() => {
                          setSortNewest(false);
                          setSortOpen(false);
                        }}
                      >
                        Reverse order {!sortNewest && <Check size={14} />}
                      </button>
                    </div>
                  )}
                </div>
                <button
                  className={`rb-small-icon ${!listMode ? "selected" : ""}`}
                  onClick={() => setListMode(false)}
                  aria-label="Grid view"
                >
                  <Grid2X2 size={17} />
                </button>
                <button
                  className={`rb-small-icon ${listMode ? "selected" : ""}`}
                  onClick={() => setListMode(true)}
                  aria-label="List view"
                >
                  <List size={18} />
                </button>
              </div>
            </div>
            {tagBrowserOpen && (
              <section className="rb-tag-browser" ref={tagBrowserRef} aria-label="Browse tags">
                <div className="rb-tag-browser-head">
                  <span>Tags</span>
                  <input value={tagSearch} onChange={(event) => setTagSearch(event.target.value)} placeholder="Find a tag" aria-label="Find a tag" />
                  {selectedTag && <button onClick={() => setSelectedTag(null)}>Clear</button>}
                </div>
                <div className="rb-tag-browser-list">
                  {tagCounts.filter((tag) => tag.name.toLocaleLowerCase().includes(tagSearch.trim().toLocaleLowerCase())).map((tag) => (
                    <button key={tag.name.toLocaleLowerCase()} className={selectedTag?.toLocaleLowerCase() === tag.name.toLocaleLowerCase() ? "active" : ""} onClick={() => setSelectedTag(tag.name)}>
                      {tag.name} <span>{tag.count}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {filteredCards.length ? (
              <div className={`rb-card-grid ${listMode ? "rb-list-grid" : ""}`}>
                {filteredCards.slice(0, visibleCount).map((card) => (
                  <CardTile
                    key={card.id}
                    card={card}
                    onOpen={() => setActiveCardId(card.id)}
                    onToggleFavorite={() => toggleFavorite(card.id)}
                    onTogglePrivacy={() => togglePrivacy(card.id)}
                    onEditTags={() => openTagEditor(card)}
                    favorite={favorites.includes(card.id)}
                    list={listMode}
                  />
                ))}
              </div>
            ) : (
              <div className="rb-empty">
                <Folder size={28} />
                <h2>{seedCards.length === 0 && !query ? "Saved items are being imported" : "No matches"}</h2>
                {seedCards.length === 0 && !query && <p>The collection structure is ready for review.</p>}
              </div>
            )}
            {filteredCards.length > visibleCount && (
              <button className="rb-load-more" onClick={() => setVisibleCount((count) => count + 48)}>
                Show more <ArrowRight size={16} />
              </button>
            )}
          </>
        )}

        {destination === "collections" && (
          <>
            <div className="rb-page-heading rb-collections-heading">
              <h1>Collections</h1>
            </div>
            <div className="rb-collection-groups" role="group" aria-label="Collection type">
              {(["links", "images", "smart"] as const).map((group) => (
                <button
                  key={group}
                  className={collectionGroup === group ? "active" : ""}
                  onClick={() => setCollectionGroup(group)}
                >
                  {group === "smart" ? "Smart collections" : group === "links" ? "Links" : "Images"}
                </button>
              ))}
            </div>
            <div className="rb-collections-head">
              <span>{allCollections.filter((item) => (item.group || "links") === collectionGroup).length}</span>
              <div className="rb-collections-actions">
                <div className="rb-collection-view" role="group" aria-label="Collection view">
                  <button className={collectionView === "tree" ? "active" : ""} onClick={() => setCollectionView("tree")}><List size={19} /> Tree</button>
                  <button className={collectionView === "grid" ? "active" : ""} onClick={() => setCollectionView("grid")}><Grid2X2 size={19} /> Grid</button>
                </div>
                <button onClick={() => openComposer("collection")}><FolderPlus size={18} /> New collection</button>
              </div>
            </div>
            {collectionView === "tree" ? (
              <div className="rb-collection-tree">
                {allCollections.filter((item) => !item.parentId && (item.group || "links") === collectionGroup).map((item) => renderCollectionTree(item))}
              </div>
            ) : <div className="rb-collection-grid">
              {allCollections
                .filter((item) => !item.parentId && (item.group || "links") === collectionGroup)
                .map((item) => (
                  <div key={item.id} className="rb-collection-tile">
                    <button
                      className="rb-collection-main"
                      onClick={() => {
                        setSelectedCollection(item.id);
                        setDestination("library");
                      }}
                    >
                      <div className="rb-collection-cover">
                        {item.image ? <img src={item.image} alt="" /> : <Folder size={28} />}
                        <span>
                          <Folder size={18} />
                        </span>
                      </div>
                      <div className="rb-collection-info">
                        <h2>{item.name} {item.isPrivate !== false && <LockKeyhole size={17} aria-label="Private" />}</h2>
                        <span>
                          {displayCount(item) ?? ""} <ArrowUpRight size={15} />
                        </span>
                      </div>
                    </button>
                    {item.group === "smart" && <button className="rb-collection-rule-action" onClick={() => openSmartEditor(item.id)}>Edit rules</button>}
                  </div>
                ))}
            </div>}
          </>
        )}

      </main>

      <nav className={`rb-dock ${searchOpen ? "rb-dock-expanded" : ""}`} aria-label="Main navigation">
        <button
          className={destination === "library" ? "active" : ""}
          onClick={() => navigate("library")}
        >
          <Bookmark
            size={21}
            fill={destination === "library" ? "currentColor" : "none"}
          />
          <span>Library</span>
        </button>
        <button
          className={destination === "collections" ? "active" : ""}
          onClick={() => navigate("collections")}
        >
          <Grid2X2 size={20} />
          <span>Collections</span>
        </button>
        <div className="rb-dock-search">
          <button
            className={query ? "rb-dock-search-trigger has-query" : "rb-dock-search-trigger"}
            onClick={() => {
              if (searchOpen) {
                setSearchOpen(false);
              } else {
                setDestination("library");
                setSearchOpen(true);
                window.setTimeout(() => searchRef.current?.focus(), 0);
              }
            }}
            aria-label={searchOpen ? "Close search" : "Search library"}
            aria-expanded={searchOpen}
          >
            {searchOpen ? <X size={23} /> : <Search size={23} />}
          </button>
          {searchOpen && (
            <input
              ref={searchRef}
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search library"
              aria-label="Search library"
            />
          )}
        </div>
      </nav>
      <div className="rb-create-anchor">
        {createOpen && (
          <div className="rb-create-menu">
            <span>Create</span>
            <button onClick={() => openComposer("link")}>
              <Link2 size={18} /> Save a link <ArrowRight size={15} />
            </button>
            <button onClick={() => openComposer("note")}>
              <FileText size={18} /> Write a note <ArrowRight size={15} />
            </button>
            <button onClick={() => openComposer("image")}>
              <ImageIcon size={18} /> Upload an image <ArrowRight size={15} />
            </button>
            <button onClick={() => openComposer("file")}>
              <Upload size={18} /> Upload a file <ArrowRight size={15} />
            </button>
            <div className="rb-create-separator" />
            <button onClick={() => openComposer("collection")}>
              <FolderPlus size={18} /> New collection <ArrowRight size={15} />
            </button>
          </div>
        )}
        <button
          className={`rb-create-button ${createOpen ? "open" : ""}`}
          onClick={() => setCreateOpen(!createOpen)}
          aria-label={createOpen ? "Close create menu" : "Create something"}
          aria-expanded={createOpen}
        >
          {createOpen ? <X size={27} /> : <Plus size={29} />}
        </button>
      </div>

      {activeCard && (
        <div
          className="rb-detail"
          role="dialog"
          aria-modal="true"
          aria-label={activeCard.title}
        >
          <div className="rb-detail-bar">
            <button
              onClick={() => {
                setActiveCardId(null);
                setDetailMenuOpen(false);
              }}
              aria-label="Back to library"
            >
              <ArrowLeft size={21} />
            </button>
            <div>
              <button onClick={() => togglePrivacy(activeCard.id)} aria-label={activeCard.isPrivate === false ? "Make private" : "Make public"} title={activeCard.isPrivate === false ? "Public in this preview" : "Private in this preview"}>
                {activeCard.isPrivate === false ? <Unlock size={19} /> : <LockKeyhole size={19} />}
              </button>
              <button
                onClick={() => toggleFavorite(activeCard.id)}
                aria-label={
                  favorites.includes(activeCard.id)
                    ? "Remove favorite"
                    : "Add favorite"
                }
              >
                <Heart
                  size={19}
                  fill={
                    favorites.includes(activeCard.id) ? "currentColor" : "none"
                  }
                />
              </button>
              {activeCard.url && (
                <a
                  href={activeCard.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open original source"
                >
                  <ExternalLink size={19} />
                </a>
              )}
              <button
                onClick={() => setDetailMenuOpen(!detailMenuOpen)}
                aria-label="More card actions"
              >
                <MoreHorizontal size={22} />
              </button>
              {detailMenuOpen && (
                <div className="rb-detail-menu">
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(
                        activeCard.url || activeCard.title,
                      );
                      setToast("Copied to clipboard");
                      setDetailMenuOpen(false);
                    }}
                  >
                    <Copy size={16} /> Copy {activeCard.url ? "link" : "text"}
                  </button>
                  <button
                    onClick={() => {
                      setCards((prev) =>
                        prev.filter((item) => item.id !== activeCard.id),
                      );
                      setActiveCardId(null);
                      setToast("Removed from this preview");
                    }}
                  >
                    Remove from preview
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="rb-detail-content">
            <span className="rb-detail-kind">{activeCard.isPrivate === false ? <Unlock size={16} aria-label="Public" /> : <LockKeyhole size={16} aria-label="Private" />}{typeLabels[activeCard.kind]}</span>
            <h1>{activeCard.title}</h1>
            {activeCard.description && (
              <p className="rb-detail-description">{activeCard.description}</p>
            )}
            {activeCard.image && (
              <img className="rb-detail-image" src={activeCard.image} alt="" onError={(event) => event.currentTarget.setAttribute("data-failed", "true")} />
            )}
            {activeCard.kind === "file" && (
              <div className="rb-detail-file">
                <FileText size={48} />
                <span>{activeCard.source}</span>
                {activeCard.fileData && (
                  <a href={activeCard.fileData} download={activeCard.source}>
                    Download file
                  </a>
                )}
              </div>
            )}
            <div className="rb-detail-meta">
              <div>
                <span>Source</span>
                <strong>{activeCard.source || "Your library"}</strong>
              </div>
              <div>
                <span>Collection</span>
                <strong>
                  {allCollections.find(
                    (item) => item.id === activeCard.collection,
                  )?.name || "Unsorted"}
                </strong>
              </div>
            </div>
            {activeCard.note && (
              <div className="rb-detail-note">
                <span>Your note</span>
                <p>{activeCard.note}</p>
              </div>
            )}
            <div className="rb-detail-tags">
              {activeCard.tags?.map((tag) => <button key={tag} onClick={() => { setSelectedTag(tag); setTagBrowserOpen(true); setDestination("library"); setActiveCardId(null); }}>{tag}</button>)}
              <button className="rb-detail-edit-tags" onClick={() => openTagEditor(activeCard)}><Tag size={17} /> Edit tags</button>
            </div>
          </div>
          {relatedCards.length > 0 && (
            <section className="rb-related" aria-label="Related cards">
              <div className="rb-related-heading"><h2>Related</h2></div>
              <div className="rb-related-stage">
                {relatedCanGoBack && <button className="rb-related-arrow rb-related-prev" onClick={() => relatedTrackRef.current?.scrollBy({ left: -relatedTrackRef.current.clientWidth * 0.8, behavior: "smooth" })} aria-label="Previous related cards"><ArrowLeft size={19} /></button>}
                <div className="rb-related-track" ref={relatedTrackRef} onScroll={(event) => setRelatedCanGoBack(event.currentTarget.scrollLeft > 5)}>
                  {relatedCards.map((item) => (
                    <CardTile key={item.id} card={item} onToggleFavorite={() => toggleFavorite(item.id)} onTogglePrivacy={() => togglePrivacy(item.id)} onEditTags={() => openTagEditor(item)} favorite={favorites.includes(item.id)} onOpen={() => {
                      setActiveCardId(item.id);
                      setDetailMenuOpen(false);
                      setRelatedCanGoBack(false);
                      relatedTrackRef.current?.scrollTo({ left: 0 });
                    }} />
                  ))}
                </div>
                <button className="rb-related-arrow rb-related-next" onClick={() => relatedTrackRef.current?.scrollBy({ left: relatedTrackRef.current.clientWidth * 0.8, behavior: "smooth" })} aria-label="Next related cards"><ArrowRight size={19} /></button>
              </div>
            </section>
          )}
        </div>
      )}

      {smartEditorId && (
        <div className="rb-rule-overlay" role="dialog" aria-modal="true" aria-label={`Edit rules for ${smartEditorCollection?.name || "smart collection"}`}>
          <div className="rb-rule-panel">
            <div className="rb-rule-head">
              <div><span>Smart collection</span><h2>{smartEditorCollection?.name}</h2></div>
              <button onClick={() => setSmartEditorId(null)} aria-label="Close rule editor"><X size={21} /></button>
            </div>
            {!smartRules[smartEditorId] && <p className="rb-rule-note">Original rules aren’t in the export. Changes here stay in this preview.</p>}
            <div className="rb-rule-match">
              <span>Match</span>
              <div role="group" aria-label="Rule matching">
                <button className={smartDraft.match === "all" ? "active" : ""} onClick={() => setSmartDraft((draft) => ({ ...draft, match: "all" }))}>All rules</button>
                <button className={smartDraft.match === "any" ? "active" : ""} onClick={() => setSmartDraft((draft) => ({ ...draft, match: "any" }))}>Any rule</button>
              </div>
            </div>
            <div className="rb-rule-list">
              {smartDraft.rules.map((rule, index) => (
                <div className="rb-rule-row" key={index}>
                  <select aria-label={`Rule ${index + 1} field`} value={rule.field} onChange={(event) => setSmartDraft((draft) => ({ ...draft, rules: draft.rules.map((item, row) => row === index ? { ...item, field: event.target.value as SmartRule["field"] } : item) }))}>
                    <option value="tags">Tags</option><option value="title">Title</option><option value="domain">Domain</option><option value="url">URL</option>
                  </select>
                  <select aria-label={`Rule ${index + 1} operator`} value={rule.operator} onChange={(event) => setSmartDraft((draft) => ({ ...draft, rules: draft.rules.map((item, row) => row === index ? { ...item, operator: event.target.value as SmartRule["operator"] } : item) }))}>
                    <option value="contains">Contains</option><option value="not_contains">Does not contain</option>
                  </select>
                  <input aria-label={`Rule ${index + 1} value`} value={rule.value} placeholder="Value" onChange={(event) => setSmartDraft((draft) => ({ ...draft, rules: draft.rules.map((item, row) => row === index ? { ...item, value: event.target.value } : item) }))} />
                  <button className="rb-rule-remove" aria-label={`Remove rule ${index + 1}`} disabled={smartDraft.rules.length === 1} onClick={() => setSmartDraft((draft) => ({ ...draft, rules: draft.rules.filter((_, row) => row !== index) }))}><X size={18} /></button>
                </div>
              ))}
            </div>
            <button className="rb-rule-add" onClick={() => setSmartDraft((draft) => ({ ...draft, rules: [...draft.rules, { field: "tags", operator: "contains", value: "" }] }))}><Plus size={18} /> Add rule</button>
            <div className="rb-rule-footer">
              <span>{smartDraft.rules.some((rule) => rule.value.trim()) ? `${smartPreviewCount} matches` : ""}</span>
              <div><button onClick={() => setSmartEditorId(null)}>Cancel</button><button className="rb-rule-apply" disabled={!smartDraft.rules.some((rule) => rule.value.trim())} onClick={() => { setSmartRules((rules) => ({ ...rules, [smartEditorId]: smartDraft })); setSmartEditorId(null); setToast("Rules updated in this preview"); }}>Apply</button></div>
            </div>
          </div>
        </div>
      )}

      {tagEditorId && tagEditorCard && (
        <div className="rb-rule-overlay" role="dialog" aria-modal="true" aria-label={`Edit tags for ${tagEditorCard.title}`}>
          <div className="rb-tag-editor">
            <div className="rb-rule-head">
              <div><span>Tags</span><h2>{tagEditorCard.title}</h2></div>
              <button onClick={() => setTagEditorId(null)} aria-label="Close tag editor"><X size={21} /></button>
            </div>
            <div className="rb-tag-editor-chips">
              {tagDraft.map((tag) => <button key={tag} onClick={() => setTagDraft((tags) => tags.filter((item) => item !== tag))} aria-label={`Remove tag ${tag}`}>{tag} <X size={16} /></button>)}
            </div>
            <div className="rb-tag-editor-add">
              <input value={tagInput} onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addDraftTag(); } }} placeholder="Add a tag" aria-label="Add a tag" />
              <button onClick={addDraftTag} aria-label="Add tag"><Plus size={20} /></button>
            </div>
            <div className="rb-tag-editor-actions"><button onClick={() => setTagEditorId(null)}>Cancel</button><button onClick={applyTags}>Done</button></div>
          </div>
        </div>
      )}

      {composer && (
        <div
          className="rb-composer-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Create ${composer}`}
        >
          <button
            className="rb-composer-close"
            onClick={() => setComposer(null)}
            aria-label="Close"
          >
            <X size={23} />
          </button>
          <div className="rb-composer">
            <h2>
              {composer === "link"
                ? "Save a link"
                : composer === "note"
                  ? "Write a note"
                  : composer === "collection"
                    ? "New collection"
                    : composer === "image"
                      ? "Upload an image"
                      : "Upload a file"}
            </h2>
            {composer === "link" && (
              <label>
                Link
                <input
                  autoFocus
                  type="url"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://something-worth-keeping.com"
                />
              </label>
            )}
            {(composer === "image" || composer === "file") && (
              <label className="rb-upload-zone">
                <Upload size={24} />
                <span>
                  {formFile
                    ? formFile.name
                    : "Choose a file from your computer"}
                </span>
                <small>Browser-local preview, under 1.5 MB</small>
                <input
                  type="file"
                  accept={composer === "image" ? "image/*" : undefined}
                  onChange={(e) => setFormFile(e.target.files?.[0] || null)}
                />
              </label>
            )}
            <label>
              {composer === "note"
                ? "Title (optional)"
                : composer === "collection"
                  ? "Name"
                  : "Title (optional)"}
              <input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder={
                  composer === "collection"
                    ? "A place for…"
                    : composer === "note"
                      ? "Give this thought a name"
                      : "Add a title"
                }
              />
            </label>
            <label>
              {composer === "collection"
                ? "Description (optional)"
                : "Note (optional)"}
              <textarea
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                placeholder={
                  composer === "collection"
                    ? "What belongs here?"
                    : "Why do you want to keep this?"
                }
                rows={composer === "note" ? 6 : 3}
              />
            </label>
            {composer !== "collection" && (
              <label>
                Tags (optional)
                <input value={formTags} onChange={(event) => setFormTags(event.target.value)} placeholder="Separate tags with commas" />
              </label>
            )}
            {
              <label>
                {composer === "collection"
                  ? "Inside (optional)"
                  : "Collection (optional)"}
                <select
                  value={formCollection}
                  onChange={(e) => setFormCollection(e.target.value)}
                >
                  <option value="">
                    {composer === "collection"
                      ? "Top level"
                      : "Unsorted — decide later"}
                  </option>
                  {allCollections.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.parentId ? "↳ " : ""}
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            }
            {formError && (
              <div className="rb-form-error" role="alert">
                {formError}
              </div>
            )}
            <div className="rb-composer-privacy">
              <span>Visibility</span>
              <button role="switch" aria-checked={formPrivate} onClick={() => setFormPrivate((value) => !value)}>
                {formPrivate ? <LockKeyhole size={19} /> : <Unlock size={19} />}
                {formPrivate ? "Private" : "Public"}
              </button>
            </div>
            <div className="rb-composer-footer">
              <span>
                <LockKeyhole size={15} /> Preview only
              </span>
              <button onClick={saveComposer}>
                {composer === "collection"
                  ? "Create collection"
                  : "Save to library"}{" "}
                <ArrowRight size={17} />
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="rb-toast" role="status">
          <CheckCircle2 size={17} /> {toast}
        </div>
      )}
    </div>
  );
}
