import type { Bookmark, Collection, ImageCollection } from "@/lib/types";
import { storedPreviewUrl } from "@/lib/api";
import type { PreviewCard } from "./fixtures";

export type LiveCollection = {
  id: string;
  name: string;
  count: number;
  parentId?: string;
  group: "links";
  isPrivate: boolean;
  publicId?: string;
  publicSlug?: string;
};

export function liveCollection(collection: Collection, count = 0): LiveCollection {
  return {
    id: collection.id,
    name: collection.name,
    count,
    parentId: collection.parent_id || undefined,
    group: "links",
    isPrivate: collection.is_public !== true,
    publicId: collection.public_id || undefined,
    publicSlug: collection.public_slug || undefined,
  };
}

export type LiveSavedImage = {
  id: string;
  title: string | null;
  description: string | null;
  notes: string | null;
  source_url: string | null;
  tags: string[] | null;
  collection_id: string | null;
  preview_path: string | null;
  processing_status: string | null;
  created_at: string;
};

export function liveImageCollection(collection: ImageCollection, count = 0) {
  return {
    id: collection.id,
    name: collection.name,
    count,
    parentId: collection.parent_id || undefined,
    group: "images" as const,
    isPrivate: collection.is_public !== true,
    publicId: collection.public_id || undefined,
    publicSlug: collection.public_slug || undefined,
  };
}

export function liveImage(image: LiveSavedImage): PreviewCard {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const path = image.preview_path?.split("/").map(encodeURIComponent).join("/");
  return {
    id: image.id,
    kind: "image",
    title: image.title || "Untitled image",
    description: image.description || undefined,
    note: image.notes || undefined,
    source: "Saved image",
    url: image.source_url || undefined,
    image: supabaseUrl && path ? `${supabaseUrl}/storage/v1/object/public/image-previews/${path}` : undefined,
    collection: image.collection_id || undefined,
    tags: image.tags || [],
    date: new Date(image.created_at).toLocaleDateString(),
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
