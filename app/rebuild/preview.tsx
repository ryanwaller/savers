"use client";
/* eslint-disable @next/next/no-img-element -- Fixture SVGs and browser-local upload data URLs are intentionally rendered without an image optimizer. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronDown,
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
  Trash2,
  Upload,
  UsersRound,
  X,
} from "lucide-react";
import { type CardKind, type PreviewCard } from "./fixtures";
import type { Bookmark as SavedBookmark, Collection, ImageCollection } from "@/lib/types";
import { liveCard, liveCollection, liveImage, liveImageCollection, type LiveSavedImage } from "./live-data";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type Destination = "library" | "collections" | "discover" | "inbox";
type Filter = CardKind | "all" | "favorites" | "social" | "substack" | "youtube" | "x";
type Composer = CardKind | "collection" | null;
type IncomingFile = { file: File; path: string };
type BrowserCapture = { kind: "link" | "image" | "note"; url?: string; sourceUrl?: string; imageUrl?: string; text?: string; title?: string };
type PreviewCollection = {
  id: string;
  name: string;
  count: number | null;
  description?: string;
  image?: string;
  parentId?: string;
  group?: "links" | "images" | "smart";
  isPrivate?: boolean;
  publicId?: string;
  publicSlug?: string;
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
const previewDatabase = "savers-rebuild-preview";
const previewCardsChannel = "savers-rebuild-preview-cards";
const macCaptureTokenKey = "savers.rebuild.macCaptureToken";

function announcePreviewCardsChanged() {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(previewCardsChannel);
  channel.postMessage({ type: "cards-changed" });
  channel.close();
}

function openPreviewDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(previewDatabase, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readPreviewCards(): Promise<PreviewCard[] | null> {
  const database = await openPreviewDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("state", "readonly");
    const request = transaction.objectStore("state").get("cards");
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result as PreviewCard[] : null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

async function writePreviewCards(cards: PreviewCard[]): Promise<void> {
  const database = await openPreviewDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("state", "readwrite");
    transaction.objectStore("state").put(cards, "cards");
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

async function filesFromEntries(entries: FileSystemEntry[], fallback: File[]): Promise<IncomingFile[]> {
  if (!entries.length) return fallback.map((file) => ({ file, path: file.webkitRelativePath || file.name }));
  const found: IncomingFile[] = [];
  async function visit(entry: FileSystemEntry) {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      found.push({ file, path: entry.fullPath.replace(/^\//, "") || file.name });
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      for (const child of batch) await visit(child);
    }
  }
  for (const entry of entries) await visit(entry);
  return found;
}

function fileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
const icons = { link: Link2, image: ImageIcon, note: FileText, file: Upload };
const imageFilePattern = /\.(?:avif|bmp|gif|heic|jpe?g|png|svg|tiff?|webp)$/i;
const wordFilePattern = /\.docx$/i;

function rtfToText(source: string): string | null {
  const ignored = new Set(["fonttbl", "colortbl", "stylesheet", "info", "pict", "object", "header", "footer"]);
  const stack: boolean[] = [];
  let hidden = false;
  let groupStart = false;
  let result = "";
  for (let index = 0; index < source.length;) {
    const char = source[index++];
    if (char === "{") { stack.push(hidden); groupStart = true; continue; }
    if (char === "}") { hidden = stack.pop() || false; groupStart = false; continue; }
    if (char === "\\") {
      const next = source[index++];
      if (next === "*") { hidden = true; continue; }
      if (next === "'" && index + 1 < source.length) {
        if (!hidden) result += new TextDecoder("windows-1252").decode(Uint8Array.of(parseInt(source.slice(index, index + 2), 16)));
        index += 2;
        continue;
      }
      if (next === "\\" || next === "{" || next === "}") { if (!hidden) result += next; continue; }
      if (!/[a-z]/i.test(next || "")) { groupStart = false; continue; }
      let control = next;
      while (/[a-z]/i.test(source[index] || "")) control += source[index++];
      let value = "";
      if (source[index] === "-") value += source[index++];
      while (/[0-9]/.test(source[index] || "")) value += source[index++];
      if (source[index] === " ") index++;
      if (groupStart && ignored.has(control)) hidden = true;
      groupStart = false;
      if (hidden) continue;
      if (control === "par" || control === "line") result += "\n";
      else if (control === "tab") result += "\t";
      else if (control === "u" && value) {
        result += String.fromCharCode((Number(value) + 65536) % 65536);
        if (source[index] === "?") index++;
      }
      continue;
    }
    if (!hidden && char !== "\r" && char !== "\n") result += char;
    groupStart = false;
  }
  return result.trim() || null;
}

async function extractNoteText(file: Blob & { name?: string }): Promise<string | null> {
  if (/\.(?:doc|pdf)$/i.test(file.name || "")) return null;
  if (/\.rtf$/i.test(file.name || "")) {
    try { return rtfToText(new TextDecoder("windows-1252").decode(await file.arrayBuffer())); }
    catch { return null; }
  }
  if (wordFilePattern.test(file.name || "") || /\.odt$/i.test(file.name || "")) {
    try {
      const JSZip = (await import("jszip")).default;
      const archive = await JSZip.loadAsync(file);
      const openDocument = /\.odt$/i.test(file.name || "");
      const xml = await archive.file(openDocument ? "content.xml" : "word/document.xml")?.async("text");
      if (!xml) return null;
      const document = new DOMParser().parseFromString(xml, "application/xml");
      const namespace = openDocument ? "urn:oasis:names:tc:opendocument:xmlns:text:1.0" : "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
      const paragraphs = openDocument
        ? Array.from(document.getElementsByTagName("*")).filter((element) => element.namespaceURI === namespace && (element.localName === "p" || element.localName === "h"))
        : Array.from(document.getElementsByTagNameNS(namespace, "p"));
      const text = paragraphs.map((paragraph) => openDocument ? paragraph.textContent || "" : Array.from(paragraph.getElementsByTagNameNS(namespace, "t"))
          .map((run) => run.textContent || "").join(""))
        .join("\n").trim();
      return text || null;
    } catch { return null; }
  }
  try {
    const bytes = await file.arrayBuffer();
    const data = new Uint8Array(bytes);
    const encoding = data[0] === 0xff && data[1] === 0xfe ? "utf-16le" : data[0] === 0xfe && data[1] === 0xff ? "utf-16be" : "utf-8";
    const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) return null;
    return text.trim() || null;
  } catch { return null; }
}

function acceptsPageDrop(transfer: DataTransfer): boolean {
  return ["Files", "text/uri-list", "text/plain", "text/html"].some((type) => Array.from(transfer.types).includes(type));
}

function droppedUrl(transfer: DataTransfer): { url: URL; image: boolean } | null {
  const html = new DOMParser().parseFromString(transfer.getData("text/html"), "text/html");
  const imageSource = html.querySelector("img[src]")?.getAttribute("src") || "";
  const linkSource = html.querySelector("a[href]")?.getAttribute("href") || "";
  const uri = transfer.getData("text/uri-list").split(/\r?\n/).find((line) => line && !line.startsWith("#")) || "";
  const plain = transfer.getData("text/plain").trim().split(/\r?\n/)[0] || "";
  for (const candidate of [imageSource, uri, linkSource, plain]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return { url, image: candidate === imageSource || imageFilePattern.test(url.pathname) };
      }
    } catch { /* Another dropped representation may contain the URL. */ }
  }
  return null;
}

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
  onEdit,
  onAddToCollection,
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
  onEdit?: () => void;
  onAddToCollection?: () => void;
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
          <span>{card.screenshotStatus === "pending" || card.screenshotStatus === "processing" ? "Creating preview…" : card.source || "Your note"}</span>
          {card.url && <ArrowUpRight size={16} aria-hidden="true" />}
        </div>
        {externalOwner && <div className="rb-card-owner">{externalOwner.avatar ? <img src={externalOwner.avatar} alt="" /> : <span>{externalOwner.name.slice(0, 1)}</span>}<span>{externalOwner.name}</span></div>}
      </div>
    </>
  );
  return (
    <article
      className={`rb-card rb-card-${card.kind} ${card.tone ? `rb-tone-${card.tone}` : ""} ${list ? "rb-card-list" : ""} ${onToggleFavorite ? "rb-card-has-favorite" : ""} ${favorite ? "rb-card-favorited" : ""}`}
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
      {!selecting && onToggleFavorite && <button className="rb-card-favorite-toggle" onClick={(event) => { onToggleFavorite(); if (event.detail > 0) event.currentTarget.blur(); }} aria-label={`${favorite ? "Remove favorite" : "Add favorite"}: ${card.title}`} aria-pressed={favorite} title={favorite ? "Remove favorite" : "Add favorite"}><Heart size={18} fill={favorite ? "currentColor" : "none"} /></button>}
      {!selecting && <div className="rb-card-actions">
        {onEdit && <button onClick={onEdit} aria-label={`Edit card: ${card.title}`} title="Edit card"><Pencil size={18} /></button>}
        {onEditTags && <button onClick={onEditTags} aria-label={`Edit tags: ${card.title}`} title="Edit tags"><Tag size={18} /></button>}
        {onAddToCollection && <button onClick={onAddToCollection} aria-label={`Add ${card.title} to a collection`} title="Add to collection"><FolderPlus size={18} /></button>}
        {onOpenOwner && <button onClick={onOpenOwner} aria-label={`View ${externalOwner?.name}'s profile`} title="View account"><UsersRound size={18} /></button>}
        {card.kind === "link" && card.url && <button onClick={onOpen} aria-label={`View ${card.title} in Savers`} title="Details in Savers"><MoreHorizontal size={18} /></button>}
      </div>}
    </article>
  );
}

function OverlayCloseButton({ label, onClick, disabled = false }: { label: string; onClick: () => void; disabled?: boolean }) {
  return <button className="rb-overlay-close" type="button" onClick={onClick} disabled={disabled} aria-label={label}><X aria-hidden="true" /></button>;
}

async function liveRequest<T>(path: string, method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, { method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || `Save failed (${response.status})`);
  return result;
}

async function liveUpdateCard(card: PreviewCard, updates: Record<string, unknown>): Promise<PreviewCard> {
  if (card.kind === "image") {
    const result = await liveRequest<{ image: LiveSavedImage }>(`/api/images/${encodeURIComponent(card.id)}`, "PATCH", updates);
    return liveImage(result.image);
  }
  const result = await liveRequest<{ bookmark: SavedBookmark }>("/api/bookmarks", "PATCH", { id: card.id, ...updates });
  return liveCard(result.bookmark);
}

async function liveDeleteCard(card: PreviewCard): Promise<void> {
  const path = card.kind === "image" ? `/api/images/${encodeURIComponent(card.id)}` : `/api/bookmarks?id=${encodeURIComponent(card.id)}`;
  await liveRequest(path, "DELETE", {});
}

async function liveUploadImage(file: File | null, remoteURL: string, collectionId: string | null, title: string, notes: string, tags: string[]): Promise<LiveSavedImage> {
  const body = new FormData();
  if (file) body.append("files", file);
  else body.append("remote_url", remoteURL);
  if (collectionId) body.append("collection_id", collectionId);
  const response = await fetch("/api/images/upload", { method: "POST", credentials: "same-origin", body });
  const result = await response.json() as { images?: Array<{ id: string; title: string | null }>; errors?: Array<{ reason: string }>; error?: string };
  if (!response.ok || !result.images?.length) throw new Error(result.errors?.[0]?.reason || result.error || "Could not save image");
  const saved = result.images[0];
  const updated = await liveRequest<{ image: LiveSavedImage }>(`/api/images/${encodeURIComponent(saved.id)}`, "PATCH", { title: title || saved.title || "Screenshot", notes, tags });
  return updated.image;
}

export default function RebuildPreview({
  seedCollections,
  seedCards,
  publicRelatedCards = [],
  initialCardId,
  liveMode = false,
  isStaging = false,
  readOnly = false,
  seedPinnedIds = [],
}: {
  seedCollections: PreviewCollection[];
  seedCards: PreviewCard[];
  publicRelatedCards?: PreviewCard[];
  initialCardId?: string;
  liveMode?: boolean;
  isStaging?: boolean;
  readOnly?: boolean;
  seedPinnedIds?: string[];
}) {
  const [destination, setDestination] = useState<Destination>("library");
  const [cards, setCards] = useState<PreviewCard[]>(seedCards);
  const [allCollections, setAllCollections] = useState<PreviewCollection[]>(seedCollections);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(
    null,
  );
  const [activeCardId, setActiveCardId] = useState<string | null>(initialCardId || null);
  const [filter, setFilter] = useState<Filter>("all");
  const [socialExpanded, setSocialExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [listMode, setListMode] = useState(false);
  const [cardSize, setCardSize] = useState<"s" | "m" | "l" | "xl">("l");
  const [librarySelecting, setLibrarySelecting] = useState(false);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([]);
  const [collectionPickerCardId, setCollectionPickerCardId] = useState<string | null>(null);
  const [libraryCollectionPickerOpen, setLibraryCollectionPickerOpen] = useState(false);
  const [pickerNewFolderOpen, setPickerNewFolderOpen] = useState(false);
  const [pickerNewFolderName, setPickerNewFolderName] = useState("");
  const [bulkNewFolderOpen, setBulkNewFolderOpen] = useState(false);
  const [bulkNewFolderName, setBulkNewFolderName] = useState("");
  const [deleteCollectionId, setDeleteCollectionId] = useState<string | null>(null);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [bulkRemoveOpen, setBulkRemoveOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editNewCollectionOpen, setEditNewCollectionOpen] = useState(false);
  const [editNewCollectionName, setEditNewCollectionName] = useState("");
  const [deleteCardId, setDeleteCardId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editImage, setEditImage] = useState("");
  const [editCollection, setEditCollection] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editPrivate, setEditPrivate] = useState(true);
  const [pinnedIds, setPinnedIds] = useState<string[]>(seedPinnedIds);
  const [createOpen, setCreateOpen] = useState(false);
  const [composer, setComposer] = useState<Composer>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [detailMenuOpen, setDetailMenuOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
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
  const [relatedSortOpen, setRelatedSortOpen] = useState(false);
  const [relatedSort, setRelatedSort] = useState<"relevant" | "library" | "reverse">("relevant");
  const [relatedMineOnly, setRelatedMineOnly] = useState(false);
  const [relatedKind, setRelatedKind] = useState<"all" | CardKind>("all");
  const [relatedScope, setRelatedScope] = useState<"all" | "yours" | "others">("all");
  const [relatedSelecting, setRelatedSelecting] = useState(false);
  const [selectedRelatedIds, setSelectedRelatedIds] = useState<string[]>([]);
  const [relatedCollectionPickerOpen, setRelatedCollectionPickerOpen] = useState(false);
  const [relatedCollectionQuery, setRelatedCollectionQuery] = useState("");
  const [discoverTab, setDiscoverTab] = useState<"discover" | "following">("discover");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileScope, setProfileScope] = useState<"cards" | "collections">("cards");
  const [followingOverlayOpen, setFollowingOverlayOpen] = useState(false);
  const [captureOverlayOpen, setCaptureOverlayOpen] = useState(false);
  const [followedAccountIds, setFollowedAccountIds] = useState<string[]>([]);
  const [inboxTab, setInboxTab] = useState<"activity" | "following" | "subscriptions" | "review">("activity");
  const [subscriptionEntryOpen, setSubscriptionEntryOpen] = useState(false);
  const [subscriptions, setSubscriptions] = useState<string[]>([]);
  const [subscriptionInput, setSubscriptionInput] = useState("");
  const [subscriptionError, setSubscriptionError] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formTags, setFormTags] = useState("");
  const [formTagInput, setFormTagInput] = useState("");
  const [formCollection, setFormCollection] = useState("");
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [formFile, setFormFile] = useState<File | null>(null);
  const [formPrivate, setFormPrivate] = useState(true);
  const [formError, setFormError] = useState("");
  const [bulkImportFiles, setBulkImportFiles] = useState<IncomingFile[] | null>(null);
  const [bulkImportCollection, setBulkImportCollection] = useState("");
  const [bulkImportPrivate, setBulkImportPrivate] = useState(true);
  const [bulkImportBusy, setBulkImportBusy] = useState(false);
  const [bulkImportProgress, setBulkImportProgress] = useState(0);
  const [bulkImportError, setBulkImportError] = useState("");
  const [pageDragActive, setPageDragActive] = useState(false);
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
  const [ready, setReady] = useState(liveMode);
  const [liveSaving, setLiveSaving] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const captureCardsRef = useRef(cards);
  const captureQueueRef = useRef(Promise.resolve());
  const captureResultsRef = useRef(new Map<string, string>());
  const multiImageInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { folderInputRef.current?.setAttribute("webkitdirectory", ""); }, []);

  useEffect(() => { captureCardsRef.current = cards; }, [cards]);

  useEffect(() => {
    if (!ready) return;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const pairedToken = hash.get("savers-capture");
    if (pairedToken && /^[A-Fa-f0-9-]{72}$/.test(pairedToken)) {
      localStorage.setItem(macCaptureTokenKey, pairedToken);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      window.setTimeout(() => setToast("Mac Capture connected"), 0);
    }
    const token = pairedToken || localStorage.getItem(macCaptureTokenKey);
    if (!token) return;
    const bridgeURL = "http://127.0.0.1:57733";
    const headers = { Authorization: `Bearer ${token}` };
    let stopped = false;
    let polling = false;
    const poll = async () => {
      if (stopped || polling) return;
      polling = true;
      try {
        const response = await fetch(`${bridgeURL}/capture`, { headers, cache: "no-store" });
        if (response.status === 204 || !response.ok) return;
        const capture = await response.json() as { id: string; image: string; title: string };
        if (!/^[A-Fa-f0-9-]{36}$/.test(capture.id) || !capture.image.startsWith("data:image/png;base64,")) return;
        if (liveMode) {
          if (!captureResultsRef.current.has(capture.id)) {
            const blob = await (await fetch(capture.image)).blob();
            const title = capture.title || "Screenshot";
            const saved = await liveUploadImage(new File([blob], `${title}.png`, { type: "image/png" }), "", null, title, "", []);
            captureResultsRef.current.set(capture.id, saved.id);
            setCards((items) => [liveImage(saved), ...items]);
            setToast("Screenshot saved to Savers");
          }
          await fetch(`${bridgeURL}/ack/${capture.id}`, { method: "POST", headers });
          return;
        }
        const current = await readPreviewCards().catch(() => null) || captureCardsRef.current;
        const id = `mac-capture-${capture.id}`;
        if (!current.some((card) => card.id === id)) {
          const next: PreviewCard[] = [{
            id,
            kind: "image",
            title: capture.title || "Screenshot",
            source: "Mac screenshot",
            image: capture.image,
            date: "Just now",
            isPrivate: true,
            tags: [],
            tone: "stone",
          }, ...current];
          await writePreviewCards(next);
          if (stopped) return;
          captureCardsRef.current = next;
          setCards(next);
          announcePreviewCardsChanged();
          setToast("Screenshot saved to Savers");
        }
        await fetch(`${bridgeURL}/ack/${capture.id}`, { method: "POST", headers });
      } catch {
        // A queued capture remains on the Mac until Savers confirms its save.
      } finally {
        polling = false;
      }
    };
    void poll();
    const interval = window.setInterval(() => { void poll(); }, 1800);
    return () => { stopped = true; window.clearInterval(interval); };
  }, [ready, liveMode]);

  useEffect(() => {
    if (liveMode) return;
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(previewCardsChannel);
    let cancelled = false;
    const refreshCards = () => {
      void readPreviewCards().then((latest) => {
        if (cancelled || !latest) return;
        captureCardsRef.current = latest;
        setCards(latest);
      }).catch(() => undefined);
    };
    channel?.addEventListener("message", refreshCards);
    window.addEventListener("focus", refreshCards);
    return () => {
      cancelled = true;
      channel?.removeEventListener("message", refreshCards);
      channel?.close();
      window.removeEventListener("focus", refreshCards);
    };
  }, [liveMode]);

  useEffect(() => {
    if (!ready || liveMode) return;
    const reply = (requestId: string, result: Record<string, unknown>) => window.postMessage({ type: "SAVERS_PREVIEW_CAPTURE_RESULT", requestId, theme, ...result }, window.location.origin);
    const handleCapture = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin || event.data?.type !== "SAVERS_PREVIEW_CAPTURE") return;
      const { action, requestId, payload, cardId } = event.data as { action?: string; requestId?: string; payload?: BrowserCapture; cardId?: string };
      if (typeof requestId !== "string") return;
      captureQueueRef.current = captureQueueRef.current.catch(() => undefined).then(async () => {
        try {
          const earlierCardId = captureResultsRef.current.get(requestId);
          if (earlierCardId) { reply(requestId, { ok: true, cardId: earlierCardId }); return; }
          if (action === "undo" && cardId) {
            const current = await readPreviewCards().catch(() => null) || captureCardsRef.current;
            const next = current.filter((card) => card.id !== cardId);
            if (next.length === current.length) { reply(requestId, { ok: false, error: "Item was already removed." }); return; }
            await writePreviewCards(next);
            captureCardsRef.current = next;
            setCards(next);
            announcePreviewCardsChanged();
            setToast("Capture undone");
            reply(requestId, { ok: true });
            return;
          }
          if (action === "edit" && cardId) {
            const current = await readPreviewCards().catch(() => null) || captureCardsRef.current;
            const card = current.find((item) => item.id === cardId);
            if (!card) { reply(requestId, { ok: false, error: "Item was not found." }); return; }
            captureCardsRef.current = current;
            setCards(current);
            setEditingCardId(card.id);
            setEditTitle(card.title);
            setEditDescription(card.description || "");
            setEditNote(card.note || "");
            setEditUrl(card.url || "");
            setEditImage(card.image || "");
            setEditCollection(card.collection || "");
            setEditTags((card.tags || []).join(", "));
            setEditPrivate(card.isPrivate !== false);
            reply(requestId, { ok: true });
            return;
          }
          if (action !== "save" || !payload) { reply(requestId, { ok: false, error: "Invalid capture." }); return; }
          const source = new URL(payload.sourceUrl || payload.url || "");
          if (!/^https?:$/.test(source.protocol)) throw new Error("Only web pages can be captured.");
          const link = payload.kind === "link" ? new URL(payload.url || source.href) : source;
          if (!/^https?:$/.test(link.protocol)) throw new Error("Only web links can be captured.");
          const imageUrl = payload.kind === "image" ? payload.imageUrl || "" : null;
          const image = imageUrl && !imageUrl.startsWith("data:") ? new URL(imageUrl) : null;
          if (imageUrl && !(/^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,/i.test(imageUrl) && imageUrl.length < 27_000_000) && (!image || !/^https?:$/.test(image.protocol))) throw new Error("This image cannot be captured.");
          if (payload.kind === "image" && !imageUrl) throw new Error("Choose an image to capture.");
          const quote = (payload.text || "").trim().slice(0, 100_000);
          if (payload.kind === "note" && !quote) throw new Error("Select text to save first.");
          const current = await readPreviewCards().catch(() => null) || captureCardsRef.current;
          const existing = current.find((item) => item.id === `capture-${requestId}`);
          if (existing) { reply(requestId, { ok: true, cardId: existing.id }); return; }
          const card: PreviewCard = {
            id: `capture-${requestId}`,
            kind: payload.kind,
            title: payload.kind === "note" ? quote.slice(0, 76).replace(/\s+/g, " ") : (payload.title || image?.pathname.split("/").pop() || link.hostname).trim().slice(0, 240),
            description: payload.kind === "note" ? quote : undefined,
            source: (payload.kind === "link" ? link : source).hostname.replace(/^www\./, ""),
            url: link.href,
            image: imageUrl || undefined,
            date: "Just now",
            isPrivate: true,
            tags: [],
            tone: "stone",
          };
          const next = [card, ...current];
          await writePreviewCards(next);
          captureCardsRef.current = next;
          captureResultsRef.current.set(requestId, card.id);
          setCards(next);
          announcePreviewCardsChanged();
          setToast(`Saved ${payload.kind} in this preview`);
          reply(requestId, { ok: true, cardId: card.id });
        } catch (error) {
          reply(requestId, { ok: false, error: error instanceof Error ? error.message : "Could not save capture." });
        }
      });
    };
    window.addEventListener("message", handleCapture);
    return () => window.removeEventListener("message", handleCapture);
  }, [ready, theme, liveMode]);

  useEffect(() => {
    if (!accountOpen && !createOpen && !detailMenuOpen) return;
    const closeMenus = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      if (accountOpen && !event.target.closest(".rb-account-wrap")) setAccountOpen(false);
      if (createOpen && !event.target.closest(".rb-create-anchor")) setCreateOpen(false);
      if (detailMenuOpen && !event.target.closest(".rb-detail-menu, button[aria-label='More card actions']")) setDetailMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeMenus);
    return () => document.removeEventListener("pointerdown", closeMenus);
  }, [accountOpen, createOpen, detailMenuOpen]);

  useEffect(() => {
    if (!sizeOpen && !sortOpen && !viewOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(".rb-toolbar-menu-wrap")) return;
      setSizeOpen(false);
      setSortOpen(false);
      setViewOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [sizeOpen, sortOpen, viewOpen]);

  useEffect(() => {
    if (!relatedSortOpen) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(".rb-related-heading")) return;
      setRelatedSortOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [relatedSortOpen]);

  useEffect(() => {
    if (liveMode) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => { void (async () => {
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
          const indexedCards = await readPreviewCards().catch(() => null);
          if (cancelled) return;
          if (indexedCards) setCards(indexedCards);
          else if (Array.isArray(parsed.cards)) setCards(parsed.cards);
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
        } else {
          const indexedCards = await readPreviewCards().catch(() => null);
          if (cancelled) return;
          if (indexedCards) setCards(indexedCards);
        }
      } catch {
        /* The fixture preview remains usable if browser storage is unavailable. */
      }
      if (!cancelled) setReady(true);
    })(); }, 0);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [liveMode]);

  useEffect(() => {
    if (!ready || liveMode) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
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
  }, [cards, allCollections, favorites, pinnedIds, cardSize, followedAccountIds, subscriptions, theme, smartRules, ready, liveMode]);

  useEffect(() => {
    if (!ready || liveMode) return;
    const timeout = window.setTimeout(() => {
      void writePreviewCards(cards).catch(() => setToast("Browser storage could not keep these items."));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [cards, ready, liveMode]);

  const liveHasPendingScreenshots = liveMode && cards.some((card) => card.screenshotStatus === "pending" || card.screenshotStatus === "processing");
  useEffect(() => {
    if (!liveMode) return;
    let stopped = false;
    const refresh = async () => {
      try {
        const all: SavedBookmark[] = [];
        let offset = 0;
        for (;;) {
          const response = await fetch(`/api/bookmarks?limit=500&offset=${offset}`, { cache: "no-store", credentials: "same-origin" });
          if (!response.ok) return;
          const page = await response.json() as { bookmarks: SavedBookmark[]; has_more: boolean; next_offset: number };
          all.push(...page.bookmarks);
          if (!page.has_more || page.next_offset <= offset) break;
          offset = page.next_offset;
        }
        const allImages: LiveSavedImage[] = [];
        let imageOffset = 0;
        for (;;) {
          const response = await fetch(`/api/images?limit=500&offset=${imageOffset}`, { cache: "no-store", credentials: "same-origin" });
          if (!response.ok) return;
          const page = await response.json() as { images: LiveSavedImage[]; has_more: boolean; next_offset: number };
          allImages.push(...page.images);
          if (!page.has_more || page.next_offset <= imageOffset) break;
          imageOffset = page.next_offset;
        }
        const nextCards = [...all.map((bookmark) => ({ createdAt: bookmark.created_at, card: liveCard(bookmark) })), ...allImages.map((image) => ({ createdAt: image.created_at, card: liveImage(image) }))].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).map(({ card }) => card);
        if (!stopped) setCards(nextCards);
        if (!stopped) setPinnedIds(all.filter((bookmark) => bookmark.pinned).map((bookmark) => bookmark.id));
      } catch { /* Keep showing the last successfully loaded library. */ }
    };
    const interval = window.setInterval(() => { void refresh(); }, liveHasPendingScreenshots ? 4000 : 20000);
    window.addEventListener("focus", refresh);
    return () => { stopped = true; window.clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, [liveMode, liveHasPendingScreenshots]);

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
        setPageDragActive(false);
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
        setViewOpen(false);
        setSmartEditorId(null);
        setSearchOpen(false);
        setTagEditorId(null);
        setRelatedFeedOpen(false);
        setRelatedSortOpen(false);
        setRelatedCollectionPickerOpen(false);
        setFollowingOverlayOpen(false);
        setCaptureOverlayOpen(false);
        setCollectionPickerCardId(null);
        setLibraryCollectionPickerOpen(false);
        setEditingCardId(null);
        setDeleteCardId(null);
        setBulkTagOpen(false);
        setBulkRemoveOpen(false);
        if (!bulkImportBusy) setBulkImportFiles(null);
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
  }, [collectionGroup, initialCardId, bulkImportBusy]);

  useEffect(() => {
    if (!activeCardId && !composer && !relatedFeedOpen && !tagEditorId && !smartEditorId && !relatedCollectionPickerOpen && !followingOverlayOpen && !collectionPickerCardId && !libraryCollectionPickerOpen && !editingCardId && !deleteCardId && !bulkTagOpen && !bulkRemoveOpen && !bulkImportFiles) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [activeCardId, composer, relatedFeedOpen, tagEditorId, smartEditorId, relatedCollectionPickerOpen, followingOverlayOpen, collectionPickerCardId, libraryCollectionPickerOpen, editingCardId, deleteCardId, bulkTagOpen, bulkRemoveOpen, bulkImportFiles]);

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
    setViewOpen(false);
    window.scrollTo(0, 0);
  }

  const activeCard = cards.find((card) => card.id === activeCardId) || publicRelatedCards.find((card) => card.id === activeCardId) || null;
  const pickerCard = collectionPickerCardId ? cards.find((card) => card.id === collectionPickerCardId) || publicRelatedCards.find((card) => card.id === collectionPickerCardId) : null;
  const pickerCollectionId = pickerCard?.collection || (libraryCollectionPickerOpen && selectedLibraryIds.length && selectedLibraryIds.every((id) => cards.find((card) => card.id === id)?.collection === cards.find((card) => card.id === selectedLibraryIds[0])?.collection) ? cards.find((card) => card.id === selectedLibraryIds[0])?.collection : undefined);
  const pickerKind = pickerCard?.kind || (libraryCollectionPickerOpen && selectedLibraryIds.length ? cards.find((card) => card.id === selectedLibraryIds[0])?.kind : undefined);
  const pickerCollections = allCollections.filter((item) => item.group !== "smart" && (!liveMode || item.group === (pickerKind === "image" ? "images" : "links")) && item.name.toLocaleLowerCase().includes(relatedCollectionQuery.toLocaleLowerCase())).sort((a, b) => Number(b.id === pickerCollectionId) - Number(a.id === pickerCollectionId));
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
  const visibleRelatedCards = relatedCards.filter((item) =>
    (!relatedMineOnly || !item.owner) && (relatedKind === "all" || item.kind === relatedKind),
  );
  if (relatedSort !== "relevant") visibleRelatedCards.sort((a, b) => {
    const aIndex = cards.indexOf(a) < 0 ? Number.MAX_SAFE_INTEGER : cards.indexOf(a);
    const bIndex = cards.indexOf(b) < 0 ? Number.MAX_SAFE_INTEGER : cards.indexOf(b);
    return relatedSort === "library" ? aIndex - bIndex : bIndex - aIndex;
  });
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
    if (!profileId && !item.owner) return false;
    if (!profileId && discoverTab === "following" && !followedAccountIds.includes(item.owner!.id)) return false;
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

  async function applyTags() {
    if (!tagEditorId) return;
    const extra = tagInput.trim();
    const next = extra && !tagDraft.some((tag) => tag.toLocaleLowerCase() === extra.toLocaleLowerCase()) ? [...tagDraft, extra] : tagDraft;
    if (liveMode) {
      try {
        const current = cards.find((item) => item.id === tagEditorId);
        if (!current) throw new Error("Item not found");
        const updated = await liveUpdateCard(current, { tags: next });
        setCards((items) => items.map((item) => item.id === tagEditorId ? updated : item));
        setTagEditorId(null);
        setTagInput("");
        setToast("Tags saved");
      } catch (error) { setToast(error instanceof Error ? error.message : "Could not save tags"); }
      return;
    }
    setCards((items) => items.map((item) => item.id === tagEditorId ? { ...item, tags: next } : item));
    setTagEditorId(null);
    setTagInput("");
    setToast("Tags updated in this preview");
  }

  function displayCount(item: PreviewCollection): number {
    const definition = smartRules[item.id];
    return item.group === "smart"
      ? definition ? cards.filter((card) => matchesSmart(card, definition)).length : 0
      : cards.filter((card) => card.collection === item.id).length;
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
    setViewOpen(false);
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
      setSubscriptionEntryOpen(false);
      setToast("Source added in this browser preview");
    } catch {
      setSubscriptionError("Enter a site or feed URL.");
    }
  }

  const openComposer = useCallback((kind: Composer) => {
    setComposer(kind);
    setCreateOpen(false);
    setFormUrl("");
    setFormTitle("");
    setFormNote("");
    setFormTags("");
    setFormTagInput("");
    const selected = allCollections.find((item) => item.id === selectedCollection);
    const needsImageFolder = kind === "image" || kind === "collection" && (collectionGroup === "images" || selected?.group === "images");
    setFormCollection(!liveMode || !selected || selected.group === (needsImageFolder ? "images" : "links") ? selectedCollection || "" : "");
    setNewCollectionOpen(false);
    setNewCollectionName("");
    setFormFile(null);
    setFormPrivate(true);
    setFormError("");
  }, [selectedCollection, allCollections, collectionGroup, liveMode]);

  function addComposerTag() {
    const existing = formTags.split(",").map((tag) => tag.trim()).filter(Boolean);
    const incoming = formTagInput.split(",").map((tag) => tag.trim()).filter(Boolean);
    if (!incoming.length) return;
    const seen = new Set<string>();
    setFormTags([...existing, ...incoming].filter((tag) => {
      const key = tag.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).join(", "));
    setFormTagInput("");
  }

  async function createComposerCollection() {
    const name = newCollectionName.trim();
    if (!name) { setFormError("Give your collection a name."); return; }
    if (liveMode) {
      try {
        const imageGroup = composer === "image" || allCollections.find((item) => item.id === formCollection)?.group === "images";
        if (imageGroup) {
          const result = await liveRequest<{ collection: ImageCollection }>("/api/image-collections", "POST", { name, parent_id: formCollection || null });
          setAllCollections((items) => [...items, liveImageCollection(result.collection)]);
          setFormCollection(result.collection.id);
        } else {
          const result = await liveRequest<{ collection: Collection }>("/api/collections", "POST", { name, parent_id: formCollection || null });
          setAllCollections((items) => [...items, liveCollection(result.collection)]);
          setFormCollection(result.collection.id);
        }
        setNewCollectionName("");
        setNewCollectionOpen(false);
        setFormError("");
      } catch (error) { setFormError(error instanceof Error ? error.message : "Could not create collection"); }
      return;
    }
    const id = `local-${crypto.randomUUID()}`;
    const parent = allCollections.find((item) => item.id === selectedCollection);
    setAllCollections((items) => [...items, {
      id,
      name,
      count: 0,
      parentId: parent?.id,
      group: parent?.group || (composer === "image" ? "images" : "links"),
      isPrivate: true,
    }]);
    setFormCollection(id);
    setNewCollectionName("");
    setNewCollectionOpen(false);
    setFormError("");
  }

  const prepareComposerFile = useCallback(async (file: File, multiple = false) => {
    const title = file.name.replace(/\.[^.]+$/, "");
    if (file.type.startsWith("image/") || imageFilePattern.test(file.name)) {
      openComposer("image");
      setFormFile(file);
    } else {
      const text = file.size <= 20_000_000 ? await extractNoteText(file) : null;
      openComposer(text === null ? "file" : "note");
      setFormFile(file);
      if (text !== null) setFormNote(text);
    }
    setFormTitle(title);
    if (multiple) setFormError("Save one item at a time. The first file is ready.");
  }, [openComposer]);

  async function convertFileCardToNote(card: PreviewCard) {
    if (!card.fileData) return;
    try {
      const blob = await (await fetch(card.fileData)).blob();
      const text = await extractNoteText(new File([blob], card.source || card.title, { type: blob.type }));
      if (text === null) { setToast("This file could not be read as text."); return; }
      setCards((items) => items.map((item) => item.id === card.id ? { ...item, kind: "note", description: text, fileData: undefined, tone: "stone" } : item));
      setDetailMenuOpen(false);
      setToast("Converted to a note in this preview");
    } catch { setToast("This file could not be read as text."); }
  }

  function openBulkImport(files: IncomingFile[]) {
    const eligible = files.filter((item) => !/(?:^|\/)(?:\.DS_Store|Thumbs\.db|__MACOSX)(?:\/|$)/i.test(item.path));
    if (!eligible.length) { setToast("That folder has no files to add."); return; }
    setBulkImportFiles(eligible);
    setBulkImportCollection(allCollections.some((item) => item.id === selectedCollection && item.group !== "smart") ? selectedCollection || "" : "");
    setBulkImportPrivate(true);
    setBulkImportProgress(0);
    setBulkImportError("");
    setCreateOpen(false);
  }

  async function importBulkFiles() {
    if (!bulkImportFiles?.length || bulkImportBusy) return;
    setBulkImportBusy(true);
    setBulkImportError("");
    const nextCollections = [...allCollections];
    const newCards: PreviewCard[] = [];
    const rootIds = new Set<string>();
    const base = nextCollections.find((item) => item.id === bulkImportCollection);
    const imageCount = bulkImportFiles.filter(({ file }) => file.type.startsWith("image/") || imageFilePattern.test(file.name)).length;
    const group = base?.group || (imageCount > bulkImportFiles.length / 2 ? "images" : "links");
    let skipped = 0;
    try {
      for (const [index, item] of bulkImportFiles.entries()) {
        const parts = item.path.split("/").filter((part) => part && part !== "." && part !== "..");
        if (item.file.size > 20_000_000) { skipped++; setBulkImportProgress(index + 1); continue; }
        let parentId = base?.id;
        for (const [folderIndex, folderName] of parts.slice(0, -1).entries()) {
          let folder = nextCollections.find((candidate) => candidate.parentId === parentId && candidate.name === folderName && candidate.group === group);
          if (!folder) {
            folder = { id: `local-${crypto.randomUUID()}`, name: folderName, count: 0, parentId, group, isPrivate: bulkImportPrivate };
            nextCollections.push(folder);
          }
          if (folderIndex === 0) rootIds.add(folder.id);
          parentId = folder.id;
        }
        const file = item.file;
        const image = file.type.startsWith("image/") || imageFilePattern.test(file.name);
        const noteText = image ? null : await extractNoteText(file);
        const fileData = noteText === null ? await fileDataUrl(file) : undefined;
        newCards.push({
          id: `local-${crypto.randomUUID()}`,
          kind: image ? "image" : noteText !== null ? "note" : "file",
          title: file.name.replace(/\.[^.]+$/, "") || file.name,
          description: noteText || undefined,
          source: file.name,
          image: image ? fileData : undefined,
          fileData,
          collection: parentId,
          date: "Just now",
          isPrivate: bulkImportPrivate,
          tags: [],
          tone: "stone",
        });
        setBulkImportProgress(index + 1);
      }
      if (newCards.length) await writePreviewCards([...newCards, ...cards]);
      setAllCollections(nextCollections);
      setCards((existing) => [...newCards, ...existing]);
      setBulkImportFiles(null);
      setBulkImportBusy(false);
      setDestination("library");
      setSelectedCollection(rootIds.size === 1 ? [...rootIds][0] : base?.id || null);
      setFilter("all");
      setToast(`Added ${newCards.length} item${newCards.length === 1 ? "" : "s"}${skipped ? `; ${skipped} over 20 MB skipped` : ""}.`);
      window.scrollTo(0, 0);
    } catch {
      setBulkImportBusy(false);
      setBulkImportError("The browser could not store this batch. Try fewer or smaller files.");
    }
  }

  function handlePageDrop(transfer: DataTransfer) {
    setPageDragActive(false);
    const files = Array.from(transfer.files);
    const entries = Array.from(transfer.items).filter((item) => item.kind === "file").map((item) => item.webkitGetAsEntry()).filter((entry): entry is FileSystemEntry => !!entry);
    if (files.length > 1 || entries.some((entry) => entry.isDirectory)) {
      void filesFromEntries(entries, files).then(openBulkImport).catch(() => setToast("Could not read that folder. Try the folder picker."));
      return;
    }
    const file = files[0];
    if (file) {
      void prepareComposerFile(file, transfer.files.length > 1);
      return;
    }
    const dropped = droppedUrl(transfer);
    if (!dropped) { setToast("Drop a web link, image, or file to save it."); return; }
    openComposer(dropped.image ? "image" : "link");
    setFormUrl(dropped.url.href);
  }

  async function pasteImageFromClipboard() {
    try {
      if (!navigator.clipboard?.read) throw new Error("Clipboard image access is unavailable in this browser.");
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((value) => value.startsWith("image/"));
        if (!type) continue;
        const blob = await item.getType(type);
        const extension = type.split("/")[1]?.replace("jpeg", "jpg") || "png";
        await prepareComposerFile(new File([blob], `CleanShot ${new Date().toISOString().slice(0, 19).replace("T", " ")}.${extension}`, { type }));
        return;
      }
      setToast("No image is on the clipboard. Copy the screenshot in CleanShot first.");
    } catch {
      setToast("Copy the screenshot in CleanShot, then press ⌘V in Savers or drag it onto this page.");
    }
  }

  useEffect(() => {
    if (liveMode) return;
    const handlePaste = (event: ClipboardEvent) => {
      if (event.target instanceof Element && event.target.closest("input, textarea, [contenteditable='true']")) return;
      if (editingCardId || composer || tagEditorId || smartEditorId) return;
      const file = Array.from(event.clipboardData?.items || []).find((item) => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile();
      if (!file) return;
      event.preventDefault();
      void prepareComposerFile(new File([file], file.name || `CleanShot ${new Date().toISOString().slice(0, 10)}.png`, { type: file.type }));
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [editingCardId, composer, tagEditorId, smartEditorId, prepareComposerFile, liveMode]);

  async function saveComposer() {
    const nextTags = [...new Set(`${formTags},${formTagInput}`.split(",").map((tag) => tag.trim()).filter(Boolean))];
    if (liveMode) {
      if (liveSaving) return;
      if (composer === "collection" && !formTitle.trim()) { setFormError("Give your collection a name."); return; }
      let url: URL | undefined;
      if (composer === "link") {
        try {
          url = new URL(formUrl.trim());
          if (!/^https?:$/.test(url.protocol)) throw new Error("protocol");
        } catch { setFormError("Enter a full link beginning with https:// or http://."); return; }
      }
      if (composer === "image" && !formFile && !formUrl.trim()) { setFormError("Choose an image or enter its URL."); return; }
      if (composer !== "collection" && composer !== "link" && composer !== "image") { setFormError("This save type is still being connected."); return; }
      setLiveSaving(true);
      setFormError("");
      try {
        if (composer === "collection") {
          const imageGroup = collectionGroup === "images" || allCollections.find((item) => item.id === formCollection)?.group === "images";
          if (imageGroup) {
            const result = await liveRequest<{ collection: ImageCollection }>("/api/image-collections", "POST", { name: formTitle.trim(), parent_id: formCollection || null });
            setAllCollections((prev) => [liveImageCollection(result.collection), ...prev]);
            setSelectedCollection(result.collection.id);
          } else {
            const result = await liveRequest<{ collection: Collection }>("/api/collections", "POST", { name: formTitle.trim(), parent_id: formCollection || null });
            setAllCollections((prev) => [liveCollection(result.collection), ...prev]);
            setSelectedCollection(result.collection.id);
          }
          setToast("Collection saved to Savers");
        } else if (composer === "image") {
          const image = await liveUploadImage(formFile, formUrl.trim(), formCollection || null, formTitle.trim(), formNote.trim(), nextTags);
          setCards((prev) => [liveImage(image), ...prev]);
          setSelectedCollection(null);
          setFilter("all");
          setQuery("");
          setToast("Image saved to Savers");
        } else if (url) {
          const result = await liveRequest<{ bookmark: SavedBookmark }>("/api/bookmarks", "POST", { url: url.href, title: formTitle.trim() || null, notes: formNote.trim() || null, collection_id: formCollection || null, tags: nextTags });
          setCards((prev) => [liveCard(result.bookmark), ...prev]);
          setSelectedCollection(null);
          setFilter("all");
          setQuery("");
          setToast("Link saved. Creating its homepage image…");
        }
        setComposer(null);
        setDestination("library");
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "Could not save to Savers.");
      } finally { setLiveSaving(false); }
      return;
    }
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
          source: formFile?.name,
          collection: formCollection || undefined,
          date: "Just now",
          isPrivate: formPrivate,
          tags: nextTags,
          tone: "sage",
        },
        ...prev,
      ]);
    } else if (composer === "image" || composer === "file") {
      let remoteImage: URL | null = null;
      if (composer === "image" && formUrl.trim() && !formFile) {
        try {
          remoteImage = new URL(formUrl.trim());
          if (!/^https?:$/.test(remoteImage.protocol)) throw new Error("protocol");
        } catch {
          setFormError("Enter a full image URL beginning with https:// or http://.");
          return;
        }
      }
      if (!formFile && !remoteImage) {
        setFormError(composer === "image" ? "Choose an image or enter its URL." : "Choose a file first.");
        return;
      }
      if (formFile && formFile.size > 20_000_000) {
        setFormError("Choose a file under 20 MB.");
        return;
      }
      const fileData = formFile ? await fileDataUrl(formFile) : undefined;
      setCards((prev) => [
        {
          id: `local-${Date.now()}`,
          kind: composer,
          title: formTitle.trim() || formFile?.name || remoteImage?.pathname.split("/").filter(Boolean).pop() || remoteImage?.hostname || "Untitled image",
          description: formNote.trim() || undefined,
          source: formFile?.name || remoteImage?.hostname,
          url: remoteImage?.href,
          image: composer === "image" ? fileData || remoteImage?.href : undefined,
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
    if (liveMode) { setToast("Favorites are still being connected to your account."); return; }
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  async function togglePin(id: string) {
    if (!liveMode) { setPinnedIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]); setDetailMenuOpen(false); return; }
    try {
      const pinned = !pinnedIds.includes(id);
      await liveRequest<{ bookmark: SavedBookmark }>("/api/bookmarks", "PATCH", { id, pinned });
      setPinnedIds((ids) => pinned ? [...ids, id] : ids.filter((item) => item !== id));
      setDetailMenuOpen(false);
      setToast(pinned ? "Pinned" : "Unpinned");
    } catch (error) { setToast(error instanceof Error ? error.message : "Could not update pin"); }
  }

  function openCardEditor(card: PreviewCard) {
    setEditingCardId(card.id);
    setEditNewCollectionOpen(false);
    setEditNewCollectionName("");
    setEditTitle(card.title);
    setEditDescription(card.description || "");
    setEditNote(card.note || "");
    setEditUrl(card.url || "");
    setEditImage(card.image || "");
    setEditCollection(card.collection || "");
    setEditTags((card.tags || []).join(", "));
    setEditPrivate(card.isPrivate !== false);
    setDetailMenuOpen(false);
  }

  async function createEditCollection() {
    const name = editNewCollectionName.trim();
    if (!name || !editingCardId) return;
    if (liveMode) {
      try {
        const imageGroup = cards.find((item) => item.id === editingCardId)?.kind === "image";
        if (imageGroup) {
          const result = await liveRequest<{ collection: ImageCollection }>("/api/image-collections", "POST", { name, parent_id: null });
          setAllCollections((items) => [...items, liveImageCollection(result.collection)]);
          setEditCollection(result.collection.id);
        } else {
          const result = await liveRequest<{ collection: Collection }>("/api/collections", "POST", { name, parent_id: null });
          setAllCollections((items) => [...items, liveCollection(result.collection)]);
          setEditCollection(result.collection.id);
        }
        setEditNewCollectionOpen(false);
        setEditNewCollectionName("");
      } catch (error) { setToast(error instanceof Error ? error.message : "Could not create collection"); }
      return;
    }
    const card = cards.find((item) => item.id === editingCardId);
    const id = `local-${crypto.randomUUID()}`;
    setAllCollections((items) => [...items, { id, name, count: 0, group: card?.kind === "image" ? "images" : "links", isPrivate: editPrivate }]);
    setEditCollection(id);
    setEditNewCollectionOpen(false);
    setEditNewCollectionName("");
  }

  async function saveCardEdit() {
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
    const tags = [...new Set(editTags.split(",").map((tag) => tag.trim()).filter(Boolean))];
    if (liveMode) {
      try {
        const current = cards.find((item) => item.id === editingCardId);
        if (!current) throw new Error("Item not found");
        const updates: Record<string, unknown> = { id: editingCardId, title: editTitle.trim(), description: editDescription.trim(), notes: editNote.trim(), collection_id: editCollection || null, tags };
        if (current.kind === "link") {
          if (editUrl.trim() !== current.url) updates.url = editUrl.trim();
          if (editImage && editImage !== current.image) updates.og_image = editImage;
        }
        const updated = await liveUpdateCard(current, updates);
        setCards((items) => items.map((item) => item.id === editingCardId ? updated : item));
        setEditingCardId(null);
        setToast("Card saved");
      } catch (error) { setToast(error instanceof Error ? error.message : "Could not save card"); }
      return;
    }
    setCards((items) => items.map((item) => item.id === editingCardId ? { ...item, title: editTitle.trim(), description: editDescription.trim(), note: editNote.trim(), url: editUrl.trim(), source: source || item.source, image: editImage, collection: editCollection || undefined, tags, isPrivate: editPrivate } : item));
    setEditingCardId(null);
    setToast("Card updated in this browser preview");
  }

  async function replaceCardImage(file: File) {
    if (liveMode) { setToast("Image replacement is still being connected."); return; }
    if (file.size > 20_000_000) { setToast("Choose an image under 20 MB"); return; }
    setEditImage(await fileDataUrl(file));
  }

  async function retryCardImage(card: PreviewCard) {
    if (liveMode && card.kind === "link") {
      try {
        await liveUpdateCard(card, { preview_version: Date.now() });
        setCards((items) => items.map((item) => item.id === card.id ? { ...item, screenshotStatus: "pending" } : item));
        setToast("Refreshing homepage image…");
        setDetailMenuOpen(false);
      } catch (error) { setToast(error instanceof Error ? error.message : "Could not refresh image"); }
      return;
    }
    if (!card.image || card.image.startsWith("data:")) { setToast("No remote preview image to retry"); return; }
    const url = new URL(card.image, window.location.href);
    url.searchParams.set("savers_retry", String(Date.now()));
    setCards((items) => items.map((item) => item.id === card.id ? { ...item, image: url.toString() } : item));
    setDetailMenuOpen(false);
    setToast("Retried existing image. A new capture needs the preview service.");
  }

  async function chooseCollection(collectionId?: string) {
    if (liveMode && (collectionPickerCardId || libraryCollectionPickerOpen)) {
      const nextCollectionId = pickerCollectionId === collectionId ? null : collectionId || null;
      const ids = collectionPickerCardId ? [collectionPickerCardId] : selectedLibraryIds;
      try {
        const selected = cards.filter((item) => ids.includes(item.id));
        if (new Set(selected.map((item) => item.kind)).size > 1) throw new Error("Move links and images separately.");
        const updated = await Promise.all(selected.map((card) => liveUpdateCard(card, { collection_id: nextCollectionId })));
        const byId = new Map(updated.map((card) => [card.id, card]));
        setCards((items) => items.map((item) => byId.get(item.id) || item));
        setToast(nextCollectionId ? "Moved to collection" : "Moved to Unsorted");
        setLibrarySelecting(false);
        setSelectedLibraryIds([]);
        closeCollectionPicker();
      } catch (error) { setToast(error instanceof Error ? error.message : "Could not move items"); }
      return;
    }
    setPickerNewFolderOpen(false);
    setPickerNewFolderName("");
    if (collectionPickerCardId) {
      const card = [...cards, ...publicRelatedCards].find((item) => item.id === collectionPickerCardId);
      const nextCollectionId = card?.collection === collectionId ? undefined : collectionId;
      if (card?.owner) {
        setCards((items) => [{ ...card, id: `preview-${crypto.randomUUID()}`, originId: card.id, owner: undefined, savedFrom: card.owner, collection: nextCollectionId, isPrivate: true, date: "Just now" }, ...items]);
      } else {
        setCards((items) => items.map((item) => item.id === collectionPickerCardId ? { ...item, collection: nextCollectionId } : item));
      }
      setCollectionPickerCardId(null);
      setToast(nextCollectionId ? "Added to collection in this browser preview" : "Moved to Unsorted");
    } else if (libraryCollectionPickerOpen) {
      const nextCollectionId = pickerCollectionId === collectionId ? undefined : collectionId;
      setCards((items) => items.map((item) => selectedLibraryIds.includes(item.id) ? { ...item, collection: nextCollectionId } : item));
      setLibraryCollectionPickerOpen(false);
      setLibrarySelecting(false);
      setSelectedLibraryIds([]);
      setToast(nextCollectionId ? "Added to collection in this browser preview" : "Moved to Unsorted");
    } else {
      saveRelatedSelection(collectionId, true);
      return;
    }
    setRelatedCollectionQuery("");
  }

  function closeCollectionPicker() {
    setRelatedCollectionPickerOpen(false);
    setCollectionPickerCardId(null);
    setLibraryCollectionPickerOpen(false);
    setPickerNewFolderOpen(false);
    setPickerNewFolderName("");
    setRelatedCollectionQuery("");
  }

  async function createPickerFolder() {
    const name = pickerNewFolderName.trim();
    if (!name) return;
    if (liveMode) {
      try {
        let id: string;
        if (pickerKind === "image") {
          const result = await liveRequest<{ collection: ImageCollection }>("/api/image-collections", "POST", { name, parent_id: null });
          setAllCollections((items) => [...items, liveImageCollection(result.collection)]);
          id = result.collection.id;
        } else {
          const result = await liveRequest<{ collection: Collection }>("/api/collections", "POST", { name, parent_id: null });
          setAllCollections((items) => [...items, liveCollection(result.collection)]);
          id = result.collection.id;
        }
        setPickerNewFolderName("");
        setPickerNewFolderOpen(false);
        await chooseCollection(id);
      } catch (error) { setToast(error instanceof Error ? error.message : "Could not create collection"); }
      return;
    }
    const id = `local-${crypto.randomUUID()}`;
    setAllCollections((items) => [...items, { id, name, count: 0, group: pickerCard?.kind === "image" ? "images" : "links", isPrivate: true }]);
    setPickerNewFolderName("");
    setPickerNewFolderOpen(false);
    chooseCollection(id);
  }

  function createBulkFolder() {
    const name = bulkNewFolderName.trim();
    if (!name || !bulkImportFiles?.length) return;
    const parent = allCollections.find((item) => item.id === bulkImportCollection);
    const imageCount = bulkImportFiles.filter(({ file }) => file.type.startsWith("image/") || imageFilePattern.test(file.name)).length;
    const group = parent?.group || (imageCount > bulkImportFiles.length / 2 ? "images" : "links");
    const id = `local-${crypto.randomUUID()}`;
    setAllCollections((items) => [...items, { id, name, count: 0, parentId: parent?.id, group, isPrivate: bulkImportPrivate }]);
    setBulkImportCollection(id);
    setBulkNewFolderName("");
    setBulkNewFolderOpen(false);
  }

  async function deleteCollection() {
    if (!deleteCollectionId) return;
    const collection = allCollections.find((item) => item.id === deleteCollectionId);
    if (!collection || collection.owner) { setDeleteCollectionId(null); return; }
    if (liveMode) {
      try {
        const path = collection.group === "images" ? `/api/image-collections/${encodeURIComponent(collection.id)}` : `/api/collections?id=${encodeURIComponent(collection.id)}`;
        await liveRequest<{ ok: true }>(path, "DELETE", {});
        setCards((items) => items.map((item) => item.collection === collection.id ? { ...item, collection: undefined } : item));
        setAllCollections((items) => items.filter((item) => item.id !== collection.id));
        if (selectedCollection === collection.id) setSelectedCollection(null);
        setDeleteCollectionId(null);
        setToast("Collection removed; its links are in Unsorted");
      } catch (error) { setToast(error instanceof Error ? error.message : "Could not delete collection"); }
      return;
    }
    setCards((items) => items.map((item) => item.collection === collection.id ? { ...item, collection: undefined } : item));
    setAllCollections((items) => items.filter((item) => item.id !== collection.id).map((item) => item.parentId === collection.id ? { ...item, parentId: collection.parentId } : item));
    setSmartRules((rules) => { const next = { ...rules }; delete next[collection.id]; return next; });
    if (selectedCollection === collection.id) setSelectedCollection(null);
    if (bulkImportCollection === collection.id) setBulkImportCollection("");
    if (formCollection === collection.id) setFormCollection("");
    setDeleteCollectionId(null);
    setToast(`Deleted ${collection.name}. Its items are in Unsorted.`);
  }

  async function applyBulkTags() {
    const tag = bulkTagInput.trim();
    if (!tag) return;
    if (liveMode) {
      try {
        const selected = cards.filter((item) => selectedLibraryIds.includes(item.id));
        const updated = await Promise.all(selected.map((card) => liveUpdateCard(card, { tags: [...new Set([...(card.tags || []), tag])] })));
        const byId = new Map(updated.map((card) => [card.id, card]));
        setCards((items) => items.map((item) => byId.get(item.id) || item));
        setBulkTagOpen(false);
        setBulkTagInput("");
        setLibrarySelecting(false);
        setSelectedLibraryIds([]);
        setToast("Tags saved");
      } catch (error) { setToast(error instanceof Error ? error.message : "Could not save tags"); }
      return;
    }
    setCards((items) => items.map((item) => selectedLibraryIds.includes(item.id) && !(item.tags || []).some((value) => value.toLocaleLowerCase() === tag.toLocaleLowerCase()) ? { ...item, tags: [...(item.tags || []), tag] } : item));
    setBulkTagOpen(false);
    setBulkTagInput("");
    setLibrarySelecting(false);
    setSelectedLibraryIds([]);
    setToast("Tags added in this browser preview");
  }

  async function removeSelectedCards() {
    if (liveMode) {
      try {
        await Promise.all(cards.filter((item) => selectedLibraryIds.includes(item.id)).map(liveDeleteCard));
        setCards((items) => items.filter((item) => !selectedLibraryIds.includes(item.id)));
        setBulkRemoveOpen(false);
        setLibrarySelecting(false);
        setSelectedLibraryIds([]);
        setActiveCardId(null);
        setToast("Items removed from Savers");
      } catch (error) { setToast(error instanceof Error ? error.message : "Could not remove links"); }
      return;
    }
    setCards((items) => items.filter((item) => !selectedLibraryIds.includes(item.id)));
    setFavorites((ids) => ids.filter((id) => !selectedLibraryIds.includes(id)));
    setPinnedIds((ids) => ids.filter((id) => !selectedLibraryIds.includes(id)));
    setBulkRemoveOpen(false);
    setLibrarySelecting(false);
    setSelectedLibraryIds([]);
    setActiveCardId(null);
    setToast("Removed from this browser preview");
  }

  async function removeCard(id: string) {
    if (liveMode) {
      try {
        const current = cards.find((item) => item.id === id);
        if (!current) throw new Error("Item not found");
        await liveDeleteCard(current);
        setCards((items) => items.filter((item) => item.id !== id));
        if (activeCardId === id) setActiveCardId(null);
        setDeleteCardId(null);
        setToast("Item removed from Savers");
      } catch (error) { setToast(error instanceof Error ? error.message : "Could not remove link"); }
      return;
    }
    const next = cards.filter((item) => item.id !== id);
    captureCardsRef.current = next;
    setCards(next);
    void writePreviewCards(next).then(announcePreviewCardsChanged).catch(() => setToast("Browser storage could not keep this removal."));
    setFavorites((ids) => ids.filter((item) => item !== id));
    setPinnedIds((ids) => ids.filter((item) => item !== id));
    setSelectedLibraryIds((ids) => ids.filter((item) => item !== id));
    if (activeCardId === id) setActiveCardId(null);
    if (editingCardId === id) setEditingCardId(null);
    setDeleteCardId(null);
    setToast("Card removed from this browser preview");
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
    if (liveMode) { setToast("Public sharing is being connected."); return; }
    setCards((items) => items.map((item) => item.id === id ? { ...item, isPrivate: item.isPrivate === false } : item));
    setToast("Visibility updated in this preview");
  }

  async function toggleCollectionPrivacy(id: string) {
    if (liveMode) {
      const target = allCollections.find((item) => item.id === id);
      if (!target) return;
      try {
        const path = target.group === "images" ? "/api/image-collections/visibility" : "/api/collections/visibility";
        const result = await liveRequest<{ collection: { is_public: boolean; public_id: string | null; public_slug: string | null } }>(path, "PATCH", { id, is_public: target.isPrivate !== false });
        setAllCollections((items) => items.map((item) => item.id === id ? { ...item, isPrivate: !result.collection.is_public, publicId: result.collection.public_id || undefined, publicSlug: result.collection.public_slug || undefined } : item));
        setToast(result.collection.is_public ? "Collection is now public" : "Collection is now private");
      } catch (error) { setToast(error instanceof Error ? error.message : "Could not update visibility"); }
      return;
    }
    setAllCollections((items) => {
      const target = items.find((item) => item.id === id);
      if (!target) return items;
      const nextPrivate = target.isPrivate === false;
      const branch = new Set([id]);
      let foundChild = true;
      while (foundChild) {
        foundChild = false;
        for (const item of items) {
          if (item.parentId && branch.has(item.parentId) && !branch.has(item.id)) {
            branch.add(item.id);
            foundChild = true;
          }
        }
      }
      return items.map((item) => branch.has(item.id) ? { ...item, isPrivate: nextPrivate } : item);
    });
    setToast("Folder and subfolders updated in this preview");
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
            {previewImages.map((image, index) => <img key={image + index} src={image} alt="" loading="lazy" onError={(event) => event.currentTarget.setAttribute("data-failed", "true")} />)}
          </div>
          </button>
          {item.group === "smart" && <button className="rb-collection-preview-rules" onClick={() => openSmartEditor(item.id)}>Edit rules</button>}
          {!item.owner && <button className="rb-collection-preview-delete" onClick={() => setDeleteCollectionId(item.id)} aria-label={`Delete ${item.name} collection`} title="Delete collection"><Trash2 size={18} /></button>}
      </div>
    );
  }

  return (
    <div
      className={`rebuild-app ${theme === "dark" ? "rb-theme-dark" : ""} ${librarySelecting && destination === "library" ? "rb-library-selection-active" : ""}`}
      data-rebuild-root
      onDragEnterCapture={(event) => { if (!liveMode && acceptsPageDrop(event.dataTransfer)) setPageDragActive(true); }}
      onDragOverCapture={(event) => { if (!liveMode && acceptsPageDrop(event.dataTransfer)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setPageDragActive(true); } }}
      onDragLeaveCapture={(event) => { if (event.clientX <= 0 || event.clientX >= window.innerWidth || event.clientY <= 0 || event.clientY >= window.innerHeight) setPageDragActive(false); }}
      onDragEndCapture={() => setPageDragActive(false)}
      onDropCapture={(event) => { if (!liveMode && acceptsPageDrop(event.dataTransfer)) { event.preventDefault(); event.stopPropagation(); handlePageDrop(event.dataTransfer); } }}
    >
      {pageDragActive && <div className="rb-page-drop-cue" aria-hidden="true"><div><Upload size={28} /><strong>Drop to save</strong><span>Link, image, or file</span></div></div>}
      <input ref={multiImageInputRef} className="rb-hidden-file-input" type="file" accept="image/*" multiple aria-label="Choose images to add" onChange={(event) => { openBulkImport(Array.from(event.target.files || []).map((file) => ({ file, path: file.name }))); event.target.value = ""; }} />
      <input ref={folderInputRef} className="rb-hidden-file-input" type="file" multiple aria-label="Choose a folder to add" onChange={(event) => { openBulkImport(Array.from(event.target.files || []).map((file) => ({ file, path: file.webkitRelativePath || file.name }))); event.target.value = ""; }} />
      {(!liveMode || isStaging || readOnly) && <div className="rb-preview-flag">
        <span className="rb-pulse" /> {isStaging ? "Separate copy" : readOnly ? "Connected preview" : "Preview"}
        <span className="rb-flag-note">{isStaging ? "Links save to your private staging library" : readOnly ? "Your existing library · changes paused" : "Saves stay in this browser"}</span>
      </div>}

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
              aria-label={liveMode ? "Open account menu" : "Open preview menu"}
              aria-expanded={accountOpen}
            >
              RW
            </button>
            {accountOpen && (
              <div className="rb-account-menu">
                <div className="rb-account-title">
                  {isStaging ? "Your separate Savers copy" : liveMode ? "Your Savers library" : "Preview"}
                  <span>{isStaging ? "Private staging library" : liveMode ? "Saved to your account" : "Browser-local saves"}</span>
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
                <button onClick={() => { setDestination("discover"); setProfileId("self"); setProfileScope("cards"); setAccountOpen(false); setDiscoverTab("discover"); window.scrollTo(0, 0); }}>My profile</button>
                {!liveMode && <button onClick={() => { setAccountOpen(false); setCaptureOverlayOpen(true); }}>Browser capture <ArrowUpRight size={14} /></button>}
                {!liveMode && <button
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
                </button>}
                {isStaging && <a href="/downloads/savers-capture-macos-0.9.5.zip" download>Download Savers Capture <ArrowUpRight size={14} /></a>}
                {liveMode && <button onClick={() => { void getSupabaseBrowserClient().auth.signOut().then(() => window.location.assign("/rebuild")); }}>Sign out</button>}
                <a
                  href={liveMode && !isStaging && !readOnly ? "/legacy" : "https://savers-production.up.railway.app"}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {liveMode && !isStaging && !readOnly ? "Open old Savers" : "Open current Savers"} <ExternalLink size={14} />
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
                <button className="rb-heading-privacy" onClick={() => { void toggleCollectionPrivacy(collection.id); }} aria-label={`${collection.isPrivate === false ? "Make private" : "Make public"}${liveMode ? "" : " with subfolders"}: ${collection.name}`} title={`${collection.isPrivate === false ? "Lock" : "Unlock"} this folder${liveMode ? "" : " and subfolders"}`}>{collection.isPrivate === false ? <Unlock size={26} /> : <LockKeyhole size={26} />}</button>
                {liveMode && collection.isPrivate === false && (collection.publicSlug || collection.publicId) && <button className="rb-heading-privacy" onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}/c/${collection.publicSlug || collection.publicId}`).then(() => setToast("Public collection link copied")).catch(() => setToast("Could not copy link")); }} aria-label={`Copy public link for ${collection.name}`} title="Copy public collection link"><Copy size={22} /></button>}
              </div>
              {collection?.description && <p>{collection.description}</p>}
              {collection?.group === "smart" && <button className="rb-edit-rules" onClick={() => openSmartEditor(collection.id)}>Edit rules</button>}
            </div>}
            {collection && subcollections.length > 0 && <section className="rb-subfolder-section"><div className="rb-collection-preview-list">{subcollections.map(renderCollectionPreview)}</div></section>}
            <div className={`rb-library-toolbar ${collection ? "" : "rb-root-controls"}`}>
              <div className={`rb-filter-group ${filterHasMore ? "rb-filter-fade-right" : ""}`} ref={filterRef} data-scroll-fade="x">
                {(["all", "favorites", "link", "social", "image", "note", "file"] as Filter[]).map(
                  (kind) => (
                    <div className={`rb-filter-entry ${kind === "social" ? "rb-filter-entry-social" : ""} ${kind === "social" && socialExpanded ? "expanded" : ""}`} key={kind}>
                      <button
                        className={filter === kind || (kind === "social" && ["substack", "youtube", "x"].includes(filter)) ? "active" : ""}
                        onClick={() => {
                          if (kind === "social") {
                            setFilter("social");
                            setSocialExpanded((open) => !open);
                          } else {
                            setFilter(kind);
                            setSocialExpanded(false);
                          }
                        }}
                        aria-expanded={kind === "social" ? socialExpanded : undefined}
                        aria-controls={kind === "social" ? "rb-social-sources" : undefined}
                      >
                        {kind === "all" ? <Grid2X2 size={18} /> : kind === "favorites" ? <Heart size={18} /> : kind === "social" ? <UsersRound size={18} /> : (() => { const Icon = icons[kind as CardKind]; return <Icon size={18} />; })()}
                        {kind === "all" ? "All" : kind === "favorites" ? <>Favorites <span className="rb-filter-count">{favorites.length}</span></> : kind === "social" ? "Social" : `${typeLabels[kind as CardKind]}s`}
                        {kind === "social" && <ChevronRight className="rb-filter-chevron" size={18} />}
                      </button>
                      {kind === "social" && socialExpanded && (
                        <div className="rb-filter-suboptions" id="rb-social-sources" role="group" aria-label="Social sources">
                          {(["substack", "youtube", "x"] as Filter[]).map((source) => <button key={source} className={filter === source ? "active" : ""} onClick={() => setFilter(source)}>{source === "x" ? "X" : source === "youtube" ? "YouTube" : "Substack"}</button>)}
                        </div>
                      )}
                    </div>
                  ),
                )}
              </div>
              <div className="rb-toolbar-end">
                <span>
                  {!liveMode && seedCards.length === 0 && !query && !selectedTag && filter === "all"
                    ? `${collection ? displayCount(collection) ?? "—" : 815}`
                    : filteredCards.length}
                </span>
                <div className="rb-size-wrap rb-toolbar-menu-wrap">
                  <button className={`rb-small-icon rb-size-trigger ${sizeOpen ? "selected" : ""}`} onClick={() => { setSizeOpen((open) => !open); setSortOpen(false); setViewOpen(false); }} aria-label={`Thumbnail size: ${cardSize.toUpperCase()}`} aria-expanded={sizeOpen} title="Thumbnail size">{cardSize.toUpperCase()}</button>
                  {sizeOpen && <div className="rb-toolbar-menu" role="group" aria-label="Thumbnail size">
                    {(["s", "m", "l", "xl"] as const).map((size) => <button key={size} onClick={() => { setCardSize(size); setListMode(false); setSizeOpen(false); }}>{size.toUpperCase()}{cardSize === size && <Check size={17} aria-label="Selected" />}</button>)}
                  </div>}
                </div>
                <div className="rb-sort-wrap rb-toolbar-menu-wrap">
                  <button
                    className={`rb-small-icon ${sortOpen ? "selected" : ""}`}
                    onClick={() => { setSortOpen(!sortOpen); setSizeOpen(false); setViewOpen(false); }}
                    aria-label="Sort cards"
                    aria-expanded={sortOpen}
                  >
                    <SlidersHorizontal size={17} />
                  </button>
                  {sortOpen && (
                    <div className="rb-toolbar-menu" role="group" aria-label="Card order">
                      <button
                        onClick={() => {
                          setSortNewest(true);
                          setSortOpen(false);
                        }}
                      >
                        Export order {sortNewest && <Check size={17} aria-label="Selected" />}
                      </button>
                      <button
                        onClick={() => {
                          setSortNewest(false);
                          setSortOpen(false);
                        }}
                      >
                        Reverse order {!sortNewest && <Check size={17} aria-label="Selected" />}
                      </button>
                    </div>
                  )}
                </div>
                <div className="rb-view-wrap rb-toolbar-menu-wrap">
                  <button className={`rb-small-icon ${viewOpen ? "selected" : ""}`} onClick={() => { setViewOpen((open) => !open); setSizeOpen(false); setSortOpen(false); }} aria-label={`View: ${listMode ? "List" : "Grid"}`} aria-expanded={viewOpen} title="Card view">{listMode ? <List size={18} /> : <Grid2X2 size={18} />}</button>
                  {viewOpen && <div className="rb-toolbar-menu" role="group" aria-label="Card view">
                    <button onClick={() => { setListMode(false); setViewOpen(false); }}><span className="rb-view-option-label"><Grid2X2 size={18} /> Grid</span>{!listMode && <Check size={17} aria-label="Selected" />}</button>
                    <button onClick={() => { setListMode(true); setViewOpen(false); }}><span className="rb-view-option-label"><List size={18} /> List</span>{listMode && <Check size={17} aria-label="Selected" />}</button>
                  </div>}
                </div>
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
                    onEdit={() => openCardEditor(card)}
                    onEditTags={() => openTagEditor(card)}
                    onAddToCollection={() => { setRelatedCollectionQuery(""); setCollectionPickerCardId(card.id); }}
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
                <h2>{filter === "favorites" && favorites.length === 0 ? "No favorites yet" : liveMode && cards.length === 0 ? "Your library is empty" : seedCards.length === 0 && !query ? "Items are being imported" : "No matches"}</h2>
                {filter === "favorites" && favorites.length === 0 && <p>Use the heart on a card to add one.</p>}
                {liveMode && cards.length === 0 ? <p>Save a link to start your Savers library.</p> : seedCards.length === 0 && !query && <p>The collection structure is ready for review.</p>}
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
                    <Tag size={20} /><span>{tag.name}</span><span>{tag.count}</span>
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
                <div className="rb-discover-tabs">
                  <button className={discoverTab === "following" ? "active" : ""} aria-pressed={discoverTab === "following"} onClick={() => setDiscoverTab((tab) => tab === "following" ? "discover" : "following")}>Following</button>
                </div>
                <button className="rb-feed-select" onClick={() => { setRelatedSelecting((value) => !value); setSelectedRelatedIds([]); }}>{relatedSelecting ? "Done" : "Select"}</button>
              </div>
            )}
            {profileId && profileScope === "collections" ? (profileCollections.length ? <div className="rb-profile-collections">{profileCollections.map((item) => <button key={item.id} onClick={() => { setDestination("collections"); setSelectedCollection(item.id); setProfileId(null); window.scrollTo(0, 0); }}><Folder size={25} /><span>{item.name}</span><ArrowRight size={20} /></button>)}</div> : <div className="rb-empty rb-discover-empty"><Folder size={28} /><h2>No public collections yet</h2></div>) : discoverCards.length > 0 ? <div className="rb-discover-grid">
              {discoverCards.slice(0, visibleCount).map((item) => <CardTile key={item.id} card={item} favorite={favorites.includes(item.id)} onToggleFavorite={item.owner ? undefined : () => toggleFavorite(item.id)} onEdit={item.owner ? undefined : () => openCardEditor(item)} onEditTags={item.owner ? undefined : () => openTagEditor(item)} onAddToCollection={() => { setRelatedCollectionQuery(""); setCollectionPickerCardId(item.id); }} onOpenOwner={item.owner ? () => { setProfileId(item.owner!.id); window.scrollTo(0, 0); } : undefined} selecting={relatedSelecting} selected={selectedRelatedIds.includes(item.id)} onSelect={() => setSelectedRelatedIds((ids) => ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id])} onOpen={() => setActiveCardId(item.id)} />)}
            </div> : <div className="rb-empty rb-discover-empty"><UsersRound size={28} /><h2>{profileId ? "No public cards" : discoverTab === "following" ? "No cards from followed accounts yet" : "No public cards to discover yet"}</h2></div>}
            {(!profileId || profileScope === "cards") && discoverCards.length > visibleCount && <button className="rb-load-more" onClick={() => setVisibleCount((count) => count + 48)}>Show more <ArrowRight size={16} /></button>}
          </section>
        )}

        {destination === "inbox" && (
          <section className="rb-inbox-page">
            <div className="rb-inbox-tabs" role="group" aria-label="Inbox view">
              {(["activity", "following", "subscriptions", "review"] as const).map((tab) => tab === "subscriptions" ? (
                <div className={`rb-inbox-subscription-entry ${subscriptionEntryOpen && inboxTab === "subscriptions" ? "expanded" : ""}`} key={tab}>
                  <button className={inboxTab === tab ? "active" : ""} onClick={() => { setInboxTab("subscriptions"); setSubscriptionEntryOpen((open) => inboxTab === "subscriptions" ? !open : true); setSubscriptionError(""); }} aria-expanded={inboxTab === "subscriptions" && subscriptionEntryOpen} aria-controls="rb-subscription-entry-form">Subscriptions <ChevronRight size={18} /></button>
                  {inboxTab === "subscriptions" && subscriptionEntryOpen && <form id="rb-subscription-entry-form" onSubmit={(event) => { event.preventDefault(); addSubscription(); }}><input value={subscriptionInput} onChange={(event) => { setSubscriptionInput(event.target.value); setSubscriptionError(""); }} placeholder="Site or feed URL" aria-label="Site or feed URL" autoFocus /><button type="submit" aria-label="Add source"><Plus size={18} /><span>Add source</span></button></form>}
                </div>
              ) : <button key={tab} className={inboxTab === tab ? "active" : ""} onClick={() => { setInboxTab(tab); setSubscriptionEntryOpen(false); setSubscriptionError(""); }}>{tab === "activity" ? "Activity" : tab === "following" ? "Following" : "Review"}{tab === "review" && <span>{unsortedCards.length}</span>}</button>)}
            </div>
            {inboxTab === "activity" && <div className="rb-empty rb-inbox-empty"><InboxIcon size={28} /><h2>No follower activity yet</h2></div>}
            {inboxTab === "following" && (followingCards.length ? <div className="rb-discover-grid">{followingCards.filter((item) => `${item.title} ${item.owner?.name || ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0, visibleCount).map((item) => <CardTile key={item.id} card={item} onOpenOwner={() => { setDestination("discover"); setProfileId(item.owner!.id); }} onOpen={() => setActiveCardId(item.id)} />)}</div> : <div className="rb-empty rb-inbox-empty"><UsersRound size={28} /><h2>No cards from followed accounts yet</h2><button onClick={() => navigate("discover")}>Open Discover <ArrowRight size={18} /></button></div>)}
            {inboxTab === "subscriptions" && <div className="rb-subscriptions">
              {subscriptionError && <p role="alert">{subscriptionError}</p>}
              {subscriptions.length ? <div className="rb-subscription-list">{subscriptions.map((source) => <div key={source}><Link2 size={19} /><a href={source} target="_blank" rel="noopener noreferrer">{source}</a><button onClick={() => setSubscriptions((items) => items.filter((item) => item !== source))} aria-label={`Remove ${source}`}><X size={19} /></button></div>)}</div> : <div className="rb-empty rb-inbox-empty"><Link2 size={28} /><h2>No sources added yet</h2></div>}
              {subscriptions.length > 0 && <p>Live feed checks will connect with account data.</p>}
            </div>}
            {inboxTab === "review" && (unsortedCards.length ? <><div className="rb-discover-grid">{unsortedCards.slice(0, visibleCount).map((item) => <CardTile key={item.id} card={item} onToggleFavorite={() => toggleFavorite(item.id)} onEdit={() => openCardEditor(item)} onEditTags={() => openTagEditor(item)} onAddToCollection={() => { setRelatedCollectionQuery(""); setCollectionPickerCardId(item.id); }} favorite={favorites.includes(item.id)} onOpen={() => setActiveCardId(item.id)} />)}</div>{unsortedCards.length > visibleCount && <button className="rb-load-more" onClick={() => setVisibleCount((count) => count + 48)}>Show more <ArrowRight size={16} /></button>}</> : <div className="rb-empty rb-inbox-empty"><Check size={28} /><h2>Nothing to review</h2></div>)}
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

      {captureOverlayOpen && <div className="rb-following-backdrop" role="dialog" aria-modal="true" aria-label="Browser capture" onMouseDown={(event) => { if (event.target === event.currentTarget) setCaptureOverlayOpen(false); }}>
        <div className="rb-capture-panel">
          <div className="rb-following-head"><h2>Browser capture</h2><OverlayCloseButton label="Close browser capture" onClick={() => setCaptureOverlayOpen(false)} /></div>
          <div className="rb-capture-content" data-scroll-fade="y">
            <p>Save pages, images, links, text, and screenshots as you browse. Captures go to this browser’s Savers preview.</p>
            <a className="rb-capture-download" href="/downloads/savers-rebuild-capture-0.2.1.zip" download>Download extension <ArrowUpRight size={18} /></a>
            <span className="rb-capture-version">Version 0.2.1 · Chrome</span>
            <div className="rb-capture-columns">
              <section><h3>Capture</h3><p><strong>Page</strong>Click the Savers toolbar icon.</p><p><strong>Image or link</strong>Right-click it, then choose Save to Savers.</p><p><strong>Selected text</strong>Use the Save text chip or right-click menu.</p><p><strong>CleanShot screenshot</strong>Copy it and press ⌘V in Savers, or drag it onto the page.</p></section>
              <section><h3>Set up</h3><p><strong>1 · Extract the ZIP</strong>Keep the extension folder together.</p><p><strong>2 · Open chrome://extensions</strong>Switch on Developer mode.</p><p><strong>3 · Load unpacked</strong>Select the savers-rebuild-capture folder.</p><p><strong>4 · Open Savers</strong>Leave the preview open in a Chrome tab.</p></section>
            </div>
          </div>
        </div>
      </div>}

      {followingOverlayOpen && <div className="rb-following-backdrop" role="dialog" aria-modal="true" aria-label={`${profileName} following`} onMouseDown={(event) => { if (event.target === event.currentTarget) setFollowingOverlayOpen(false); }}>
        <div className="rb-following-panel">
          <div className="rb-following-head"><h2>Following</h2><OverlayCloseButton label="Close following" onClick={() => setFollowingOverlayOpen(false)} /></div>
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
            <button onClick={() => openComposer("image")}>
              <ImageIcon size={18} /> Upload an image <ArrowRight size={15} />
            </button>
            {!liveMode && <><button onClick={() => openComposer("note")}>
              <FileText size={18} /> Write a note <ArrowRight size={15} />
            </button>
            <button onClick={() => multiImageInputRef.current?.click()}>
              <ImageIcon size={18} /> Add multiple images <ArrowRight size={15} />
            </button>
            <button onClick={() => { setCreateOpen(false); void pasteImageFromClipboard(); }}>
              <Copy size={18} /> Paste screenshot <ArrowRight size={15} />
            </button>
            <button onClick={() => folderInputRef.current?.click()}>
              <FolderPlus size={18} /> Add a folder <ArrowRight size={15} />
            </button>
            <button onClick={() => openComposer("file")}>
              <Upload size={18} /> Upload a file <ArrowRight size={15} />
            </button></>}
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

      {bulkImportFiles && <div className="rb-rule-overlay rb-bulk-import-backdrop" role="dialog" aria-modal="true" aria-label="Add files" onMouseDown={(event) => { if (!bulkImportBusy && event.target === event.currentTarget) setBulkImportFiles(null); }}>
        <div className="rb-bulk-import-panel">
          <div className="rb-bulk-import-head"><h2>Add {bulkImportFiles.length} item{bulkImportFiles.length === 1 ? "" : "s"}</h2><OverlayCloseButton label="Close import" onClick={() => setBulkImportFiles(null)} disabled={bulkImportBusy} /></div>
          <p>Images, readable documents, and other files will be added to your browser preview. Folder names become collections.</p>
          <div className="rb-bulk-import-list">{bulkImportFiles.slice(0, 4).map((item, index) => <span key={`${item.path}-${index}`}>{item.path}</span>)}{bulkImportFiles.length > 4 && <span>+ {bulkImportFiles.length - 4} more</span>}</div>
          <label>Into collection<select value={bulkImportCollection} onChange={(event) => setBulkImportCollection(event.target.value)}><option value="">Top level</option>{allCollections.filter((item) => item.group !== "smart").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          {bulkNewFolderOpen ? <form className="rb-new-folder-form" onSubmit={(event) => { event.preventDefault(); createBulkFolder(); }}><input value={bulkNewFolderName} onChange={(event) => setBulkNewFolderName(event.target.value)} placeholder="Folder name" aria-label="New folder name" autoFocus /><button type="submit" disabled={!bulkNewFolderName.trim()}>Create</button><button type="button" onClick={() => { setBulkNewFolderOpen(false); setBulkNewFolderName(""); }} aria-label="Cancel new folder"><X size={18} /></button></form> : <button className="rb-new-folder-trigger" onClick={() => setBulkNewFolderOpen(true)} disabled={bulkImportBusy}><FolderPlus size={18} /> New folder</button>}
          <button className="rb-bulk-import-privacy" role="switch" aria-checked={bulkImportPrivate} onClick={() => setBulkImportPrivate((value) => !value)} disabled={bulkImportBusy}>{bulkImportPrivate ? <LockKeyhole size={18} /> : <Unlock size={18} />}{bulkImportPrivate ? "Private" : "Public"}</button>
          {bulkImportBusy && <p role="status">Adding {bulkImportProgress} of {bulkImportFiles.length}…</p>}
          {bulkImportError && <p className="rb-form-error" role="alert">{bulkImportError}</p>}
          <div className="rb-bulk-import-actions"><button onClick={() => setBulkImportFiles(null)} disabled={bulkImportBusy}>Cancel</button><button onClick={() => void importBulkFiles()} disabled={bulkImportBusy}>Add items <ArrowRight size={18} /></button></div>
        </div>
      </div>}

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
            <div>
              {activeCardIsOwn && !liveMode && <button onClick={() => togglePrivacy(activeCard.id)} aria-label={activeCard.isPrivate === false ? "Make private" : "Make public"} title={activeCard.isPrivate === false ? "Public in this preview" : "Private in this preview"}>
                {activeCard.isPrivate === false ? <Unlock size={19} /> : <LockKeyhole size={19} />}
              </button>}
              {activeCardIsOwn && !liveMode && <button
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
                  {activeCard.kind === "link" && <button onClick={() => void retryCardImage(activeCard)}><RefreshCw size={16} /> {liveMode ? "Refresh homepage image" : "Reload preview"}</button>}
                  {activeCard.kind === "link" && <button onClick={() => void togglePin(activeCard.id)}><Pin size={16} /> {pinnedIds.includes(activeCard.id) ? "Unpin" : "Pin"}</button>}
                  {activeCard.kind === "file" && activeCard.fileData && <button onClick={() => void convertFileCardToNote(activeCard)}><FileText size={16} /> Convert to note</button>}
                  {!liveMode && activeCard.url && <button onClick={() => { setCards((items) => items.map((item) => item.id === activeCard.id ? { ...item, linkStatus: item.linkStatus === "broken" ? "working" : "broken" } : item)); setDetailMenuOpen(false); }}><CheckCircle2 size={16} /> {activeCard.linkStatus === "broken" ? "Mark as working" : "Mark as broken"}</button>}
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(
                        activeCard.url || (activeCard.kind === "note" ? activeCard.description || activeCard.title : activeCard.title),
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
                    setToast(liveMode ? "Private link copied" : "Preview link copied. It requires preview access.");
                    setDetailMenuOpen(false);
                  }}><Link2 size={16} /> Copy preview link</button>
                  <button
                    onClick={() => {
                      setSelectedLibraryIds([activeCard.id]);
                      setBulkRemoveOpen(true);
                      setDetailMenuOpen(false);
                    }}
                  >
                    {liveMode ? "Remove from Savers" : "Remove from preview"}
                  </button></>}
                </div>
              )}
            </div>
            <OverlayCloseButton label="Close item" onClick={closeDetail} />
          </div>
          <div className="rb-detail-content">
            <span className="rb-detail-kind">{typeLabels[activeCard.kind]}{activeCard.linkStatus === "broken" && <span className="rb-broken-marker">Marked broken</span>}</span>
            <h1>{activeCard.title}</h1>
            {activeCard.description && (
              <p className={`rb-detail-description ${activeCard.kind === "note" ? "rb-note-body" : ""}`}>{activeCard.description}</p>
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
              <div className="rb-related-heading">
                <h2>Related</h2>
                <button className={`rb-related-sort-trigger ${relatedSortOpen ? "active" : ""}`} onClick={() => setRelatedSortOpen((open) => !open)} aria-label="Sort and filter related cards" aria-expanded={relatedSortOpen} title="Sort and filter related cards"><SlidersHorizontal size={19} /></button>
                {relatedSortOpen && <div className="rb-related-sort-menu" role="group" aria-label="Related card options">
                  <span>Sort by</span>
                  {([ ["relevant", "Most relevant"], ["library", "Library order"], ["reverse", "Reverse order"] ] as const).map(([value, label]) => <button key={value} className={relatedSort === value ? "selected" : ""} onClick={() => setRelatedSort(value)}><span className="rb-related-option-mark">{relatedSort === value && <Check size={14} />}</span>{label}</button>)}
                  <span>Filter</span>
                  <button className={relatedMineOnly ? "selected" : ""} onClick={() => setRelatedMineOnly((value) => !value)}><span className="rb-related-option-mark">{relatedMineOnly && <Check size={14} />}</span>In my library</button>
                  <span>Media type</span>
                  {([ ["all", "All types"], ["link", "Links"], ["image", "Images"], ["note", "Notes"], ["file", "Files"] ] as const).map(([value, label]) => <button key={value} className={relatedKind === value ? "selected" : ""} onClick={() => setRelatedKind(value)}><span className="rb-related-option-mark">{relatedKind === value && <Check size={14} />}</span>{label}</button>)}
                  <div className="rb-related-sort-actions"><button onClick={() => { setRelatedSort("relevant"); setRelatedMineOnly(false); setRelatedKind("all"); }}>Clear</button><button onClick={() => setRelatedSortOpen(false)}>Done</button></div>
                </div>}
              </div>
              <div className="rb-related-stack">
                {visibleRelatedCards.slice(0, 4).map((item) => (
                  <CardTile key={item.id} card={item} onToggleFavorite={item.owner ? undefined : () => toggleFavorite(item.id)} onEdit={item.owner ? undefined : () => openCardEditor(item)} onEditTags={item.owner ? undefined : () => openTagEditor(item)} onAddToCollection={() => { setRelatedCollectionQuery(""); setCollectionPickerCardId(item.id); }} favorite={favorites.includes(item.id)} onOpen={() => { setActiveCardId(item.id); setDetailMenuOpen(false); }} />
                ))}
              </div>
              {!visibleRelatedCards.length && <p className="rb-related-empty">No related cards match these filters.</p>}
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
            <div className="rb-related-feed-tabs" role="group" aria-label="Related card source">
              {(["all", "yours", "others"] as const).map((scope) => <button key={scope} className={relatedScope === scope ? "active" : ""} onClick={() => setRelatedScope(scope)}>{scope === "all" ? "All" : scope === "yours" ? "Yours" : "Others"}</button>)}
            </div>
            <div className="rb-related-feed-actions">
              <button className="rb-related-select-toggle" onClick={() => { setRelatedSelecting((value) => !value); setSelectedRelatedIds([]); }}>{relatedSelecting ? "Done" : "Select"}</button>
              <OverlayCloseButton label="Close related cards" onClick={() => { setRelatedFeedOpen(false); setRelatedSelecting(false); setSelectedRelatedIds([]); }} />
            </div>
          </div>
          <div className="rb-related-feed-grid">
            {visibleRelatedCards.filter((item) => relatedScope === "all" || (relatedScope === "others" ? !!item.owner : !item.owner)).map((item) => (
              <CardTile key={item.id} card={item} onToggleFavorite={item.owner ? undefined : () => toggleFavorite(item.id)} onEdit={item.owner ? undefined : () => openCardEditor(item)} onEditTags={item.owner ? undefined : () => openTagEditor(item)} onAddToCollection={() => { setRelatedCollectionQuery(""); setCollectionPickerCardId(item.id); }} favorite={favorites.includes(item.id)} selecting={relatedSelecting} selected={selectedRelatedIds.includes(item.id)} onSelect={() => setSelectedRelatedIds((ids) => ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id])} onOpen={() => { setActiveCardId(item.id); setRelatedFeedOpen(false); setDetailMenuOpen(false); }} />
            ))}
          </div>
          {relatedScope === "others" && !relatedCards.some((item) => item.owner) && <p className="rb-related-feed-empty">No public cards from other accounts yet.</p>}
          {!visibleRelatedCards.some((item) => relatedScope === "all" || (relatedScope === "others" ? !!item.owner : !item.owner)) && (relatedScope !== "others" || relatedCards.some((item) => item.owner)) && <p className="rb-related-feed-empty">No cards match the related filters.</p>}
        </div>
        </div>
      )}

      {relatedSelecting && selectedRelatedIds.length > 0 && (relatedFeedOpen || destination === "discover") && <div className="rb-related-selection-bar">
        <span>{selectedRelatedIds.length} selected</span>
        {selectedRelatedCards.some((item) => item.owner) && <button onClick={() => saveRelatedSelection()}><Plus size={19} /> Save</button>}
        <button onClick={() => { setRelatedCollectionQuery(""); setRelatedCollectionPickerOpen(true); }}><Folder size={19} /> Add to collection</button>
      </div>}
      {(relatedCollectionPickerOpen || collectionPickerCardId || libraryCollectionPickerOpen) && <div className="rb-related-picker-backdrop" role="dialog" aria-modal="true" aria-label="Choose collection" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCollectionPicker(); }}>
            <div className="rb-related-picker">
              <div className="rb-related-picker-head"><input value={relatedCollectionQuery} onChange={(event) => setRelatedCollectionQuery(event.target.value)} placeholder="Find a collection" aria-label="Find a collection" autoFocus /><OverlayCloseButton label="Close collection picker" onClick={closeCollectionPicker} /></div>
              <div className="rb-related-picker-list" data-scroll-fade="y">
                {!pickerCollectionId && <button className="rb-picker-target" onClick={() => chooseCollection(undefined)}><Folder size={20} /><span>Unsorted</span><ArrowRight className="rb-picker-plus" size={21} /></button>}
                {pickerCollections.map((item) => <button className={`rb-picker-target ${pickerCollectionId === item.id ? "selected" : ""}`} key={item.id} onClick={() => chooseCollection(item.id)} aria-pressed={pickerCollectionId === item.id}><Folder size={20} /><span>{item.name}{item.isPrivate !== false && <LockKeyhole size={16} aria-label="Private" />}</span>{pickerCollectionId === item.id ? <Check size={21} /> : <Plus className="rb-picker-plus" size={21} />}</button>)}
                {pickerCollectionId && <button className="rb-picker-target" onClick={() => chooseCollection(undefined)}><Folder size={20} /><span>Unsorted</span><ArrowRight className="rb-picker-plus" size={21} /></button>}
              </div>
              <div className="rb-related-picker-footer">{pickerNewFolderOpen ? <form className="rb-new-folder-form" onSubmit={(event) => { event.preventDefault(); createPickerFolder(); }}><input value={pickerNewFolderName} onChange={(event) => setPickerNewFolderName(event.target.value)} placeholder="Folder name" aria-label="New folder name" autoFocus /><button type="submit" disabled={!pickerNewFolderName.trim()}>Create</button><button type="button" onClick={() => { setPickerNewFolderOpen(false); setPickerNewFolderName(""); }} aria-label="Cancel new folder"><X size={18} /></button></form> : <button className="rb-new-folder-trigger" onClick={() => setPickerNewFolderOpen(true)}><FolderPlus size={20} /> New folder</button>}</div>
            </div>
      </div>}

      {deleteCollectionId && <div className="rb-delete-collection-backdrop" role="dialog" aria-modal="true" aria-label="Delete collection" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteCollectionId(null); }}><div className="rb-delete-collection-panel"><div className="rb-confirm-head"><h2>Delete {allCollections.find((item) => item.id === deleteCollectionId)?.name}?</h2><OverlayCloseButton label="Close delete collection confirmation" onClick={() => setDeleteCollectionId(null)} /></div><p>Items in this collection will move to Unsorted. Subfolders will move up one level.</p><div className="rb-confirm-actions"><button onClick={() => setDeleteCollectionId(null)}>Cancel</button><button onClick={deleteCollection}><Trash2 size={18} /> Delete collection</button></div></div></div>}

      {smartEditorId && (
        <div className="rb-rule-overlay" role="dialog" aria-modal="true" aria-label={`Edit rules for ${smartEditorCollection?.name || "smart collection"}`}>
          <div className="rb-rule-panel" data-scroll-fade="y">
            <div className="rb-rule-head">
              <div><span>Smart collection</span><h2>{smartEditorCollection?.name}</h2></div>
              <OverlayCloseButton label="Close rule editor" onClick={() => setSmartEditorId(null)} />
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
        <div className="rb-rule-overlay" role="dialog" aria-modal="true" aria-label={`Edit tags for ${tagEditorCard.title}`} onMouseDown={(event) => { if (event.target === event.currentTarget) setTagEditorId(null); }}>
          <div className="rb-tag-editor" data-scroll-fade="y">
            <div className="rb-rule-head">
              <div><span>Tags</span><h2>{tagEditorCard.title}</h2></div>
              <OverlayCloseButton label="Close tag editor" onClick={() => setTagEditorId(null)} />
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
        <div className="rb-edit-panel">
          <div className="rb-edit-head"><h2>Edit card</h2><OverlayCloseButton label="Close editor" onClick={() => setEditingCardId(null)} /></div>
          <div className="rb-edit-fields" data-scroll-fade="y">
          <label>Title<input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} autoFocus /></label>
          {(!liveMode || cards.find((item) => item.id === editingCardId)?.kind === "link") && <label>Link<input type="url" value={editUrl} onChange={(event) => setEditUrl(event.target.value)} /></label>}
          <label>Description<textarea rows={3} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} /></label>
          <label>Note<textarea rows={3} value={editNote} onChange={(event) => setEditNote(event.target.value)} /></label>
          <div className="rb-edit-collection-field"><label>Collection<div className="rb-edit-collection-select"><select value={editCollection} onChange={(event) => setEditCollection(event.target.value)}><option value="">Unsorted</option>{allCollections.filter((item) => item.group !== "smart" && (!liveMode || item.group === (cards.find((card) => card.id === editingCardId)?.kind === "image" ? "images" : "links"))).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={24} aria-hidden="true" /></div></label>{editNewCollectionOpen ? <form className="rb-new-folder-form" onSubmit={(event) => { event.preventDefault(); createEditCollection(); }}><input value={editNewCollectionName} onChange={(event) => setEditNewCollectionName(event.target.value)} placeholder="Collection name" aria-label="New collection name" autoFocus /><button type="submit" disabled={!editNewCollectionName.trim()}>Create</button><button type="button" onClick={() => { setEditNewCollectionOpen(false); setEditNewCollectionName(""); }} aria-label="Cancel new collection"><X size={18} /></button></form> : <button className="rb-new-folder-trigger" onClick={() => setEditNewCollectionOpen(true)}><FolderPlus size={18} /> New collection</button>}</div>
          <label>Tags<input value={editTags} onChange={(event) => setEditTags(event.target.value)} placeholder="Separate tags with commas" /></label>
          {!liveMode && <><label>Preview image<input type="url" value={editImage.startsWith("data:") ? "" : editImage} onChange={(event) => setEditImage(event.target.value)} placeholder="Image URL" /></label>
          <label className="rb-edit-upload"><Upload size={18} /> Replace with an image from your computer<input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void replaceCardImage(file); }} /></label></>}
          </div>
          <div className="rb-edit-footer">
            <div className="rb-edit-footer-start">
              {liveMode ? <span className="rb-edit-privacy"><LockKeyhole size={18} /> Private</span> : <button className="rb-edit-privacy" role="switch" aria-checked={editPrivate} onClick={() => setEditPrivate((value) => !value)}>{editPrivate ? <LockKeyhole size={18} /> : <Unlock size={18} />}{editPrivate ? "Private" : "Public"}</button>}
              <button className="rb-edit-remove" onClick={() => setDeleteCardId(editingCardId)}><Trash2 size={17} /> Remove</button>
            </div>
            <div className="rb-edit-actions"><button onClick={() => setEditingCardId(null)}>Cancel</button><button onClick={saveCardEdit} disabled={!editTitle.trim()}>Save changes</button></div>
          </div>
        </div>
      </div>}

      {deleteCardId && <div className="rb-rule-overlay rb-delete-card-backdrop" role="dialog" aria-modal="true" aria-label="Remove card confirmation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteCardId(null); }}><div className="rb-bulk-panel"><div className="rb-confirm-head"><h2>Remove this card?</h2><OverlayCloseButton label="Close remove card confirmation" onClick={() => setDeleteCardId(null)} /></div><p>{cards.find((item) => item.id === deleteCardId)?.title} will be removed from {liveMode ? "your Savers library" : "this browser preview"}.</p><div className="rb-confirm-actions"><button onClick={() => setDeleteCardId(null)}>Cancel</button><button className="rb-bulk-danger" onClick={() => removeCard(deleteCardId)}>Remove card</button></div></div></div>}

      {bulkTagOpen && <div className="rb-rule-overlay rb-bulk-dialog" role="dialog" aria-modal="true" aria-label="Add tag to selected cards"><div className="rb-bulk-panel"><div className="rb-confirm-head"><h2>Add a tag to {selectedLibraryIds.length} {selectedLibraryIds.length === 1 ? "card" : "cards"}</h2><OverlayCloseButton label="Close bulk tag editor" onClick={() => setBulkTagOpen(false)} /></div><input value={bulkTagInput} onChange={(event) => setBulkTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applyBulkTags(); }} placeholder="Tag name" autoFocus /><div className="rb-confirm-actions"><button onClick={() => setBulkTagOpen(false)}>Cancel</button><button onClick={applyBulkTags} disabled={!bulkTagInput.trim()}>Add tag</button></div></div></div>}
      {bulkRemoveOpen && <div className="rb-rule-overlay rb-bulk-dialog" role="dialog" aria-modal="true" aria-label="Confirm removal"><div className="rb-bulk-panel"><div className="rb-confirm-head"><h2>Remove {selectedLibraryIds.length} {selectedLibraryIds.length === 1 ? "card" : "cards"}?</h2><OverlayCloseButton label="Close bulk remove confirmation" onClick={() => setBulkRemoveOpen(false)} /></div><p>This removes them from {liveMode ? "your Savers library" : "this browser preview"}.</p><div className="rb-confirm-actions"><button onClick={() => setBulkRemoveOpen(false)}>Cancel</button><button className="rb-bulk-danger" onClick={removeSelectedCards}>Remove</button></div></div></div>}

      {composer && (
        <div
          className="rb-composer-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Create ${composer}`}
          onMouseDown={(event) => { if (event.target === event.currentTarget) setComposer(null); }}
        >
          <div className="rb-composer">
            <div className="rb-composer-header"><OverlayCloseButton label="Close composer" onClick={() => setComposer(null)} /></div>
            <div className="rb-composer-body" data-scroll-fade="y">
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
                <small>{liveMode ? "Saved to your account, under 20 MB" : "Browser-local preview, under 20 MB"}</small>
                <input
                  type="file"
                  accept={composer === "image" ? "image/*" : undefined}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (composer === "file") void prepareComposerFile(file);
                    else { setFormFile(file); if (!formTitle.trim()) setFormTitle(file.name.replace(/\.[^.]+$/, "")); }
                  }}
                />
              </label>
            )}
            {composer === "image" && <label>Or use an image URL<input type="url" value={formUrl} onChange={(event) => setFormUrl(event.target.value)} placeholder="https://example.com/image.jpg" /></label>}
            <label>
              {composer === "note"
                ? "Title"
                : composer === "collection"
                  ? "Name"
                  : "Title"}
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
                ? "Description"
                : "Note"}
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
              <div className="rb-composer-field">
                <label htmlFor="rb-composer-tag-input">Tags</label>
                {formTags && <div className="rb-composer-tag-chips">{formTags.split(",").map((tag) => tag.trim()).filter(Boolean).map((tag) => <button key={tag.toLocaleLowerCase()} onClick={() => setFormTags((current) => current.split(",").map((value) => value.trim()).filter((value) => value && value.toLocaleLowerCase() !== tag.toLocaleLowerCase()).join(", "))} aria-label={`Remove tag ${tag}`}>{tag}<X size={15} /></button>)}</div>}
                <div className="rb-composer-inline-entry">
                  <input id="rb-composer-tag-input" value={formTagInput} onChange={(event) => setFormTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addComposerTag(); } }} placeholder="New or existing tag" list="rb-composer-tag-suggestions" />
                  <datalist id="rb-composer-tag-suggestions">{tagCounts.slice(0, 100).map((tag) => <option key={tag.name} value={tag.name} />)}</datalist>
                  <button onClick={addComposerTag} aria-label="Add tag" title="Add tag"><Plus size={21} /></button>
                </div>
              </div>
            )}
            <div className="rb-composer-field">
              <div className="rb-composer-field-head">
                <label htmlFor="rb-composer-collection">{composer === "collection" ? "Inside" : "Collection"}</label>
                {composer !== "collection" && <button onClick={() => setNewCollectionOpen((open) => !open)} aria-expanded={newCollectionOpen}><Plus size={17} /> New collection</button>}
              </div>
              <select id="rb-composer-collection" value={formCollection} onChange={(e) => setFormCollection(e.target.value)}>
                <option value="">{composer === "collection" ? "Top level" : "Unsorted — decide later"}</option>
                {allCollections.filter((item) => !liveMode || item.group === (composer === "image" || composer === "collection" && (collectionGroup === "images" || allCollections.find((folder) => folder.id === selectedCollection)?.group === "images") ? "images" : "links")).map((item) => <option value={item.id} key={item.id}>{item.parentId ? "↳ " : ""}{item.name}</option>)}
              </select>
              {newCollectionOpen && <div className="rb-composer-inline-entry"><input autoFocus value={newCollectionName} onChange={(event) => setNewCollectionName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); createComposerCollection(); } }} placeholder="Collection name" aria-label="New collection name" /><button onClick={createComposerCollection}>Create</button></div>}
            </div>
            </div>
            {formError && (
              <div className="rb-form-error rb-composer-error" role="alert">
                {formError}
              </div>
            )}
            <div className="rb-composer-footer">
              {liveMode ? <span className="rb-composer-privacy-toggle"><LockKeyhole size={19} /> Private</span> : <button className="rb-composer-privacy-toggle" role="switch" aria-checked={formPrivate} onClick={() => setFormPrivate((value) => !value)}>
                {formPrivate ? <LockKeyhole size={19} /> : <Unlock size={19} />}
                {formPrivate ? "Private" : "Public"}
              </button>}
              <button className="rb-composer-submit" onClick={saveComposer} disabled={liveSaving}>
                {composer === "collection"
                  ? "Create collection"
                  : liveSaving ? "Saving…" : "Save to library"}{" "}
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
