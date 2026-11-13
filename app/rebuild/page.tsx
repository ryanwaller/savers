import type { Viewport } from "next";
import RebuildPreview from "./preview";
import { loadBookmarkSeed } from "./bookmark-seed";
import { realCollections } from "./real-collections";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { createSupabaseServerClient, getSupabaseAdmin } from "@/lib/supabase-server";
import type { Bookmark, Collection, FeedSubscription, ImageCollection } from "@/lib/types";
import { readAllPages } from "@/lib/read-all-pages";
import { liveCard, liveCollection, liveImage, liveImageCollection, type LiveSavedImage } from "./live-data";
import StagingSignIn from "./staging-sign-in";
import "./rebuild.css";

export const metadata = {
  title: process.env.SAVERS_REBUILD_STAGING === "1" || process.env.SAVERS_REBUILD_LIVE === "1" ? "Savers" : "Savers — rebuild preview",
  description: "Save and organize the things you want to keep.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#f8f8f8",
};

export const dynamic = "force-dynamic";

export default async function RebuildPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string | string[] }>;
}) {
  const item = (await searchParams).item;
  const isStaging = process.env.SAVERS_REBUILD_STAGING === "1";
  const readOnly = process.env.SAVERS_REBUILD_READ_ONLY === "1";
  if (isStaging || process.env.SAVERS_REBUILD_LIVE === "1") {
    let userId: string;
    try {
      userId = (await requireUser()).user.id;
    } catch (error) {
      if (error instanceof UnauthorizedError) return <StagingSignIn staging={isStaging} />;
      throw error;
    }
    const db = readOnly ? await createSupabaseServerClient() : getSupabaseAdmin();
    const [bookmarks, collections, images, imageCollections, subscriptions] = await Promise.all([
      readAllPages<Bookmark>((from, to) => db.from("bookmarks").select("*").eq("user_id", userId).order("created_at", { ascending: false }).order("id").range(from, to).returns<Bookmark[]>()),
      readAllPages<Collection>((from, to) => db.from("collections").select("*").eq("user_id", userId).order("position").order("id").range(from, to).returns<Collection[]>()),
      readAllPages<LiveSavedImage>((from, to) => db.from("images").select("id,title,description,notes,source_url,tags,collection_id,preview_path,processing_status,favorite,created_at").eq("user_id", userId).order("created_at", { ascending: false }).order("id").range(from, to).returns<LiveSavedImage[]>()),
      readAllPages<ImageCollection>((from, to) => db.from("image_collections").select("*").eq("user_id", userId).order("position").order("id").range(from, to).returns<ImageCollection[]>()),
      readAllPages<FeedSubscription>((from, to) => db.from("feed_subscriptions").select("*").eq("user_id", userId).order("created_at", { ascending: true }).order("id").range(from, to).returns<FeedSubscription[]>()),
    ]);
    const counts = new Map<string, number>();
    for (const bookmark of bookmarks) if (bookmark.collection_id) counts.set(bookmark.collection_id, (counts.get(bookmark.collection_id) || 0) + 1);
    const imageCounts = new Map<string, number>();
    for (const image of images) if (image.collection_id) imageCounts.set(image.collection_id, (imageCounts.get(image.collection_id) || 0) + 1);
    const cards = [...bookmarks.map((bookmark) => ({ createdAt: bookmark.created_at, card: liveCard(bookmark) })), ...images.map((image) => ({ createdAt: image.created_at, card: liveImage(image) }))].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).map(({ card }) => card);
    return <RebuildPreview liveMode isStaging={isStaging} readOnly={readOnly} seedCollections={[...collections.map((collection) => liveCollection(collection, counts.get(collection.id) || 0)), ...imageCollections.map((collection) => liveImageCollection(collection, imageCounts.get(collection.id) || 0))]} seedCards={cards} seedPinnedIds={bookmarks.filter((bookmark) => bookmark.pinned).map((bookmark) => bookmark.id)} seedFavoriteIds={[...bookmarks.filter((bookmark) => bookmark.favorite).map((bookmark) => bookmark.id), ...images.filter((image) => image.favorite).map((image) => image.id)]} seedFeedSubscriptions={subscriptions} initialCardId={typeof item === "string" ? item : undefined} />;
  }
  return <RebuildPreview seedCollections={realCollections} seedCards={loadBookmarkSeed()} initialCardId={typeof item === "string" ? item : undefined} />;
}
