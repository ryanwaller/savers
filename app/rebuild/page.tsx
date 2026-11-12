import type { Viewport } from "next";
import RebuildPreview from "./preview";
import { loadBookmarkSeed } from "./bookmark-seed";
import { realCollections } from "./real-collections";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import type { Bookmark, Collection } from "@/lib/types";
import { readAllPages } from "@/lib/read-all-pages";
import { liveCard, liveCollection } from "./live-data";
import StagingSignIn from "./staging-sign-in";
import "./rebuild.css";

export const metadata = {
  title: "Savers — rebuild preview",
  description: "An interactive preview of the next Savers experience.",
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
  if (process.env.SAVERS_REBUILD_STAGING === "1") {
    let userId: string;
    try {
      userId = (await requireUser()).user.id;
    } catch (error) {
      if (error instanceof UnauthorizedError) return <StagingSignIn />;
      throw error;
    }
    const db = getSupabaseAdmin();
    const [bookmarks, collections] = await Promise.all([
      readAllPages<Bookmark>((from, to) => db.from("bookmarks").select("*").eq("user_id", userId).order("created_at", { ascending: false }).order("id").range(from, to).returns<Bookmark[]>()),
      readAllPages<Collection>((from, to) => db.from("collections").select("*").eq("user_id", userId).order("position").order("id").range(from, to).returns<Collection[]>()),
    ]);
    const counts = new Map<string, number>();
    for (const bookmark of bookmarks) if (bookmark.collection_id) counts.set(bookmark.collection_id, (counts.get(bookmark.collection_id) || 0) + 1);
    return <RebuildPreview liveMode seedCollections={collections.map((collection) => liveCollection(collection, counts.get(collection.id) || 0))} seedCards={bookmarks.map(liveCard)} seedPinnedIds={bookmarks.filter((bookmark) => bookmark.pinned).map((bookmark) => bookmark.id)} initialCardId={typeof item === "string" ? item : undefined} />;
  }
  return <RebuildPreview seedCollections={realCollections} seedCards={loadBookmarkSeed()} initialCardId={typeof item === "string" ? item : undefined} />;
}
