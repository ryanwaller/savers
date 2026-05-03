import type { Bookmark, SmartCollection } from "@/lib/types";
import { evaluateFilter } from "@/lib/smart-collections";

export type BookmarkTotals = {
  all: number;
  unsorted: number;
  pinned: number;
  broken: number;
};

export type BookmarkSummaries = {
  totals: BookmarkTotals;
  globalTagCounts: Record<string, number>;
  smartCollectionCounts: Record<string, number>;
  collectionBookmarkCounts: Record<string, number>;
};

export function computeTotals(bookmarks: Bookmark[]): BookmarkTotals {
  let unsorted = 0;
  let pinned = 0;
  let broken = 0;

  for (const bookmark of bookmarks) {
    if (bookmark.collection_id === null) unsorted += 1;
    if (bookmark.pinned) pinned += 1;
    if (bookmark.link_status === "broken") broken += 1;
  }

  return {
    all: bookmarks.length,
    unsorted,
    pinned,
    broken,
  };
}

export function computeGlobalTagCounts(bookmarks: Bookmark[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const bookmark of bookmarks) {
    for (const tag of bookmark.tags ?? []) {
      counts[tag] = (counts[tag] ?? 0) + 1;
    }
  }

  return counts;
}

export function computeCollectionBookmarkCounts(bookmarks: Bookmark[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const bookmark of bookmarks) {
    if (!bookmark.collection_id) continue;
    counts[bookmark.collection_id] = (counts[bookmark.collection_id] ?? 0) + 1;
  }

  return counts;
}

export function computeSmartCollectionCounts(
  bookmarks: Bookmark[],
  smartCollections: SmartCollection[]
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const smartCollection of smartCollections) {
    let count = 0;
    for (const bookmark of bookmarks) {
      if (evaluateFilter(bookmark, smartCollection.query_json)) {
        count += 1;
      }
    }
    counts[smartCollection.id] = count;
  }

  return counts;
}

export function buildBookmarkSummaries(
  bookmarks: Bookmark[],
  smartCollections: SmartCollection[]
): BookmarkSummaries {
  return {
    totals: computeTotals(bookmarks),
    globalTagCounts: computeGlobalTagCounts(bookmarks),
    smartCollectionCounts: computeSmartCollectionCounts(bookmarks, smartCollections),
    collectionBookmarkCounts: computeCollectionBookmarkCounts(bookmarks),
  };
}
