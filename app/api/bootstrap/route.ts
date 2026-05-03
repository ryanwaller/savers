import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import type { Bookmark, Collection, SmartCollection } from "@/lib/types";
import { BOOKMARK_LIST_SELECT } from "@/lib/bookmark-list";
import { buildBookmarkSummaries } from "@/lib/bookmark-summaries";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim());
    if (parts.length > 0) return parts.join(" | ");
  }
  return "Failed to load library data";
}

function logUnexpectedError(scope: string, error: unknown) {
  if (error instanceof UnauthorizedError) return;
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : null;
  const details = record
    ? JSON.stringify({
        name: typeof record.name === "string" ? record.name : undefined,
        message: typeof record.message === "string" ? record.message : undefined,
        details: typeof record.details === "string" ? record.details : undefined,
        hint: typeof record.hint === "string" ? record.hint : undefined,
        code: typeof record.code === "string" ? record.code : undefined,
        status: typeof record.status === "number" ? record.status : undefined,
      })
    : null;

  console.error(`${scope} ${getErrorMessage(error)}${details ? ` | ${details}` : ""}`);
}

function buildTree(collections: Collection[]): Collection[] {
  const map = new Map<string, Collection>();
  const roots: Collection[] = [];

  for (const collection of collections) {
    map.set(collection.id, { ...collection, children: [] });
  }

  for (const collection of map.values()) {
    if (collection.parent_id) {
      const parent = map.get(collection.parent_id);
      parent?.children?.push(collection);
    } else {
      roots.push(collection);
    }
  }

  const sort = (items: Collection[]) => {
    items.sort((a, b) => a.position - b.position);
    items.forEach((item) => item.children && sort(item.children));
  };

  sort(roots);
  return roots;
}

export async function GET() {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { user } = await requireUser();

    const [collectionsResult, bookmarkCountResult, smartCollectionsResult, bookmarksResult] =
      await Promise.all([
        supabaseAdmin
          .from("collections")
          .select("*")
          .eq("user_id", user.id)
          .order("position"),
        supabaseAdmin
          .from("bookmarks")
          .select("collection_id")
          .eq("user_id", user.id)
          .not("collection_id", "is", null),
        supabaseAdmin
          .from("smart_collections")
          .select("*")
          .eq("user_id", user.id)
          .order("position")
          .returns<SmartCollection[]>(),
        supabaseAdmin
          .from("bookmarks")
          .select(BOOKMARK_LIST_SELECT)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .returns<Bookmark[]>(),
      ]);

    if (collectionsResult.error) throw collectionsResult.error;
    if (bookmarkCountResult.error) throw bookmarkCountResult.error;
    if (smartCollectionsResult.error) throw smartCollectionsResult.error;
    if (bookmarksResult.error) throw bookmarksResult.error;

    const collections = (collectionsResult.data as Collection[]) ?? [];
    const smartCollections = smartCollectionsResult.data ?? [];
    const bookmarks = bookmarksResult.data ?? [];

    const collectionCounts = new Map<string, number>();
    for (const row of bookmarkCountResult.data ?? []) {
      const collectionId = row.collection_id;
      if (!collectionId || typeof collectionId !== "string") continue;
      collectionCounts.set(collectionId, (collectionCounts.get(collectionId) ?? 0) + 1);
    }

    const flat = collections.map((collection) => ({
      ...collection,
      bookmark_count: collectionCounts.get(collection.id) ?? 0,
    }));

    return NextResponse.json({
      collections: buildTree(flat),
      flat,
      smart_collections: smartCollections,
      bookmarks,
      summaries: buildBookmarkSummaries(bookmarks, smartCollections),
    });
  } catch (error) {
    logUnexpectedError("Load bootstrap catch error:", error);
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
