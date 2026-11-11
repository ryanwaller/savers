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
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { type CardKind, type PreviewCard } from "./fixtures";

type Destination = "library" | "collections";
type Filter = CardKind | "all";
type Composer = CardKind | "collection" | null;
type PreviewCollection = {
  id: string;
  name: string;
  count: number | null;
  description?: string;
  image?: string;
  parentId?: string;
  group?: "links" | "images" | "smart";
};

const storageKey = "savers.rebuild.preview.v2";
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
  list = false,
}: {
  card: PreviewCard;
  onOpen: () => void;
  list?: boolean;
}) {
  const KindIcon = icons[card.kind];
  return (
    <button
      className={`rb-card rb-card-${card.kind} ${card.tone ? `rb-tone-${card.tone}` : ""} ${list ? "rb-card-list" : ""}`}
      onClick={onOpen}
      aria-label={`Open ${card.title}`}
    >
      {card.image && (
        <div className="rb-card-image">
          <img src={card.image} alt="" />
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
          <span>
            <KindIcon size={14} /> {typeLabels[card.kind]}
          </span>
          <ArrowUpRight size={15} />
        </div>
        <h3>{card.title}</h3>
        {card.description && <p>{card.description}</p>}
        <div className="rb-card-footer">
          <span>{card.source || "Your note"}</span>
          <span>{card.date}</span>
        </div>
      </div>
    </button>
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
  const [sortNewest, setSortNewest] = useState(true);
  const [formUrl, setFormUrl] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formCollection, setFormCollection] = useState("");
  const [formFile, setFormFile] = useState<File | null>(null);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [collectionGroup, setCollectionGroup] = useState<"links" | "images" | "smart">("links");
  const [ready, setReady] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

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
          };
          if (Array.isArray(parsed.cards)) setCards(parsed.cards);
          if (Array.isArray(parsed.collections))
            setAllCollections(parsed.collections);
          if (Array.isArray(parsed.favorites)) setFavorites(parsed.favorites);
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
        }),
      );
    } catch {
      /* A full browser storage quota only affects persistence of the preview. */
    }
  }, [cards, allCollections, favorites, theme, ready]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveCardId(null);
        setComposer(null);
        setCreateOpen(false);
        setAccountOpen(false);
        setDetailMenuOpen(false);
        setSortOpen(false);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setDestination("library");
        setActiveCardId(null);
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const activeCard = cards.find((card) => card.id === activeCardId) || null;
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
      if (selectedCollection && card.collection !== selectedCollection)
        return false;
      if (filter !== "all" && card.kind !== filter) return false;
      if (!query.trim()) return true;
      const text =
        `${card.title} ${card.description || ""} ${card.source || ""} ${card.note || ""}`.toLowerCase();
      return text.includes(query.trim().toLowerCase());
    });
    return sortNewest ? match : [...match].reverse();
  }, [cards, selectedCollection, filter, query, sortNewest]);

  function navigate(next: Destination) {
    setDestination(next);
    setSelectedCollection(null);
    setActiveCardId(null);
    setCreateOpen(false);
    setAccountOpen(false);
    setQuery("");
    setFilter("all");
  }

  function openComposer(kind: Composer) {
    setComposer(kind);
    setCreateOpen(false);
    setFormUrl("");
    setFormTitle("");
    setFormNote("");
    setFormCollection(selectedCollection || "");
    setFormFile(null);
    setFormError("");
  }

  async function saveComposer() {
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

  return (
    <div
      className={`rebuild-app ${theme === "dark" ? "rb-theme-dark" : ""}`}
      data-rebuild-root
    >
      <div className="rb-preview-flag">
        <span className="rb-pulse" /> Preview
        <span className="rb-flag-divider">·</span>
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
          <button
            className="rb-icon-button"
            onClick={() => {
              navigate("library");
              setTimeout(() => searchRef.current?.focus(), 0);
            }}
            aria-label="Search library"
          >
            <Search size={19} />
          </button>
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
              <h1>{collection ? collection.name : "Library"}</h1>
              {collection?.description && <p>{collection.description}</p>}
            </div>
            <div className="rb-search-wrap">
              <Search size={20} />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search anything you’ve saved"
                aria-label="Search saved cards"
              />
              <span className="rb-keycap">⌘ K</span>
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
                      <span className="rb-rail-count">
                        {item.count ?? ""}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="rb-library-toolbar">
              <div className="rb-filter-group">
                {(["all", "link", "image", "note", "file"] as Filter[]).map(
                  (kind) => (
                    <button
                      key={kind}
                      className={filter === kind ? "active" : ""}
                      onClick={() => setFilter(kind)}
                    >
                      {kind === "all" ? "All cards" : `${typeLabels[kind]}s`}
                    </button>
                  ),
                )}
              </div>
              <div className="rb-toolbar-end">
                <span>
                  {seedCards.length === 0 && !query && filter === "all"
                    ? `${collection ? collection.count ?? "—" : 815} saved`
                    : `${filteredCards.length} ${filteredCards.length === 1 ? "card" : "cards"}`}
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
                        Newest first {sortNewest && <Check size={14} />}
                      </button>
                      <button
                        onClick={() => {
                          setSortNewest(false);
                          setSortOpen(false);
                        }}
                      >
                        Oldest first {!sortNewest && <Check size={14} />}
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
            {filteredCards.length ? (
              <div className={`rb-card-grid ${listMode ? "rb-list-grid" : ""}`}>
                {filteredCards.map((card) => (
                  <CardTile
                    key={card.id}
                    card={card}
                    onOpen={() => setActiveCardId(card.id)}
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
              <span>{allCollections.filter((item) => (item.group || "links") === collectionGroup).length} collections</span>
              <button onClick={() => openComposer("collection")}>
                <FolderPlus size={16} /> New collection
              </button>
            </div>
            <div className="rb-collection-grid">
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
                        <h2>{item.name}</h2>
                        <span>
                          {item.count === null ? "" : `${item.count} saved`} <ArrowUpRight size={15} />
                        </span>
                      </div>
                    </button>
                    {allCollections.some(
                      (child) => child.parentId === item.id,
                    ) && (
                      <div className="rb-collection-children">
                        {allCollections
                          .filter((child) => child.parentId === item.id)
                          .map((child) => (
                            <button
                              key={child.id}
                              onClick={() => {
                                setSelectedCollection(child.id);
                                setDestination("library");
                              }}
                            >
                              <Folder size={13} />
                              {child.name}
                              <span className="rb-child-count">{child.count ?? ""}</span>
                              <ArrowRight size={13} />
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </>
        )}

      </main>

      <nav className="rb-dock" aria-label="Main navigation">
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
            <span className="rb-detail-kind">
              {typeLabels[activeCard.kind]} <span>·</span> {activeCard.date}
            </span>
            <h1>{activeCard.title}</h1>
            {activeCard.description && (
              <p className="rb-detail-description">{activeCard.description}</p>
            )}
            {activeCard.image && (
              <img className="rb-detail-image" src={activeCard.image} alt="" />
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
            <div className="rb-related">
              <div>
                <Sparkles size={18} />
                <h2>Related</h2>
              </div>
              <div className="rb-related-grid">
                {cards
                  .filter((item) => item.id !== activeCard.id)
                  .slice(0, 3)
                  .map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveCardId(item.id);
                        setDetailMenuOpen(false);
                      }}
                    >
                      <span>{typeLabels[item.kind]}</span>
                      <strong>{item.title}</strong>
                      <ArrowUpRight size={16} />
                    </button>
                  ))}
              </div>
            </div>
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
                <small>Browser-local preview · under 1.5 MB</small>
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
