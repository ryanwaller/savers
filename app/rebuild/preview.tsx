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
  Compass,
  Copy,
  ExternalLink,
  FileText,
  Folder,
  FolderPlus,
  Grid2X2,
  Heart,
  Image as ImageIcon,
  Inbox,
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
import {
  collections as sampleCollections,
  inboxItems,
  initialCards,
  type CardKind,
  type PreviewCard,
} from "./fixtures";

type Destination = "library" | "collections" | "inbox" | "explore";
type Filter = CardKind | "all";
type Composer = CardKind | "collection" | null;
type PreviewCollection = {
  id: string;
  name: string;
  count: number;
  description: string;
  image: string;
};

const storageKey = "savers.rebuild.preview.v1";
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

export default function RebuildPreview() {
  const [destination, setDestination] = useState<Destination>("library");
  const [cards, setCards] = useState<PreviewCard[]>(initialCards);
  const [allCollections, setAllCollections] = useState<PreviewCollection[]>([
    ...sampleCollections,
  ]);
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
  const [removedInbox, setRemovedInbox] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
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
          };
          if (Array.isArray(parsed.cards)) setCards(parsed.cards);
          if (Array.isArray(parsed.collections))
            setAllCollections(parsed.collections);
          if (Array.isArray(parsed.favorites)) setFavorites(parsed.favorites);
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
        JSON.stringify({ cards, collections: allCollections, favorites }),
      );
    } catch {
      /* A full browser storage quota only affects persistence of the preview. */
    }
  }, [cards, allCollections, favorites, ready]);

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
          description: formNote.trim() || "A place for what matters to you.",
          image: "/rebuild/flowers.svg",
        },
        ...prev,
      ]);
      setSelectedCollection(id);
      setDestination("collections");
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
      const image =
        composer === "image"
          ? await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = reject;
              reader.readAsDataURL(formFile);
            })
          : undefined;
      setCards((prev) => [
        {
          id: `local-${Date.now()}`,
          kind: composer,
          title: formTitle.trim() || formFile.name,
          description: formNote.trim() || undefined,
          source: formFile.name,
          image,
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

  const visibleInbox = inboxItems.filter(
    (item) => !removedInbox.includes(item.title),
  );

  return (
    <div
      className={`rebuild-app ${destination === "explore" ? "rb-dark" : ""}`}
      data-rebuild-root
    >
      <div className="rb-preview-flag">
        <span className="rb-pulse" /> SAVERS REBUILD{" "}
        <span className="rb-flag-divider">/</span> INTERACTIVE PREVIEW{" "}
        <span className="rb-flag-note">
          Sample content · saves stay in this browser
        </span>
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
                  Your preview space
                  <span>Changes live in this browser only</span>
                </div>
                <button
                  onClick={() => {
                    setCards(initialCards);
                    setAllCollections([...sampleCollections]);
                    setFavorites([]);
                    setAccountOpen(false);
                    setToast("Preview reset");
                  }}
                >
                  Reset sample content
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
                onClick={() => setSelectedCollection(null)}
              >
                <ArrowLeft size={17} /> All cards
              </button>
            )}
            <div className="rb-page-heading">
              <span className="rb-eyebrow">YOUR SPACE, YOUR WAY</span>
              <h1>{collection ? collection.name : "Your library"}</h1>
              <p>
                {collection
                  ? collection.description
                  : "Everything worth keeping, all in one beautiful place."}
              </p>
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
            {!collection && (
              <div className="rb-collection-rail">
                <div className="rb-section-intro">
                  <span>COLLECTIONS</span>
                  <button onClick={() => navigate("collections")}>
                    View all <ArrowRight size={14} />
                  </button>
                </div>
                <div className="rb-rail-items">
                  {allCollections.slice(0, 4).map((item) => (
                    <button
                      key={item.id}
                      className="rb-rail-item"
                      onClick={() => setSelectedCollection(item.id)}
                    >
                      <img src={item.image} alt="" />
                      <span>{item.name}</span>
                      <span className="rb-rail-count">
                        {
                          cards.filter((card) => card.collection === item.id)
                            .length
                        }
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
                  {filteredCards.length}{" "}
                  {filteredCards.length === 1 ? "card" : "cards"}
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
                <Search size={28} />
                <h2>Nothing here yet</h2>
                <p>Try a different search or save something new.</p>
                <button onClick={() => openComposer("link")}>
                  Save a link <ArrowRight size={16} />
                </button>
              </div>
            )}
          </>
        )}

        {destination === "collections" && (
          <>
            <div className="rb-page-heading rb-collections-heading">
              <span className="rb-eyebrow">PUT THINGS TOGETHER</span>
              <h1>Collections</h1>
              <p>
                Gather ideas by what they mean to you, not just what they are.
              </p>
            </div>
            <div className="rb-collections-head">
              <span>{allCollections.length} collections</span>
              <button onClick={() => openComposer("collection")}>
                <FolderPlus size={16} /> New collection
              </button>
            </div>
            <div className="rb-collection-grid">
              {allCollections.map((item) => (
                <button
                  key={item.id}
                  className="rb-collection-tile"
                  onClick={() => {
                    setSelectedCollection(item.id);
                    setDestination("library");
                  }}
                >
                  <div className="rb-collection-cover">
                    <img src={item.image} alt="" />
                    <span>
                      <Folder size={18} />
                    </span>
                  </div>
                  <div className="rb-collection-info">
                    <h2>{item.name}</h2>
                    <p>{item.description}</p>
                    <span>
                      {
                        cards.filter((card) => card.collection === item.id)
                          .length
                      }{" "}
                      cards <ArrowUpRight size={15} />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {destination === "inbox" && (
          <>
            <div className="rb-page-heading">
              <span className="rb-eyebrow">A PLACE TO BEGIN</span>
              <h1>Your inbox</h1>
              <p>
                Interesting things can wait here until you decide what to keep.
              </p>
            </div>
            <div className="rb-inbox-tabs">
              <button className="active">
                To review <span>{visibleInbox.length}</span>
              </button>
              <button
                onClick={() =>
                  setToast("More inbox views arrive in a later preview")
                }
              >
                Unsorted
              </button>
              <button
                onClick={() =>
                  setToast("Feed management arrives in a later preview")
                }
              >
                Feeds
              </button>
            </div>
            <div className="rb-inbox-list">
              {visibleInbox.length ? (
                visibleInbox.map((item) => (
                  <div className="rb-inbox-row" key={item.title}>
                    <img src={item.image} alt="" />
                    <div>
                      <span>
                        {item.type} · {item.source}
                      </span>
                      <h2>{item.title}</h2>
                    </div>
                    <button
                      className="rb-inbox-keep"
                      onClick={() => {
                        setCards((prev) => [
                          {
                            id: `inbox-${Date.now()}`,
                            kind: "link",
                            title: item.title,
                            description: `Saved from ${item.source}`,
                            source: item.source,
                            image: item.image,
                            date: "Just now",
                          },
                          ...prev,
                        ]);
                        setRemovedInbox((prev) => [...prev, item.title]);
                        setToast("Added to your preview library");
                      }}
                    >
                      Keep <Check size={15} />
                    </button>
                    <button
                      className="rb-small-icon"
                      aria-label={`Dismiss ${item.title}`}
                      onClick={() =>
                        setRemovedInbox((prev) => [...prev, item.title])
                      }
                    >
                      <X size={17} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="rb-empty">
                  <CheckCircle2 size={31} />
                  <h2>All caught up</h2>
                  <p>Everything in this preview inbox has been reviewed.</p>
                </div>
              )}
            </div>
            <p className="rb-preview-caption">
              This is a sample of the planned feed and unsorted review
              experience.
            </p>
          </>
        )}

        {destination === "explore" && (
          <>
            <div className="rb-explore-top">
              <span className="rb-eyebrow">FOLLOW YOUR CURIOSITY</span>
              <h1>A little further afield</h1>
              <p>
                Related ideas from this sample library. Public discovery is
                planned separately.
              </p>
              <div className="rb-explore-tabs">
                <button className="active">For you</button>
                <button
                  onClick={() =>
                    setToast(
                      "Your own library is the first source for related ideas",
                    )
                  }
                >
                  From your library
                </button>
              </div>
            </div>
            <div className="rb-card-grid rb-explore-grid">
              {[cards[1], cards[0], cards[3], cards[5], cards[6], cards[2]]
                .filter(Boolean)
                .map((card) => (
                  <CardTile
                    key={card.id}
                    card={card}
                    onOpen={() => setActiveCardId(card.id)}
                  />
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
        <button
          className={destination === "inbox" ? "active" : ""}
          onClick={() => navigate("inbox")}
        >
          <Inbox size={21} />
          <span>Inbox</span>
        </button>
        <button
          className={destination === "explore" ? "active" : ""}
          onClick={() => navigate("explore")}
        >
          <Compass size={21} />
          <span>Explore</span>
        </button>
      </nav>
      <div className="rb-create-anchor">
        {createOpen && (
          <div className="rb-create-menu">
            <span>ADD SOMETHING</span>
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
              </div>
            )}
            <div className="rb-detail-meta">
              <div>
                <span>SOURCE</span>
                <strong>{activeCard.source || "Your library"}</strong>
              </div>
              <div>
                <span>COLLECTION</span>
                <strong>
                  {allCollections.find(
                    (item) => item.id === activeCard.collection,
                  )?.name || "Unsorted"}
                </strong>
              </div>
            </div>
            {activeCard.note && (
              <div className="rb-detail-note">
                <span>YOUR NOTE</span>
                <p>{activeCard.note}</p>
              </div>
            )}
            <div className="rb-related">
              <div>
                <Sparkles size={18} />
                <h2>Keep exploring</h2>
              </div>
              <p>More from your library that might feel at home beside this.</p>
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
            <span className="rb-composer-kicker">
              {composer === "collection" ? "MAKE A SPACE" : "KEEP WHAT MATTERS"}
            </span>
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
            <p>
              {composer === "collection"
                ? "Give related ideas a place to meet."
                : "A little context now can help you find it again later."}
            </p>
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
            {composer !== "collection" && (
              <label>
                Collection (optional)
                <select
                  value={formCollection}
                  onChange={(e) => setFormCollection(e.target.value)}
                >
                  <option value="">Unsorted — decide later</option>
                  {allCollections.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {formError && (
              <div className="rb-form-error" role="alert">
                {formError}
              </div>
            )}
            <div className="rb-composer-footer">
              <span>
                <LockKeyhole size={15} /> Only in this preview
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
