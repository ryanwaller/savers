import type { Bookmark, Collection } from "@/lib/types";
import { storedPreviewUrl } from "@/lib/api";
import type { PreviewCard } from "./fixtures";

export type LiveCollection = {
  id: string;
  name: string;
  count: number;
  parentId?: string;
  group: "links";
  isPrivate: true;
};

export function liveCollection(collection: Collection, count = 0): LiveCollection {
  return {
    id: collection.id,
    name: collection.name,
    count,
    parentId: collection.parent_id || undefined,
    group: "links",
    isPrivate: true,
  };
}

export function liveCard(bookmark: Bookmark): PreviewCard {
  let source: string | undefined;
  try { source = new URL(bookmark.url).hostname.replace(/^www\./, ""); } catch { /* Keep the saved URL. */ }
  return {
    id: bookmark.id,
    kind: "link",
    title: bookmark.title || source || bookmark.url,
    description: bookmark.description || undefined,
    note: bookmark.notes || undefined,
    source,
    url: bookmark.url,
    image: storedPreviewUrl(bookmark.custom_preview_path || bookmark.preview_path, { previewVersion: bookmark.preview_version }) || bookmark.og_image || undefined,
    collection: bookmark.collection_id || undefined,
    tags: [...new Set([...(bookmark.tags || []), ...(bookmark.auto_tags || [])])],
    date: new Date(bookmark.created_at).toLocaleDateString(),
    isPrivate: true,
    linkStatus: bookmark.link_status === "broken" ? "broken" : "working",
    screenshotStatus: bookmark.screenshot_status,
  };
}
