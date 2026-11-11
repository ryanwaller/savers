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
  Compass,
  Copy,
  ExternalLink,
  FileText,
  Folder,
  FolderPlus,
  Grid2X2,
  Heart,
  Image as ImageIcon,
  Inbox as InboxIcon,
  Link2,
  List,
  LockKeyhole,
  Unlock,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Tag,
  Upload,
  UsersRound,
  X,
} from "lucide-react";
import { type CardKind, type PreviewCard } from "./fixtures";

type Destination = "library" | "collections" | "discover" | "inbox";
type Filter = CardKind | "all" | "favorites" | "social" | "substack" | "youtube" | "x";
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
  owner?: { id: string; name: string; avatar?: string };
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
  onEditTags,
  onAddToCollection,
  onDropImage,
  onOpenOwner,
  favorite = false,
  pinned = false,
  list = false,
  selecting = false,
  selected = false,
  onSelect,
}: {
  card: PreviewCard;
  onOpen: () => void;
  onToggleFavorite?: () => void;
  onEditTags?: () => void;
  onAddToCollection?: () => void;
  onDropImage?: (file: File) => void;
  onOpenOwner?: () => void;
  favorite?: boolean;
  pinned?: boolean;
  list?: boolean;
  selecting?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const KindIcon = icons[card.kind];
  const externalOwner = card.owner || card.savedFrom;
  const [dragOver, setDragOver] = useState(false);
  const content = (
    <>
      {card.image && (
        <div className="rb-card-image" key={card.image}>
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
          <span><KindIcon size={14} /> {typeLabels[card.kind]} {pinned && <Pin size={14} aria-label="Pinned" />}{card.linkStatus === "broken" && <span className="rb-broken-marker">Broken</span>}</span>
        </div>
        <h3>{card.title}</h3>
        {card.description && <p className={card.description.length > 125 ? "rb-card-description-long" : ""}>{card.description}</p>}
        <div className="rb-card-footer">
          <span>{card.source || "Your note"}</span>
          {card.url && <ArrowUpRight size={16} aria-hidden="true" />}
        </div>
        {externalOwner && <div className="rb-card-owner">{externalOwner.avatar ? <img src={externalOwner.avatar} alt="" /> : <span>{externalOwner.name.slice(0, 1)}</span>}<span>{externalOwner.name}</span></div>}
      </div>
    </>
  );
  return (
    <article
      className={`rb-card rb-card-${card.kind} ${card.tone ? `rb-tone-${card.tone}` : ""} ${list ? "rb-card-list" : ""} ${dragOver ? "rb-card-drag-over" : ""}`}
      onDragOver={(event) => { if (onDropImage && event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragOver(true); } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false); }}
      onDrop={(event) => { if (!onDropImage) return; event.preventDefault(); setDragOver(false); const file = event.dataTransfer.files[0]; if (file) onDropImage(file); }}
    >
      {selecting ? (
        <button className="rb-card-primary" onClick={onSelect} aria-label={`${selected ? "Deselect" : "Select"} ${card.title}`} aria-pressed={selected}>
          {content}
        </button>
      ) : card.kind === "link" && card.url ? (
        <a className="rb-card-primary" href={card.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${card.title} in a new tab`}>
          {content}
        </a>
      ) : (
        <button className="rb-card-primary" onClick={onOpen} aria-label={`View ${card.title} in Savers`}>
          {content}
        </button>
      )}
      {selecting && <span className={`rb-card-selection ${selected ? "selected" : ""}`} aria-hidden="true">{selected && <Check size={18} />}</span>}
      {!selecting && <div className="rb-card-actions">
        {onToggleFavorite && <button onClick={onToggleFavorite} aria-label={`${favorite ? "Remove favorite" : "Add favorite"}: ${card.title}`} title={favorite ? "Remove favorite" : "Add favorite"}>
          <Heart size={18} fill={favorite ? "currentColor" : "none"} />
        </button>}
        {onEditTags && <button onClick={onEditTags} aria-label={`Edit tags: ${card.title}`} title="Edit tags"><Tag size={18} /></button>}
        {onAddToCollection && <button onClick={onAddToCollection} aria-label={`Add ${card.title} to a collection`} title="Add to collection"><FolderPlus size={18} /></button>}
        {onOpenOwner && <button onClick={onOpenOwner} aria-label={`View ${externalOwner?.name}'s profile`} title="View account"><UsersRound size={18} /></button>}
        {card.kind === "link" && card.url && <button onClick={onOpen} aria-label={`View ${card.title} in Savers`} title="Details in Savers"><MoreHorizontal size={18} /></button>}
      </div>}
      {dragOver && <span className="rb-card-drop-hint">Drop image to replace preview</span>}
    </article>
  );
}

export default function RebuildPreview({
  seedCollections,
  seedCards,
  publicRelatedCards = [],
  initialCardId,
}: {
  seedCollections: PreviewCollection[];
  seedCards: PreviewCard[];
  publicRelatedCards?: PreviewCard[];
  initialCardId?: string;
}) {
  const [destination, setDestination] = useState<Destination>("library");
  const [cards, setCards] = useState<PreviewCard[]>(seedCards);
  const [allCollections, setAllCollections] = useState<PreviewCollection[]>(seedCollections);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(
    null,
  );
  const [activeCardId, setActiveCardId] = useState<string | null>(initialCardId || null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [listMode, setListMode] = useState(false);
  const [cardSize, setCardSize] = useState<"s" | "m" | "l" | "xl">("l");
  const [librarySelecting, setLibrarySelecting] = useState(false);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([]);
  const [collectionPickerCardId, setCollectionPickerCardId] = useState<string | null>(null);
  const [libraryCollectionPickerOpen, setLibraryCollectionPickerOpen] = useState(false);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [bulkRemoveOpen, setBulkRemoveOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editImage, setEditImage] = useState("");
  const [editCollection, setEditCollection] = useState("");
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [composer, setComposer] = useState<Composer>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [detailMenuOpen, setDetailMenuOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [filterHasMore, setFilterHasMore] = useState(false);
  const [tagEditorId, setTagEditorId] = useState<string | null>(null);
  const [tagOrder, setTagOrder] = useState<"popular" | "name">("popular");
  const [tagDraft, setTagDraft] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [sortNewest, setSortNewest] = useState(true);
  const [visibleCount, setVisibleCount] = useState(48);
  const [relatedFeedOpen, setRelatedFeedOpen] = useState(false);
  const [relatedScope, setRelatedScope] = useState<"all" | "yours" | "others">("all");
  const [relatedSelecting, setRelatedSelecting] = useState(false);
  const [selectedRelatedIds, setSelectedRelatedIds] = useState<string[]>([]);
  const [relatedCollectionPickerOpen, setRelatedCollectionPickerOpen] = useState(false);
  const [relatedCollectionQuery, setRelatedCollectionQuery] = useState("");
  const [discoverTab, setDiscoverTab] = useState<"discover" | "following">("discover");
  const [discoverSource, setDiscoverSource] = useState<"all" | "yours" | "others">("all");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileScope, setProfileScope] = useState<"cards" | "collections">("cards");
  const [followingOverlayOpen, setFollowingOverlayOpen] = useState(false);
  const [followedAccountIds, setFollowedAccountIds] = useState<string[]>([]);
  const [inboxTab, setInboxTab] = useState<"activity" | "following" | "subscriptions" | "review">("activity");
  const [subscriptions, setSubscriptions] = useState<string[]>([]);
  const [subscriptionInput, setSubscriptionInput] = useState("");
  const [subscriptionError, setSubscriptionError] = useState("");
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
  const [collectionGroup, setCollectionGroup] = useState<"links" | "images" | "smart" | "tags">("links");
  const [ready, setReady] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored) as {
            cards?: PreviewCard[];
            collections?: PreviewCollection[];
            favorites?: string[];
            pinnedIds?: string[];
            cardSize?: "s" | "m" | "l" | "xl";
            followedAccountIds?: string[];
            subscriptions?: string[];
            theme?: "light" | "dark";
            smartRules?: Record<string, SmartDefinition>;
          };
          if (Array.isArray(parsed.cards)) setCards(parsed.cards);
          if (Array.isArray(parsed.collections))
            setAllCollections(parsed.collections);
          if (Array.isArray(parsed.favorites)) setFavorites(parsed.favorites);
          if (Array.isArray(parsed.pinnedIds)) setPinnedIds(parsed.pinnedIds);
          if (parsed.cardSize && ["s", "m", "l", "xl"].includes(parsed.cardSize)) setCardSize(parsed.cardSize);
          if (Array.isArray(parsed.followedAccountIds)) setFollowedAccountIds(parsed.followedAccountIds);
          if (Array.isArray(parsed.subscriptions)) setSubscriptions(parsed.subscriptions);
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
          pinnedIds,
          cardSize,
          followedAccountIds,
          subscriptions,
          theme,
          smartRules,
        }),
      );
    } catch {
      /* A full browser storage quota only affects persistence of the preview. */
    }
  }, [cards, allCollections, favorites, pinnedIds, cardSize, followedAccountIds, subscriptions, theme, smartRules, ready]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const element = filterRef.current;
    if (!element) return;
    const update = () => setFilterHasMore(element.scrollLeft + element.clientWidth < element.scrollWidth - 3);
    update();
    element.addEventListener("scroll", update);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => { element.removeEventListener("scroll", update); observer.disconnect(); };
  }, [destination, selectedCollection, filter, favorites.length]);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-rebuild-root]");
    if (!root) return;
    const tracked = new Set<HTMLElement>();
    const update = (element: HTMLElement) => {
      const horizontal = element.dataset.scrollFade === "x";
      const start = horizontal ? element.scrollLeft > 2 : element.scrollTop > 2;
      const remaining = horizontal
        ? element.scrollWidth - element.clientWidth - element.scrollLeft
        : element.scrollHeight - element.clientHeight - element.scrollTop;
      element.dataset.fadeStart = String(start);
      element.dataset.fadeEnd = String(remaining > 2);
    };
    const resizeObserver = new ResizeObserver(() => tracked.forEach(update));
    let frame = 0;
    const scan = () => {
      root.querySelectorAll<HTMLElement>("[data-scroll-fade]").forEach((element) => {
        if (!tracked.has(element)) {
          tracked.add(element);
          resizeObserver.observe(element);
        }
        update(element);
      });
      for (const element of tracked) {
        if (!element.isConnected) {
          resizeObserver.unobserve(element);
          tracked.delete(element);
        }
      }
    };
    const mutationObserver = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(scan);
    });
    const onScroll = (event: Event) => {
      const element = event.target;
      if (element instanceof HTMLElement && element.dataset.scrollFade) update(element);
    };
    scan();
    mutationObserver.observe(root, { childList: true, subtree: true });
    root.addEventListener("scroll", onScroll, true);
    return () => {
      cancelAnimationFrame(frame);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      root.removeEventListener("scroll", onScroll, true);
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (initialCardId) {
          const url = new URL(window.location.href);
          url.searchParams.delete("item");
          window.history.replaceState(null, "", url);
        }
        setActiveCardId(null);
        setComposer(null);
        setCreateOpen(false);
        setAccountOpen(false);
        setDetailMenuOpen(false);
        setSortOpen(false);
        setSizeOpen(false);
        setSmartEditorId(null);
        setSearchOpen(false);
        setTagEditorId(null);
        setRelatedFeedOpen(false);
        setRelatedCollectionPickerOpen(false);
        setFollowingOverlayOpen(false);
        setCollectionPickerCardId(null);
        setLibraryCollectionPickerOpen(false);
        setEditingCardId(null);
        setBulkTagOpen(false);
        setBulkRemoveOpen(false);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setDestination((current) => current === "collections" && collectionGroup !== "tags" ? "library" : current);
        setActiveCardId(null);
        setSearchOpen(true);
        window.setTimeout(() => searchRef.current?.focus(), 0);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [collectionGroup, initialCardId]);

  useEffect(() => {
    if (!activeCardId && !composer && !relatedFeedOpen && !tagEditorId && !smartEditorId && !relatedCollectionPickerOpen && !followingOverlayOpen && !collectionPickerCardId && !libraryCollectionPickerOpen && !editingCardId && !bulkTagOpen && !bulkRemoveOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [activeCardId, composer, relatedFeedOpen, tagEditorId, smartEditorId, relatedCollectionPickerOpen, followingOverlayOpen, collectionPickerCardId, libraryCollectionPickerOpen, editingCardId, bulkTagOpen, bulkRemoveOpen]);

  function closeDetail() {
    setActiveCardId(null);
    setDetailMenuOpen(false);
    setRelatedFeedOpen(false);
    if (initialCardId) {
      const url = new URL(window.location.href);
      url.searchParams.delete("item");
      window.history.replaceState(null, "", url);
    }
  }

  function openDetailCollection(id: string) {
    closeDetail();
    setDestination("library");
    setSelectedCollection(id);
    setFilter("all");
    setSelectedTag(null);
    setQuery("");
    setSearchOpen(false);
    window.scrollTo(0, 0);
  }

  const activeCard = cards.find((card) => card.id === activeCardId) || publicRelatedCards.find((card) => card.id === activeCardId) || null;
  const activeCardIsOwn = activeCard ? !activeCard.owner : false;
  const activeCardCollection = activeCard?.collection ? allCollections.find((item) => item.id === activeCard.collection) : null;
  const activeCardDuplicates = activeCard?.url ? cards.filter((card) => card.id !== activeCard.id && card.url?.replace(/\/$/, "") === activeCard.url?.replace(/\/$/, "")) : [];
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
    ? [...cards, ...publicRelatedCards.filter((card) => card.isPrivate === false && !!card.owner)]
        .map((item) => ({ item, score: relatedScore(activeCard, item) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ item }) => item)
        .slice(0, 60)
    : [];
  const publicCards = [...cards.filter((item) => item.isPrivate === false), ...publicRelatedCards.filter((item) => item.isPrivate === false && item.owner)];
  const publicAccounts = [...new Map(publicRelatedCards.filter((item) => item.isPrivate === false && item.owner).map((item) => [item.owner!.id, item.owner!])).values()];
  const activeProfile = publicAccounts.find((account) => account.id === profileId);
  const isOwnProfile = profileId === "self";
  const profileName = isOwnProfile ? "Ryan Waller" : activeProfile?.name || "";
  const profileCards = publicCards.filter((item) => isOwnProfile ? !item.owner : item.owner?.id === profileId);
  const profileCollections = isOwnProfile ? allCollections.filter((item) => !item.parentId && item.isPrivate === false) : [];
  const discoverCards = publicCards.filter((item) => {
    if (isOwnProfile && item.owner) return false;
    if (profileId && !isOwnProfile && item.owner?.id !== profileId) return false;
    if (!profileId && discoverTab === "following" && (!item.owner || !followedAccountIds.includes(item.owner.id))) return false;
    if (!profileId && discoverSource === "yours" && item.owner) return false;
    if (!profileId && discoverSource === "others" && !item.owner) return false;
    const text = `${item.title} ${item.source || ""} ${item.description || ""} ${item.owner?.name || ""}`.toLocaleLowerCase();
    return text.includes(query.trim().toLocaleLowerCase());
  });
  const followingCards = publicCards.filter((item) => item.owner && followedAccountIds.includes(item.owner.id));
  const unsortedCards = cards.filter((item) => !item.collection && `${item.title} ${item.source || ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const selectionPool = relatedFeedOpen ? relatedCards : destination === "discover" ? discoverCards : [];
  const selectedRelatedCards = selectionPool.filter((item) => selectedRelatedIds.includes(item.id));
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
    const ordered = sortNewest ? match : [...match].reverse();
    return [...ordered].sort((a, b) => Number(pinnedIds.includes(b.id)) - Number(pinnedIds.includes(a.id)));
  }, [cards, allCollections, smartRules, favorites, pinnedIds, selectedCollection, filter, selectedTag, query, sortNewest]);

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
    setSearchOpen(false);
    setProfileId(null);
    setFollowingOverlayOpen(false);
    setRelatedSelecting(false);
    setSelectedRelatedIds([]);
    setLibrarySelecting(false);
    setSelectedLibraryIds([]);
    window.scrollTo(0, 0);
  }

  function toggleFollow(id: string) {
    setFollowedAccountIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  }

  function addSubscription() {
    const value = subscriptionInput.trim();
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("invalid protocol");
      const source = url.toString();
      if (subscriptions.includes(source)) {
        setSubscriptionError("This source is already added.");
        return;
      }
      setSubscriptions((items) => [...items, source]);
      setSubscriptionInput("");
      setSubscriptionError("");
      setToast("Source added in this browser preview");
    } catch {
      setSubscriptionError("Enter a site or feed URL.");
    }
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
          group: allCollections.find((item) => item.id === formCollection)?.group || (collectionGroup === "tags" ? "links" : collectionGroup),
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

  function openCardEditor(card: PreviewCard) {
    setEditingCardId(card.id);
    setEditTitle(card.title);
    setEditDescription(card.description || "");
    setEditNote(card.note || "");
    setEditUrl(card.url || "");
    setEditImage(card.image || "");
    setEditCollection(card.collection || "");
    setDetailMenuOpen(false);
  }

  function saveCardEdit() {
    if (!editingCardId || !editTitle.trim()) return;
    let source: string | undefined;
    if (editUrl.trim()) {
      try {
        const link = new URL(editUrl.trim());
        if (!["http:", "https:"].includes(link.protocol)) throw new Error("Unsupported link");
        source = link.hostname.replace(/^www\./, "");
      } catch { setToast("Enter a valid http or https link"); return; }
    }
    if (editImage && !editImage.startsWith("data:")) {
      try {
        const image = new URL(editImage, window.location.href);
        if (!["http:", "https:"].includes(image.protocol)) throw new Error("Unsupported image");
      } catch { setToast("Enter a valid preview image URL"); return; }
    }
    setCards((items) => items.map((item) => item.id === editingCardId ? { ...item, title: editTitle.trim(), description: editDescription.trim(), note: editNote.trim(), url: editUrl.trim(), source: source || item.source, image: editImage, collection: editCollection || undefined } : item));
    setEditingCardId(null);
    setToast("Card updated in this browser preview");
  }

  async function replaceCardImage(file: File) {
    if (file.size > 1_500_000) { setToast("Choose an image under 1.5 MB for browser storage"); return; }
    const reader = new FileReader();
    reader.onload = () => setEditImage(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  function dropCardImage(cardId: string, file: File) {
    if (!file.type.startsWith("image/") || file.size > 1_500_000) { setToast("Drop an image under 1.5 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setCards((items) => items.map((item) => item.id === cardId ? { ...item, image: String(reader.result || "") } : item));
      setToast("Preview image replaced in this browser");
    };
    reader.readAsDataURL(file);
  }

  function retryCardImage(card: PreviewCard) {
    if (!card.image || card.image.startsWith("data:")) { setToast("No remote preview image to retry"); return; }
    const url = new URL(card.image, window.location.href);
    url.searchParams.set("savers_retry", String(Date.now()));
    setCards((items) => items.map((item) => item.id === card.id ? { ...item, image: url.toString() } : item));
    setDetailMenuOpen(false);
    setToast("Retried existing image. A new capture needs the preview service.");
  }

  function chooseCollection(collectionId?: string) {
    if (collectionPickerCardId) {
      const card = [...cards, ...publicRelatedCards].find((item) => item.id === collectionPickerCardId);
      if (card?.owner) {
        setCards((items) => [{ ...card, id: `preview-${crypto.randomUUID()}`, originId: card.id, owner: undefined, savedFrom: card.owner, collection: collectionId, isPrivate: true, date: "Just now" }, ...items]);
      } else {
        setCards((items) => items.map((item) => item.id === collectionPickerCardId ? { ...item, collection: collectionId } : item));
      }
      setCollectionPickerCardId(null);
    } else if (libraryCollectionPickerOpen) {
      setCards((items) => items.map((item) => selectedLibraryIds.includes(item.id) ? { ...item, collection: collectionId } : item));
      setLibraryCollectionPickerOpen(false);
      setLibrarySelecting(false);
      setSelectedLibraryIds([]);
    } else {
      saveRelatedSelection(collectionId, true);
      return;
    }
    setRelatedCollectionQuery("");
    setToast(collectionId ? "Added to collection in this browser preview" : "Moved to Unsorted");
  }

  function applyBulkTags() {
    const tag = bulkTagInput.trim();
    if (!tag) return;
    setCards((items) => items.map((item) => selectedLibraryIds.includes(item.id) && !(item.tags || []).some((value) => value.toLocaleLowerCase() === tag.toLocaleLowerCase()) ? { ...item, tags: [...(item.tags || []), tag] } : item));
    setBulkTagOpen(false);
    setBulkTagInput("");
    setLibrarySelecting(false);
    setSelectedLibraryIds([]);
    setToast("Tags added in this browser preview");
  }

  function removeSelectedCards() {
    setCards((items) => items.filter((item) => !selectedLibraryIds.includes(item.id)));
    setFavorites((ids) => ids.filter((id) => !selectedLibraryIds.includes(id)));
    setPinnedIds((ids) => ids.filter((id) => !selectedLibraryIds.includes(id)));
    setBulkRemoveOpen(false);
    setLibrarySelecting(false);
    setSelectedLibraryIds([]);
    setActiveCardId(null);
    setToast("Removed from this browser preview");
  }

  function saveRelatedSelection(collectionId?: string, moveExisting = false) {
    const others = selectedRelatedCards.filter((item) => item.owner);
    setCards((existing) => {
      const updated = moveExisting
        ? existing.map((item) => selectedRelatedIds.includes(item.id) || (item.originId && selectedRelatedIds.includes(item.originId)) ? { ...item, collection: collectionId } : item)
        : existing;
      const additions = others.filter((item) => !existing.some((saved) => saved.originId === item.id)).map((item) => ({
        ...item,
        id: `preview-${crypto.randomUUID()}`,
        originId: item.id,
        owner: undefined,
        savedFrom: item.owner,
        collection: collectionId,
        isPrivate: true,
        date: "Just now",
      }));
      return [...additions, ...updated];
    });
    setToast(collectionId ? "Added to collection in this preview" : "Saved to your browser preview");
    setSelectedRelatedIds([]);
    setRelatedSelecting(false);
    setRelatedCollectionPickerOpen(false);
  }

  function togglePrivacy(id: string) {
    setCards((items) => items.map((item) => item.id === id ? { ...item, isPrivate: item.isPrivate === false } : item));
    setToast("Visibility updated in this preview");
  }

  function toggleCollectionPrivacy(id: string) {
    setAllCollections((items) => items.map((item) => item.id === id ? { ...item, isPrivate: item.isPrivate === false } : item));
    setToast("Visibility updated in this preview");
  }

  function renderCollectionPreview(item: PreviewCollection): React.ReactNode {
    const descendantIds = new Set([item.id]);
    for (let index = 0; index < allCollections.length; index += 1) {
      for (const child of allCollections) {
        if (child.parentId && descendantIds.has(child.parentId)) descendantIds.add(child.id);
      }
    }
    const previewImages = [item.image, ...cards.filter((card) => card.collection && descendantIds.has(card.collection) && card.image).map((card) => card.image)].filter((image): image is string => !!image).slice(0, 3);
    const ownerName = item.owner?.name || "Ryan Waller";
    return (
      <div className="rb-collection-preview" key={item.id}>
        <button className="rb-collection-preview-main" onClick={() => { setSelectedCollection(item.id); setDestination("library"); window.scrollTo(0, 0); }}>
          <div className="rb-collection-preview-heading">
            <Folder size={23} />
            <h2>{item.name}</h2>
            {item.isPrivate !== false && <LockKeyhole size={18} aria-label="Private" />}
            <span>{displayCount(item) ?? ""}</span>
          </div>
          {item.description && <p>{item.description}</p>}
          <div className="rb-collection-preview-owner">
            {item.owner?.avatar ? <img src={item.owner.avatar} alt="" /> : <span>{item.owner ? ownerName.slice(0, 1) : "RW"}</span>}
            <span>{ownerName}</span>
          </div>
          <div className="rb-collection-preview-art" aria-hidden="true">
            <Folder size={52} />
            {previewImages.map((image, index) => <img key={image + index} src={image} alt="" loading="lazy" style={{ transform: `translate(${index * -10}px, ${index * -7}px) rotate(${index * -3}deg)` }} onError={(event) => event.currentTarget.setAttribute("data-failed", "true")} />)}
          </div>
          </button>
          {item.group === "smart" && <button className="rb-collection-preview-rules" onClick={() => openSmartEditor(item.id)}>Edit rules</button>}
      </div>
    );
  }

  return (
    <div
      className={`rebuild-app ${theme === "dark" ? "rb-theme-dark" : ""} ${librarySelecting && destination === "library" ? "rb-library-selection-active" : ""}`}
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
        <nav className="rb-social-nav" aria-label="Social navigation">
          <button className={destination === "discover" ? "active" : ""} onClick={() => navigate("discover")} aria-label={profileId ? "Back to Discover" : "Discover"}>{profileId ? <ArrowLeft size={21} /> : <Compass size={21} />}<span>Discover</span></button>
          <button className={destination === "inbox" ? "active" : ""} onClick={() => navigate("inbox")} aria-label="Inbox"><InboxIcon size={21} /><span>Inbox</span></button>
        </nav>
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
                <button onClick={() => { setDestination("discover"); setProfileId("self"); setProfileScope("cards"); setAccountOpen(false); setDiscoverSource("all"); setDiscoverTab("discover"); window.scrollTo(0, 0); }}>My profile</button>
                <button
                  onClick={() => {
                    setCards(seedCards);
                    setAllCollections(seedCollections);
                    setFavorites([]);
                    setPinnedIds([]);
                    setCardSize("l");
                    setFollowedAccountIds([]);
                    setSubscriptions([]);
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

      <main className="rb-main" key={`${destination}:${selectedCollection || "root"}`}>
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
            {collection && <div className="rb-page-heading">
              <div className="rb-heading-line">
                <h1>{collection.name}</h1>
                <button className="rb-heading-privacy" onClick={() => toggleCollectionPrivacy(collection.id)} aria-label={`${collection.isPrivate === false ? "Make private" : "Make public"}: ${collection.name}`} title={collection.isPrivate === false ? "Public in this preview" : "Private in this preview"}>{collection.isPrivate === false ? <Unlock size={20} /> : <LockKeyhole size={20} />}</button>
              </div>
              {collection?.description && <p>{collection.description}</p>}
              {collection?.group === "smart" && <button className="rb-edit-rules" onClick={() => openSmartEditor(collection.id)}>Edit rules</button>}
            </div>}
            {collection && subcollections.length > 0 && <section className="rb-subfolder-section"><h2>Subfolders</h2><div className="rb-collection-preview-list">{subcollections.map(renderCollectionPreview)}</div></section>}
            <div className={`rb-library-toolbar ${collection ? "" : "rb-root-controls"}`}>
              <div className={`rb-filter-group ${filterHasMore ? "rb-filter-fade-right" : ""}`} ref={filterRef} data-scroll-fade="x">
                {(["all", "favorites", "link", "social", "image", "note", "file"] as Filter[]).map(
                  (kind) => (
                    <div className="rb-filter-entry" key={kind}>
                      <button
                        className={filter === kind || (kind === "social" && ["substack", "youtube", "x"].includes(filter)) ? "active" : ""}
                        onClick={() => setFilter(kind)}
                        aria-expanded={kind === "social" ? ["social", "substack", "youtube", "x"].includes(filter) : undefined}
                      >
                        {kind === "all" ? <Grid2X2 size={18} /> : kind === "favorites" ? <Heart size={18} /> : kind === "social" ? <UsersRound size={18} /> : (() => { const Icon = icons[kind as CardKind]; return <Icon size={18} />; })()}
                        {kind === "all" ? "All" : kind === "favorites" ? <>Favorites <span className="rb-filter-count">{favorites.length}</span></> : kind === "social" ? "Social" : `${typeLabels[kind as CardKind]}s`}
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
                <div className="rb-size-wrap">
                  <button className={`rb-small-icon rb-size-trigger ${sizeOpen ? "selected" : ""}`} onClick={() => { setSizeOpen((open) => !open); setSortOpen(false); }} aria-label={`Thumbnail size: ${cardSize.toUpperCase()}`} aria-expanded={sizeOpen} title="Thumbnail size">{cardSize.toUpperCase()}</button>
                  {sizeOpen && <div className="rb-size-menu" role="group" aria-label="Thumbnail size">
                    {(["s", "m", "l", "xl"] as const).map((size) => <button key={size} onClick={() => { setCardSize(size); setListMode(false); setSizeOpen(false); }}>{size.toUpperCase()}{cardSize === size && <Check size={17} aria-label="Selected" />}</button>)}
                  </div>}
                </div>
                <div className="rb-sort-wrap">
                  <button
                    className={`rb-small-icon ${sortOpen ? "selected" : ""}`}
                    onClick={() => { setSortOpen(!sortOpen); setSizeOpen(false); }}
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
                <button className={`rb-small-icon ${librarySelecting ? "selected" : ""}`} onClick={() => { setLibrarySelecting((value) => !value); setSelectedLibraryIds([]); }} aria-label={librarySelecting ? "Finish selecting cards" : "Select cards"} title="Select cards"><CheckCircle2 size={19} /></button>
              </div>
            </div>
            {selectedTag && <div className="rb-active-tag"><Tag size={18} /><span>{selectedTag}</span><button onClick={() => setSelectedTag(null)} aria-label={`Clear tag ${selectedTag}`}><X size={18} /></button></div>}
            {filteredCards.length ? (
              <div key={`${cardSize}:${listMode}`} className={`rb-card-grid rb-card-size-${cardSize} ${listMode ? "rb-list-grid" : ""}`}>
                {filteredCards.slice(0, visibleCount).map((card) => (
                  <CardTile
                    key={card.id}
                    card={card}
                    onOpen={() => setActiveCardId(card.id)}
                    onToggleFavorite={() => toggleFavorite(card.id)}
                    onEditTags={() => openTagEditor(card)}
                    onAddToCollection={() => { setRelatedCollectionQuery(""); setCollectionPickerCardId(card.id); }}
                    onDropImage={(file) => dropCardImage(card.id, file)}
                    favorite={favorites.includes(card.id)}
                    pinned={pinnedIds.includes(card.id)}
                    list={listMode}
                    selecting={librarySelecting}
                    selected={selectedLibraryIds.includes(card.id)}
                    onSelect={() => setSelectedLibraryIds((ids) => ids.includes(card.id) ? ids.filter((id) => id !== card.id) : [...ids, card.id])}
                  />
                ))}
              </div>
            ) : (
              <div className="rb-empty">
                <Folder size={28} />
                <h2>{filter === "favorites" && favorites.length === 0 ? "No favorites yet" : seedCards.length === 0 && !query ? "Items are being imported" : "No matches"}</h2>
                {filter === "favorites" && favorites.length === 0 && <p>Use the heart on a card to add one.</p>}
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
            <div className="rb-collections-controls rb-root-controls">
              <div className="rb-collection-groups" role="group" aria-label="Collection type">
                {(["links", "images", "smart", "tags"] as const).map((group) => (
                  <button
                    key={group}
                    className={collectionGroup === group ? "active" : ""}
                    onClick={() => { setCollectionGroup(group); setQuery(""); setSearchOpen(false); }}
                  >
                    {group === "smart" ? "Smart" : group === "tags" ? "Tags" : group === "links" ? "Links" : "Images"}
                  </button>
                ))}
              </div>
              <div className="rb-collections-head">
                <span className="rb-collections-count">{collectionGroup === "tags" ? tagCounts.length : allCollections.filter((item) => (item.group || "links") === collectionGroup).length}</span>
                {collectionGroup === "tags" ? (
                  <button onClick={() => setTagOrder((order) => order === "popular" ? "name" : "popular")}>
                    <SlidersHorizontal size={18} /> {tagOrder === "popular" ? "Most used" : "By name"}
                  </button>
                ) : <button onClick={() => openComposer("collection")}><FolderPlus size={18} /> New collection</button>}
              </div>
            </div>
            {collectionGroup === "tags" ? (
              <div className="rb-tags-page">
                {[...tagCounts]
                  .filter((tag) => tag.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
                  .sort((a, b) => tagOrder === "name" ? a.name.localeCompare(b.name) : b.count - a.count || a.name.localeCompare(b.name))
                  .map((tag) => <button key={tag.name.toLocaleLowerCase()} onClick={() => { setSelectedTag(tag.name); setSelectedCollection(null); setFilter("all"); setDestination("library"); setQuery(""); setSearchOpen(false); window.scrollTo(0, 0); }}>
                    <Tag size={20} /><span>{tag.name}</span><span>{tag.count}</span><ArrowRight size={18} />
                  </button>)}
              </div>
            ) : <div className="rb-collection-preview-list">{allCollections.filter((item) => !item.parentId && (item.group || "links") === collectionGroup).map(renderCollectionPreview)}</div>}
          </>
        )}

        {destination === "discover" && (
          <section className="rb-discover-page">
            {(activeProfile || isOwnProfile) ? (
              <div className={`rb-profile-page ${isOwnProfile ? "rb-profile-page-own" : ""}`}>
                {activeProfile && <div className="rb-profile-toolbar">
                  <button className={followedAccountIds.includes(activeProfile.id) ? "rb-follow-button following" : "rb-follow-button"} onClick={() => toggleFollow(activeProfile.id)}>{followedAccountIds.includes(activeProfile.id) ? "Following" : "Follow"}</button>
                </div>}
                <div className="rb-profile-center">
                  <div className={`rb-profile-identity ${isOwnProfile ? "rb-own-profile" : ""}`}>
                    {activeProfile?.avatar ? <img src={activeProfile.avatar} alt="" /> : <span>{isOwnProfile ? "RW" : profileName.slice(0, 1)}</span>}
                    <h1>{profileName}</h1>
                    <span>{profileCards.length} public {profileCards.length === 1 ? "card" : "cards"}</span>
                  </div>
                  <button className="rb-profile-following" onClick={() => setFollowingOverlayOpen(true)}><UsersRound size={18} /><span>Following</span><span className="rb-profile-following-avatars">{isOwnProfile && publicAccounts.filter((account) => followedAccountIds.includes(account.id)).slice(0, 3).map((account) => account.avatar ? <img key={account.id} src={account.avatar} alt="" /> : <span key={account.id}>{account.name.slice(0, 1)}</span>)}</span><ChevronRight size={18} /></button>
                  <div className="rb-profile-shortcuts">
                    <button className={profileScope === "cards" ? "active" : ""} onClick={() => setProfileScope("cards")}><span className="rb-profile-shortcut-art"><Bookmark size={42} /></span><strong>All cards</strong></button>
                    <button className={profileScope === "collections" ? "active" : ""} onClick={() => setProfileScope("collections")}><span className="rb-profile-shortcut-art"><Folder size={44} /></span><strong>Collections</strong></button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rb-discover-top">
                <div className="rb-discover-tabs" role="group" aria-label="Discover view">
                  <button className={discoverTab === "discover" ? "active" : ""} onClick={() => setDiscoverTab("discover")}>Discover</button>
                  <button className={discoverTab === "following" ? "active" : ""} onClick={() => setDiscoverTab("following")}>Following</button>
                </div>
                <button className="rb-feed-select" onClick={() => { setRelatedSelecting((value) => !value); setSelectedRelatedIds([]); }}>{relatedSelecting ? "Done" : "Select"}</button>
              </div>
            )}
            {!profileId && <div className="rb-discover-source" role="group" aria-label="Card source">
              {(["all", "yours", "others"] as const).map((source) => <button key={source} className={discoverSource === source ? "active" : ""} onClick={() => setDiscoverSource(source)}>{source === "all" ? "All" : source === "yours" ? "Yours" : "Others"}</button>)}
            </div>}
            {profileId && profileScope === "collections" ? (profileCollections.length ? <div className="rb-profile-collections">{profileCollections.map((item) => <button key={item.id} onClick={() => { setDestination("collections"); setSelectedCollection(item.id); setProfileId(null); window.scrollTo(0, 0); }}><Folder size={25} /><span>{item.name}</span><ArrowRight size={20} /></button>)}</div> : <div className="rb-empty rb-discover-empty"><Folder size={28} /><h2>No public collections yet</h2></div>) : discoverCards.length > 0 ? <div className="rb-discover-grid">
              {discoverCards.slice(0, visibleCount).map((item) => <CardTile key={item.id} card={item} favorite={favorites.includes(item.id)} onToggleFavorite={item.owner ? undefined : () => toggleFavorite(item.id)} onEditTags={item.owner ? undefined : () => openTagEditor(item)} onAddToCollection={() => { setRelatedCollectionQuery(""); setCollectionPickerCardId(item.id); }} onOpenOwner={item.owner ? () => { setProfileId(item.owner!.id); window.scrollTo(0, 0); } : undefined} selecting={relatedSelecting} selected={selectedRelatedIds.includes(item.id)} onSelect={() => setSelectedRelatedIds((ids) => ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id])} onOpen={() => setActiveCardId(item.id)} />)}
            </div> : <div className="rb-empty rb-discover-empty"><UsersRound size={28} /><h2>{profileId ? "No public cards" : discoverTab === "following" ? "No cards from followed accounts yet" : "No public cards here yet"}</h2>{discoverSource !== "others" && !profileId && <button onClick={() => navigate("library")}>Open Library <ArrowRight size={18} /></button>}</div>}
            {(!profileId || profileScope === "cards") && discoverCards.length > visibleCount && <button className="rb-load-more" onClick={() => setVisibleCount((count) => count + 48)}>Show more <ArrowRight size={16} /></button>}
          </section>
        )}

        {destination === "inbox" && (
          <section className="rb-inbox-page">
            <div className="rb-page-heading rb-inbox-heading"><h1>Inbox</h1></div>
            <div className="rb-inbox-tabs" role="group" aria-label="Inbox view">
              {(["activity", "following", "subscriptions", "review"] as const).map((tab) => <button key={tab} className={inboxTab === tab ? "active" : ""} onClick={() => setInboxTab(tab)}>{tab === "activity" ? "Activity" : tab === "following" ? "Following" : tab === "subscriptions" ? "Subscriptions" : "Review"}{tab === "review" && <span>{unsortedCards.length}</span>}</button>)}
            </div>
            {inboxTab === "activity" && <div className="rb-empty rb-inbox-empty"><InboxIcon size={28} /><h2>No follower activity yet</h2></div>}
            {inboxTab === "following" && (followingCards.length ? <div className="rb-discover-grid">{followingCards.filter((item) => `${item.title} ${item.owner?.name || ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0, visibleCount).map((item) => <CardTile key={item.id} card={item} onOpenOwner={() => { setDestination("discover"); setProfileId(item.owner!.id); }} onOpen={() => setActiveCardId(item.id)} />)}</div> : <div className="rb-empty rb-inbox-empty"><UsersRound size={28} /><h2>No cards from followed accounts yet</h2><button onClick={() => navigate("discover")}>Open Discover <ArrowRight size={18} /></button></div>)}
            {inboxTab === "subscriptions" && <div className="rb-subscriptions">
              <form onSubmit={(event) => { event.preventDefault(); addSubscription(); }}><input value={subscriptionInput} onChange={(event) => { setSubscriptionInput(event.target.value); setSubscriptionError(""); }} placeholder="Site or feed URL" aria-label="Site or feed URL" /><button type="submit"><Plus size={19} /> Add source</button></form>
              {subscriptionError && <p role="alert">{subscriptionError}</p>}
              {subscriptions.length ? <div className="rb-subscription-list">{subscriptions.map((source) => <div key={source}><Link2 size={19} /><a href={source} target="_blank" rel="noopener noreferrer">{source}</a><button onClick={() => setSubscriptions((items) => items.filter((item) => item !== source))} aria-label={`Remove ${source}`}><X size={19} /></button></div>)}</div> : <div className="rb-empty rb-inbox-empty"><Link2 size={28} /><h2>No sources added yet</h2></div>}
              {subscriptions.length > 0 && <p>Live feed checks will connect with account data.</p>}
            </div>}
            {inboxTab === "review" && (unsortedCards.length ? <><div className="rb-discover-grid">{unsortedCards.slice(0, visibleCount).map((item) => <CardTile key={item.id} card={item} onToggleFavorite={() => toggleFavorite(item.id)} onEditTags={() => openTagEditor(item)} onAddToCollection={() => { setRelatedCollectionQuery(""); setCollectionPickerCardId(item.id); }} favorite={favorites.includes(item.id)} onOpen={() => setActiveCardId(item.id)} />)}</div>{unsortedCards.length > visibleCount && <button className="rb-load-more" onClick={() => setVisibleCount((count) => count + 48)}>Show more <ArrowRight size={16} /></button>}</> : <div className="rb-empty rb-inbox-empty"><Check size={28} /><h2>Nothing to review</h2></div>)}
          </section>
        )}

      </main>

      {librarySelecting && selectedLibraryIds.length > 0 && destination === "library" && <div className="rb-related-selection-bar rb-library-selection-bar">
        <span>{selectedLibraryIds.length} selected</span>
        <button onClick={() => { setRelatedCollectionQuery(""); setLibraryCollectionPickerOpen(true); }}><Folder size={19} /> Move to collection</button>
        <button onClick={() => setBulkTagOpen(true)}><Tag size={19} /> Add tag</button>
        <button onClick={() => setBulkRemoveOpen(true)}><X size={19} /> Remove</button>
        <button onClick={() => { setLibrarySelecting(false); setSelectedLibraryIds([]); }}>Done</button>
      </div>}

      {followingOverlayOpen && <div className="rb-following-backdrop" role="dialog" aria-modal="true" aria-label={`${profileName} following`} onMouseDown={(event) => { if (event.target === event.currentTarget) setFollowingOverlayOpen(false); }}>
        <div className="rb-following-panel">
          <div className="rb-following-head"><h2>Following</h2><button onClick={() => setFollowingOverlayOpen(false)} aria-label="Close following"><X size={23} /></button></div>
          <div className="rb-following-list" data-scroll-fade="y">
            {isOwnProfile && publicAccounts.filter((account) => followedAccountIds.includes(account.id)).length > 0 ? publicAccounts.filter((account) => followedAccountIds.includes(account.id)).map((account) => <div className="rb-following-row" key={account.id}>
              <button className="rb-following-person" onClick={() => { setProfileId(account.id); setProfileScope("cards"); setFollowingOverlayOpen(false); window.scrollTo(0, 0); }}>{account.avatar ? <img src={account.avatar} alt="" /> : <span>{account.name.slice(0, 1)}</span>}<strong>{account.name}</strong></button>
              <button className="rb-following-action" onClick={() => toggleFollow(account.id)}>Following</button>
            </div>) : <p className="rb-following-empty">{isOwnProfile ? "You aren’t following anyone yet. Explore public cards in Discover." : "This account’s following list isn’t available in the preview."}</p>}
          </div>
        </div>
      </div>}

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
          {searchOpen && (
            <input
              ref={searchRef}
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={destination === "collections" && collectionGroup === "tags" ? "Search tags" : destination === "discover" ? "Search Discover" : destination === "inbox" ? "Search Inbox" : "Search library"}
              aria-label={destination === "collections" && collectionGroup === "tags" ? "Search tags" : destination === "discover" ? "Search Discover" : destination === "inbox" ? "Search Inbox" : "Search library"}
            />
          )}
          <button
            className={query ? "rb-dock-search-trigger has-query" : "rb-dock-search-trigger"}
            onClick={() => {
              if (searchOpen) {
                setQuery("");
                setSearchOpen(false);
              } else {
                if (destination === "collections" && collectionGroup !== "tags") setDestination("library");
                setSearchOpen(true);
                window.setTimeout(() => searchRef.current?.focus(), 0);
              }
            }}
            aria-label={searchOpen ? "Clear and close search" : destination === "collections" && collectionGroup === "tags" ? "Search tags" : destination === "discover" ? "Search Discover" : destination === "inbox" ? "Search Inbox" : "Search library"}
            aria-expanded={searchOpen}
          >
            {searchOpen ? <X size={23} /> : <Search size={23} />}
          </button>
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
        <div className={`rb-detail-backdrop ${initialCardId === activeCard.id ? "rb-detail-direct" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) closeDetail(); }}>
        <div
          key={activeCard.id}
          className="rb-detail"
          role="dialog"
          aria-modal="true"
          aria-label={activeCard.title}
        >
          <div className="rb-detail-bar">
            <button
              onClick={closeDetail}
              aria-label="Close item"
            >
              <X size={21} />
            </button>
            <div>
              {activeCardIsOwn && <button onClick={() => togglePrivacy(activeCard.id)} aria-label={activeCard.isPrivate === false ? "Make private" : "Make public"} title={activeCard.isPrivate === false ? "Public in this preview" : "Private in this preview"}>
                {activeCard.isPrivate === false ? <Unlock size={19} /> : <LockKeyhole size={19} />}
              </button>}
              {activeCardIsOwn && <button
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
              </button>}
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
              {activeCardIsOwn && <button
                onClick={() => setDetailMenuOpen(!detailMenuOpen)}
                aria-label="More card actions"
              >
                <MoreHorizontal size={22} />
              </button>}
              {detailMenuOpen && (
                <div className="rb-detail-menu">
                  {activeCardIsOwn && <>
                  <button onClick={() => openCardEditor(activeCard)}><Pencil size={16} /> Edit card</button>
                  <button onClick={() => { setCollectionPickerCardId(activeCard.id); setRelatedCollectionQuery(""); setDetailMenuOpen(false); }}><FolderPlus size={16} /> Add to collection</button>
                  {activeCard.kind === "link" && <button onClick={() => activeCard.image ? retryCardImage(activeCard) : openCardEditor(activeCard)}><RefreshCw size={16} /> {activeCard.image ? "Reload preview" : "Add preview image"}</button>}
                  <button onClick={() => { setPinnedIds((ids) => ids.includes(activeCard.id) ? ids.filter((id) => id !== activeCard.id) : [...ids, activeCard.id]); setDetailMenuOpen(false); }}><Pin size={16} /> {pinnedIds.includes(activeCard.id) ? "Unpin" : "Pin"}</button>
                  {activeCard.url && <button onClick={() => { setCards((items) => items.map((item) => item.id === activeCard.id ? { ...item, linkStatus: item.linkStatus === "broken" ? "working" : "broken" } : item)); setDetailMenuOpen(false); }}><CheckCircle2 size={16} /> {activeCard.linkStatus === "broken" ? "Mark as working" : "Mark as broken"}</button>}
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
                  <button onClick={() => {
                    const link = new URL("/", window.location.origin);
                    link.searchParams.set("item", activeCard.id);
                    void navigator.clipboard?.writeText(link.toString());
                    setToast("Preview link copied. It requires preview access.");
                    setDetailMenuOpen(false);
                  }}><Link2 size={16} /> Copy preview link</button>
                  <button
                    onClick={() => {
                      setSelectedLibraryIds([activeCard.id]);
                      setBulkRemoveOpen(true);
                      setDetailMenuOpen(false);
                    }}
                  >
                    Remove from preview
                  </button></>}
                </div>
              )}
            </div>
          </div>
          <div className="rb-detail-content">
            <span className="rb-detail-kind">{typeLabels[activeCard.kind]}{activeCard.linkStatus === "broken" && <span className="rb-broken-marker">Marked broken</span>}</span>
            <h1>{activeCard.title}</h1>
            {activeCard.description && (
              <p className="rb-detail-description">{activeCard.description}</p>
            )}
            {activeCard.image && (
              <img className="rb-detail-image" key={activeCard.image} src={activeCard.image} alt="" onError={(event) => event.currentTarget.setAttribute("data-failed", "true")} />
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
                {activeCard.url ? <a className="rb-detail-meta-link" href={activeCard.url} target="_blank" rel="noopener noreferrer" aria-label={`Visit ${activeCard.source || "saved link"} in a new tab`}>{activeCard.source || "Visit source"}<ArrowUpRight size={17} aria-hidden="true" /></a> : <strong>{activeCard.source || "Your library"}</strong>}
              </div>
              <div><span>{activeCard.owner ? "By" : "Collection"}</span>{activeCard.owner ? <button className="rb-detail-meta-link" onClick={() => { closeDetail(); setDestination("discover"); setProfileId(activeCard.owner!.id); window.scrollTo(0, 0); }}>{activeCard.owner.name}<ArrowRight size={17} aria-hidden="true" /></button> : activeCardCollection ? <button className="rb-detail-meta-link" onClick={() => openDetailCollection(activeCardCollection.id)}>{activeCardCollection.name}<ArrowRight size={17} aria-hidden="true" /></button> : <strong>Unsorted</strong>}</div>
            </div>
            {activeCard.note && (
              <div className="rb-detail-note">
                <span>Your note</span>
                <p>{activeCard.note}</p>
              </div>
            )}
            {activeCardDuplicates.length > 0 && <div className="rb-detail-duplicates">{activeCardDuplicates.length} other saved {activeCardDuplicates.length === 1 ? "copy" : "copies"} of this link</div>}
            <div className="rb-detail-tags">
              {activeCard.tags?.map((tag) => <button key={tag} onClick={() => { setSelectedTag(tag); setDestination("library"); setActiveCardId(null); window.scrollTo(0, 0); }}>{tag}</button>)}
              {activeCardIsOwn && <button className="rb-detail-edit-tags" onClick={() => openTagEditor(activeCard)}><Tag size={17} /> Edit tags</button>}
            </div>
          </div>
          {relatedCards.length > 0 && (
            <section className="rb-related" aria-label="Related cards">
              <div className="rb-related-heading"><h2>Related</h2></div>
              <div className="rb-related-stack">
                {relatedCards.slice(0, 4).map((item) => (
                  <CardTile key={item.id} card={item} onToggleFavorite={item.owner ? undefined : () => toggleFavorite(item.id)} onEditTags={item.owner ? undefined : () => openTagEditor(item)} onAddToCollection={() => { setRelatedCollectionQuery(""); setCollectionPickerCardId(item.id); }} favorite={favorites.includes(item.id)} onOpen={() => { setActiveCardId(item.id); setDetailMenuOpen(false); }} />
                ))}
              </div>
              <button className="rb-related-more" onClick={() => { setRelatedScope("all"); setRelatedSelecting(false); setSelectedRelatedIds([]); setRelatedFeedOpen(true); }}>More related <ArrowRight size={19} /></button>
            </section>
          )}
        </div>
        </div>
      )}

      {activeCard && relatedFeedOpen && (
        <div className="rb-related-feed-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setRelatedFeedOpen(false); setRelatedSelecting(false); setSelectedRelatedIds([]); } }}>
        <div className="rb-related-feed" role="dialog" aria-modal="true" aria-label="More related cards">
          <div className="rb-related-feed-top">
            <button onClick={() => { setRelatedFeedOpen(false); setRelatedSelecting(false); setSelectedRelatedIds([]); }} aria-label="Close related cards"><X size={23} /></button>
            <div className="rb-related-feed-tabs" role="group" aria-label="Related card source">
              {(["all", "yours", "others"] as const).map((scope) => <button key={scope} className={relatedScope === scope ? "active" : ""} onClick={() => setRelatedScope(scope)}>{scope === "all" ? "All" : scope === "yours" ? "Yours" : "Others"}</button>)}
            </div>
            <button className="rb-related-select-toggle" onClick={() => { setRelatedSelecting((value) => !value); setSelectedRelatedIds([]); }}>{relatedSelecting ? "Done" : "Select"}</button>
          </div>
          <div className="rb-related-feed-grid">
            {relatedCards.filter((item) => relatedScope === "all" || (relatedScope === "others" ? !!item.owner : !item.owner)).map((item) => (
              <CardTile key={item.id} card={item} onToggleFavorite={item.owner ? undefined : () => toggleFavorite(item.id)} onEditTags={item.owner ? undefined : () => openTagEditor(item)} onAddToCollection={() => { setRelatedCollectionQuery(""); setCollectionPickerCardId(item.id); }} favorite={favorites.includes(item.id)} selecting={relatedSelecting} selected={selectedRelatedIds.includes(item.id)} onSelect={() => setSelectedRelatedIds((ids) => ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id])} onOpen={() => { setActiveCardId(item.id); setRelatedFeedOpen(false); setDetailMenuOpen(false); }} />
            ))}
          </div>
          {relatedScope === "others" && !relatedCards.some((item) => item.owner) && <p className="rb-related-feed-empty">No public cards from other accounts yet.</p>}
        </div>
        </div>
      )}

      {relatedSelecting && selectedRelatedIds.length > 0 && (relatedFeedOpen || destination === "discover") && <div className="rb-related-selection-bar">
        <span>{selectedRelatedIds.length} selected</span>
        {selectedRelatedCards.some((item) => item.owner) && <button onClick={() => saveRelatedSelection()}><Plus size={19} /> Save</button>}
        <button onClick={() => { setRelatedCollectionQuery(""); setRelatedCollectionPickerOpen(true); }}><Folder size={19} /> Add to collection</button>
      </div>}
      {(relatedCollectionPickerOpen || collectionPickerCardId || libraryCollectionPickerOpen) && <div className="rb-related-picker-backdrop" role="dialog" aria-modal="true" aria-label="Choose collection" onMouseDown={(event) => { if (event.target === event.currentTarget) { setRelatedCollectionPickerOpen(false); setCollectionPickerCardId(null); setLibraryCollectionPickerOpen(false); } }}>
            <div className="rb-related-picker">
              <div className="rb-related-picker-head"><input value={relatedCollectionQuery} onChange={(event) => setRelatedCollectionQuery(event.target.value)} placeholder="Find a collection" aria-label="Find a collection" autoFocus /><button onClick={() => { setRelatedCollectionPickerOpen(false); setCollectionPickerCardId(null); setLibraryCollectionPickerOpen(false); }} aria-label="Close collection picker"><X size={23} /></button></div>
              <div className="rb-related-picker-list" data-scroll-fade="y">
                <button onClick={() => chooseCollection(undefined)}><Folder size={20} /><span>Unsorted</span><ArrowRight className="rb-picker-plus" size={21} /></button>
                {allCollections.filter((item) => item.group !== "smart" && item.name.toLocaleLowerCase().includes(relatedCollectionQuery.toLocaleLowerCase())).map((item) => <button key={item.id} onClick={() => chooseCollection(item.id)}><Folder size={20} /><span>{item.name}{item.isPrivate !== false && <LockKeyhole size={16} aria-label="Private" />}</span><Plus className="rb-picker-plus" size={21} /></button>)}
              </div>
            </div>
      </div>}

      {smartEditorId && (
        <div className="rb-rule-overlay" role="dialog" aria-modal="true" aria-label={`Edit rules for ${smartEditorCollection?.name || "smart collection"}`}>
          <div className="rb-rule-panel" data-scroll-fade="y">
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
          <div className="rb-tag-editor" data-scroll-fade="y">
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

      {editingCardId && <div className="rb-rule-overlay rb-edit-backdrop" role="dialog" aria-modal="true" aria-label="Edit card" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingCardId(null); }}>
        <div className="rb-edit-panel" data-scroll-fade="y">
          <div className="rb-edit-head"><h2>Edit card</h2><button onClick={() => setEditingCardId(null)} aria-label="Close editor"><X size={22} /></button></div>
          <label>Title<input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} autoFocus /></label>
          <label>Link<input type="url" value={editUrl} onChange={(event) => setEditUrl(event.target.value)} /></label>
          <label>Description<textarea rows={3} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} /></label>
          <label>Note<textarea rows={3} value={editNote} onChange={(event) => setEditNote(event.target.value)} /></label>
          <label>Collection<select value={editCollection} onChange={(event) => setEditCollection(event.target.value)}><option value="">Unsorted</option>{allCollections.filter((item) => item.group !== "smart").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Preview image<input type="url" value={editImage.startsWith("data:") ? "" : editImage} onChange={(event) => setEditImage(event.target.value)} placeholder="Image URL" /></label>
          <label className="rb-edit-upload"><Upload size={18} /> Replace with an image from your computer<input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void replaceCardImage(file); }} /></label>
          {editImage && <img className="rb-edit-image" src={editImage} alt="Selected preview" />}
          <div className="rb-edit-actions"><button onClick={() => setEditingCardId(null)}>Cancel</button><button onClick={saveCardEdit} disabled={!editTitle.trim()}>Save changes</button></div>
        </div>
      </div>}

      {bulkTagOpen && <div className="rb-rule-overlay rb-bulk-dialog" role="dialog" aria-modal="true" aria-label="Add tag to selected cards"><div className="rb-bulk-panel"><h2>Add a tag to {selectedLibraryIds.length} {selectedLibraryIds.length === 1 ? "card" : "cards"}</h2><input value={bulkTagInput} onChange={(event) => setBulkTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applyBulkTags(); }} placeholder="Tag name" autoFocus /><div><button onClick={() => setBulkTagOpen(false)}>Cancel</button><button onClick={applyBulkTags} disabled={!bulkTagInput.trim()}>Add tag</button></div></div></div>}
      {bulkRemoveOpen && <div className="rb-rule-overlay rb-bulk-dialog" role="dialog" aria-modal="true" aria-label="Confirm removal"><div className="rb-bulk-panel"><h2>Remove {selectedLibraryIds.length} {selectedLibraryIds.length === 1 ? "card" : "cards"}?</h2><p>This removes them from this browser preview.</p><div><button onClick={() => setBulkRemoveOpen(false)}>Cancel</button><button className="rb-bulk-danger" onClick={removeSelectedCards}>Remove</button></div></div></div>}

      {composer && (
        <div
          className="rb-composer-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Create ${composer}`}
          onMouseDown={(event) => { if (event.target === event.currentTarget) setComposer(null); }}
        >
          <div className="rb-composer">
            <div className="rb-composer-header"><h2>
              {composer === "link"
                ? "Save a link"
                : composer === "note"
                  ? "Write a note"
                  : composer === "collection"
                    ? "New collection"
                    : composer === "image"
                      ? "Upload an image"
                      : "Upload a file"}
            </h2><button className="rb-composer-close" onClick={() => setComposer(null)} aria-label="Close"><X size={23} /></button></div>
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
