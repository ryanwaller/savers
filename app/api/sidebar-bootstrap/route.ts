import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import type { Collection, FeedSubscription, SmartCollection } from "@/lib/types";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim());
    if (parts.length > 0) return parts.join(" | ");
  }
  return "Failed to load sidebar data";
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

    const [collectionsResult, bookmarkSummaryResult, smartCollectionsResult, feedSubscriptionsResult] =
      await Promise.all([
        supabaseAdmin
          .from("collections")
          .select("*")
          .eq("user_id", user.id)
          .order("position"),
        supabaseAdmin
          .from("bookmarks")
          .select("collection_id, pinned, link_status")
          .eq("user_id", user.id),
        supabaseAdmin
          .from("smart_collections")
          .select("*")
          .eq("user_id", user.id)
          .order("position")
          .returns<SmartCollection[]>(),
        supabaseAdmin
          .from("feed_subscriptions")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true })
          .returns<FeedSubscription[]>(),
      ]);

    if (collectionsResult.error) throw collectionsResult.error;
    if (bookmarkSummaryResult.error) throw bookmarkSummaryResult.error;
    if (smartCollectionsResult.error) throw smartCollectionsResult.error;
    if (feedSubscriptionsResult.error) throw feedSubscriptionsResult.error;

    const collections = (collectionsResult.data as Collection[]) ?? [];
    const bookmarkRows = bookmarkSummaryResult.data ?? [];
    const smartCollections = smartCollectionsResult.data ?? [];
    const feedSubscriptions = feedSubscriptionsResult.data ?? [];

    const collectionBookmarkCounts: Record<string, number> = {};
    let pinned = 0;
    let broken = 0;
    let unsorted = 0;

    for (const row of bookmarkRows) {
      const collectionId = row.collection_id;
      if (typeof collectionId === "string" && collectionId) {
        collectionBookmarkCounts[collectionId] = (collectionBookmarkCounts[collectionId] ?? 0) + 1;
      } else {
        unsorted += 1;
      }
      if (row.pinned === true) pinned += 1;
      if (row.link_status === "broken") broken += 1;
    }

    const flat = collections.map((collection) => ({
      ...collection,
      bookmark_count: collectionBookmarkCounts[collection.id] ?? 0,
    }));

    const feedCounts: Record<string, number> = {};
    const feedIds = feedSubscriptions
      .map((subscription) => subscription.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    if (feedIds.length > 0) {
      const { data: feedRows, error: feedRowsError } = await supabaseAdmin
        .from("feed_items")
        .select("subscription_id")
        .in("subscription_id", feedIds)
        .eq("imported", false)
        .eq("dismissed", false);

      if (feedRowsError) throw feedRowsError;

      for (const row of feedRows ?? []) {
        const subscriptionId = row.subscription_id;
        if (!subscriptionId || typeof subscriptionId !== "string") continue;
        feedCounts[subscriptionId] = (feedCounts[subscriptionId] ?? 0) + 1;
      }
    }

    return NextResponse.json({
      collections: buildTree(flat),
      flat,
      smart_collections: smartCollections,
      feeds: feedSubscriptions,
      summaries: {
        totals: {
          all: bookmarkRows.length,
          unsorted,
          pinned,
          broken,
        },
        collectionBookmarkCounts,
        feedCounts,
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
