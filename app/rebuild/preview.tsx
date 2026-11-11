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
  Plus,
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
  onTogglePrivacy,
  onEditTags,
  onOpenOwner,
  favorite = false,
  list = false,
  selecting = false,
  selected = false,
  onSelect,
}: {
  card: PreviewCard;
  onOpen: () => void;
  onToggleFavorite?: () => void;
  onTogglePrivacy?: () => void;
  onEditTags?: () => void;
  onOpenOwner?: () => void;
  favorite?: boolean;
  list?: boolean;
  selecting?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const KindIcon = icons[card.kind];
  const externalOwner = card.owner || card.savedFrom;
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
        {externalOwner && <div className="rb-card-owner">{externalOwner.avatar ? <img src={externalOwner.avatar} alt="" /> : <span>{externalOwner.name.slice(0, 1)}</span>}<span>{externalOwner.name}</span></div>}
      </div>
    </>
  );
  return (
    <article
      className={`rb-card rb-card-${card.kind} ${card.tone ? `rb-tone-${card.tone}` : ""} ${list ? "rb-card-list" : ""}`}
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
        {onTogglePrivacy && <button onClick={onTogglePrivacy} aria-label={`${card.isPrivate === false ? "Make private" : "Make public"}: ${card.title}`} title={card.isPrivate === false ? "Public in this preview" : "Private in this preview"}>
          {card.isPrivate === false ? <Unlock size={18} /> : <LockKeyhole size={18} />}
        </button>}
        {onToggleFavorite && <button onClick={onToggleFavorite} aria-label={`${favorite ? "Remove favorite" : "Add favorite"}: ${card.title}`} title={favorite ? "Remove favorite" : "Add favorite"}>
          <Heart size={18} fill={favorite ? "currentColor" : "none"} />
        </button>}
        {onEditTags && <button onClick={onEditTags} aria-label={`Edit tags: ${card.title}`} title="Edit tags"><Tag size={18} /></button>}
        {onOpenOwner && <button onClick={onOpenOwner} aria-label={`View ${externalOwner?.name}'s profile`} title="View account"><UsersRound size={18} /></button>}
        {card.kind === "link" && card.url && <button onClick={onOpen} aria-label={`View ${card.title} in Savers`} title="Details in Savers"><MoreHorizontal size={18} /></button>}
      </div>}
    </article>
  );
}

export default function RebuildPreview({
  seedCollections,
  seedCards,
  publicRelatedCards = [],
}: {
  seedCollections: PreviewCollection[];
  seedCards: PreviewCard[];
  publicRelatedCards?: PreviewCard[];
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
            followedAccountIds?: string[];
            subscriptions?: string[];
            theme?: "light" | "dark";
            smartRules?: Record<string, SmartDefinition>;
          };
          if (Array.isArray(parsed.cards)) setCards(parsed.cards);
          if (Array.isArray(parsed.collections))
            setAllCollections(parsed.collections);
          if (Array.isArray(parsed.favorites)) setFavorites(parsed.favorites);
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
          followedAccountIds,
          subscriptions,
          theme,
          smartRules,
        }),
      );
    } catch {
      /* A full browser storage quota only affects persistence of the preview. */
    }
  }, [cards, allCollections, favorites, followedAccountIds, subscriptions, theme, smartRules, ready]);

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
        setActiveCardId(null);
        setComposer(null);
        setCreateOpen(false);
        setAccountOpen(false);
        setDetailMenuOpen(false);
        setSortOpen(false);
        setSmartEditorId(null);
        setSearchOpen(false);
        setTagEditorId(null);
        setRelatedFeedOpen(false);
        setRelatedCollectionPickerOpen(false);
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
  }, [collectionGroup]);

  const activeCard = cards.find((card) => card.id === activeCardId) || publicRelatedCards.find((card) => card.id === activeCardId) || null;
  const activeCardIsOwn = activeCard ? !activeCard.owner : false;
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
  const discoverCards = publicCards.filter((item) => {
    if (profileId && item.owner?.id !== profileId) return false;
    if (discoverTab === "following" && (!item.owner || !followedAccountIds.includes(item.owner.id))) return false;
    if (discoverSource === "yours" && item.owner) return false;
    if (discoverSource === "others" && !item.owner) return false;
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
    setSearchOpen(false);
    setProfileId(null);
    setRelatedSelecting(false);
    setSelectedRelatedIds([]);
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

  function saveRelatedSelection(collectionId?: string) {
    const others = selectedRelatedCards.filter((item) => item.owner);
    setCards((existing) => {
      const updated = collectionId
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
        <nav className="rb-social-nav" aria-label="Social navigation">
          <button className={destination === "discover" ? "active" : ""} onClick={() => navigate("discover")} aria-label="Discover"><Compass size={21} /><span>Discover</span></button>
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
                <button
                  onClick={() => {
                    setCards(seedCards);
                    setAllCollections(seedCollections);
                    setFavorites([]);
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
            <div className="rb-page-heading">
              <div className="rb-heading-line">
                <h1>{collection ? collection.name : "Library"}</h1>
                {collection && <button className="rb-heading-privacy" onClick={() => toggleCollectionPrivacy(collection.id)} aria-label={`${collection.isPrivate === false ? "Make private" : "Make public"}: ${collection.name}`} title={collection.isPrivate === false ? "Public in this preview" : "Private in this preview"}>{collection.isPrivate === false ? <Unlock size={20} /> : <LockKeyhole size={20} />}</button>}
              </div>
              {collection?.description && <p>{collection.description}</p>}
              {collection?.group === "smart" && <button className="rb-edit-rules" onClick={() => openSmartEditor(collection.id)}>Edit rules</button>}
            </div>
            {!collection && (
              <div className="rb-collection-rail">
                <div className="rb-section-intro">
                  <span>Collections</span>
                  <button onClick={() => navigate("collections")}>View all <ArrowRight size={14} /></button>
                </div>
                <div className="rb-rail-items">
                  {allCollections.filter((item) => !item.parentId && (item.group || "links") === "links").slice(0, 4).map((item) => (
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
            {collection && subcollections.length > 0 && <section className="rb-subfolder-section"><h2>Subfolders</h2><div className="rb-collection-preview-list">{subcollections.map(renderCollectionPreview)}</div></section>}
            <div className="rb-library-toolbar">
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
            {selectedTag && <div className="rb-active-tag"><Tag size={18} /><span>{selectedTag}</span><button onClick={() => setSelectedTag(null)} aria-label={`Clear tag ${selectedTag}`}><X size={18} /></button></div>}
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
            <div className="rb-page-heading rb-collections-heading">
              <h1>{collectionGroup === "tags" ? "Tags" : "Collections"}</h1>
              <span>{collectionGroup === "tags" ? tagCounts.length : allCollections.filter((item) => (item.group || "links") === collectionGroup).length}</span>
            </div>
            <div className="rb-collections-controls">
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
            {activeProfile ? (
              <div className="rb-public-profile">
                <button className="rb-profile-back" onClick={() => setProfileId(null)} aria-label="Back to Discover"><ArrowLeft size={22} /></button>
                <div className="rb-profile-identity">
                  {activeProfile.avatar ? <img src={activeProfile.avatar} alt="" /> : <span>{activeProfile.name.slice(0, 1)}</span>}
                  <div><h1>{activeProfile.name}</h1><span>{publicCards.filter((item) => item.owner?.id === activeProfile.id).length} public cards</span></div>
                </div>
                <button className={followedAccountIds.includes(activeProfile.id) ? "rb-follow-button following" : "rb-follow-button"} onClick={() => toggleFollow(activeProfile.id)}>{followedAccountIds.includes(activeProfile.id) ? "Following" : "Follow"}</button>
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
            <div className="rb-discover-source" role="group" aria-label="Card source">
              {(["all", "yours", "others"] as const).map((source) => <button key={source} className={discoverSource === source ? "active" : ""} onClick={() => setDiscoverSource(source)}>{source === "all" ? "All" : source === "yours" ? "Yours" : "Others"}</button>)}
            </div>
            {discoverCards.length > 0 ? <div className="rb-discover-grid">
              {discoverCards.slice(0, visibleCount).map((item) => <CardTile key={item.id} card={item} favorite={favorites.includes(item.id)} onToggleFavorite={item.owner ? undefined : () => toggleFavorite(item.id)} onTogglePrivacy={item.owner ? undefined : () => togglePrivacy(item.id)} onEditTags={item.owner ? undefined : () => openTagEditor(item)} onOpenOwner={item.owner ? () => { setProfileId(item.owner!.id); window.scrollTo(0, 0); } : undefined} selecting={relatedSelecting} selected={selectedRelatedIds.includes(item.id)} onSelect={() => setSelectedRelatedIds((ids) => ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id])} onOpen={() => setActiveCardId(item.id)} />)}
            </div> : <div className="rb-empty rb-discover-empty"><UsersRound size={28} /><h2>{activeProfile ? "No public cards" : discoverTab === "following" ? "No cards from followed accounts yet" : "No public cards here yet"}</h2>{discoverSource !== "others" && !activeProfile && <button onClick={() => navigate("library")}>Open Library <ArrowRight size={18} /></button>}</div>}
            {discoverCards.length > visibleCount && <button className="rb-load-more" onClick={() => setVisibleCount((count) => count + 48)}>Show more <ArrowRight size={16} /></button>}
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
            {inboxTab === "review" && (unsortedCards.length ? <><div className="rb-discover-grid">{unsortedCards.slice(0, visibleCount).map((item) => <CardTile key={item.id} card={item} onToggleFavorite={() => toggleFavorite(item.id)} onTogglePrivacy={() => togglePrivacy(item.id)} onEditTags={() => openTagEditor(item)} favorite={favorites.includes(item.id)} onOpen={() => setActiveCardId(item.id)} />)}</div>{unsortedCards.length > visibleCount && <button className="rb-load-more" onClick={() => setVisibleCount((count) => count + 48)}>Show more <ArrowRight size={16} /></button>}</> : <div className="rb-empty rb-inbox-empty"><Check size={28} /><h2>Nothing to review</h2></div>)}
          </section>
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
        <div
          key={activeCard.id}
          className="rb-detail"
          data-scroll-fade="y"
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
                  {activeCardIsOwn && <><button
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
                  </button></>}
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
              <div><span>{activeCard.owner ? "By" : "Collection"}</span><strong>{activeCard.owner?.name || allCollections.find((item) => item.id === activeCard.collection)?.name || "Unsorted"}</strong></div>
            </div>
            {activeCard.note && (
              <div className="rb-detail-note">
                <span>Your note</span>
                <p>{activeCard.note}</p>
              </div>
            )}
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
                  <CardTile key={item.id} card={item} onToggleFavorite={item.owner ? undefined : () => toggleFavorite(item.id)} onTogglePrivacy={item.owner ? undefined : () => togglePrivacy(item.id)} onEditTags={item.owner ? undefined : () => openTagEditor(item)} favorite={favorites.includes(item.id)} onOpen={() => { setActiveCardId(item.id); setDetailMenuOpen(false); }} />
                ))}
              </div>
              <button className="rb-related-more" onClick={() => { setRelatedScope("all"); setRelatedSelecting(false); setSelectedRelatedIds([]); setRelatedFeedOpen(true); }}>More related <ArrowRight size={19} /></button>
            </section>
          )}
        </div>
      )}

      {activeCard && relatedFeedOpen && (
        <div className="rb-related-feed" data-scroll-fade="y" role="dialog" aria-modal="true" aria-label="More related cards">
          <div className="rb-related-feed-top">
            <button onClick={() => { setRelatedFeedOpen(false); setRelatedSelecting(false); setSelectedRelatedIds([]); }} aria-label="Back to card"><ArrowLeft size={23} /></button>
            <div className="rb-related-feed-tabs" role="group" aria-label="Related card source">
              {(["all", "yours", "others"] as const).map((scope) => <button key={scope} className={relatedScope === scope ? "active" : ""} onClick={() => setRelatedScope(scope)}>{scope === "all" ? "All" : scope === "yours" ? "Yours" : "Others"}</button>)}
            </div>
            <button className="rb-related-select-toggle" onClick={() => { setRelatedSelecting((value) => !value); setSelectedRelatedIds([]); }}>{relatedSelecting ? "Done" : "Select"}</button>
          </div>
          <div className="rb-related-feed-grid">
            {relatedCards.filter((item) => relatedScope === "all" || (relatedScope === "others" ? !!item.owner : !item.owner)).map((item) => (
              <CardTile key={item.id} card={item} onToggleFavorite={item.owner ? undefined : () => toggleFavorite(item.id)} onTogglePrivacy={item.owner ? undefined : () => togglePrivacy(item.id)} onEditTags={item.owner ? undefined : () => openTagEditor(item)} favorite={favorites.includes(item.id)} selecting={relatedSelecting} selected={selectedRelatedIds.includes(item.id)} onSelect={() => setSelectedRelatedIds((ids) => ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id])} onOpen={() => { setActiveCardId(item.id); setRelatedFeedOpen(false); setDetailMenuOpen(false); }} />
            ))}
          </div>
          {relatedScope === "others" && !relatedCards.some((item) => item.owner) && <p className="rb-related-feed-empty">No public cards from other accounts yet.</p>}
        </div>
      )}

      {relatedSelecting && selectedRelatedIds.length > 0 && (relatedFeedOpen || destination === "discover") && <div className="rb-related-selection-bar">
        <span>{selectedRelatedIds.length} selected</span>
        {selectedRelatedCards.some((item) => item.owner) && <button onClick={() => saveRelatedSelection()}><Plus size={19} /> Save</button>}
        <button onClick={() => { setRelatedCollectionQuery(""); setRelatedCollectionPickerOpen(true); }}><Folder size={19} /> Add to collection</button>
      </div>}
      {relatedCollectionPickerOpen && <div className="rb-related-picker-backdrop" role="dialog" aria-modal="true" aria-label="Choose collection">
            <div className="rb-related-picker">
              <div className="rb-related-picker-head"><input value={relatedCollectionQuery} onChange={(event) => setRelatedCollectionQuery(event.target.value)} placeholder="Find a collection" aria-label="Find a collection" autoFocus /><button onClick={() => setRelatedCollectionPickerOpen(false)} aria-label="Close collection picker"><X size={23} /></button></div>
              <div className="rb-related-picker-list" data-scroll-fade="y">
                {allCollections.filter((item) => item.group !== "smart" && item.name.toLocaleLowerCase().includes(relatedCollectionQuery.toLocaleLowerCase())).map((item) => <button key={item.id} onClick={() => saveRelatedSelection(item.id)}><Folder size={20} /><span>{item.name}{item.isPrivate !== false && <LockKeyhole size={16} aria-label="Private" />}</span><Plus className="rb-picker-plus" size={21} /></button>)}
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

      {composer && (
        <div
          className="rb-composer-overlay"
          data-scroll-fade="y"
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
