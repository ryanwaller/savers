import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { canonicalBookmarkUrl } from "@/lib/normalizeUrl";

/**
 * GET /api/bookmarks/duplicates
 *
 * Returns bookmarks grouped by canonical URL, showing only groups
 * with 2+ instances. Includes collection names for review UI.
 */
export async function GET(_req: NextRequest) {
  try {
    const { user } = await requireUser();
    const supabaseAdmin = getSupabaseAdmin();

    const { data: bookmarks, error } = await supabaseAdmin
      .from("bookmarks")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!bookmarks?.length) {
      return NextResponse.json({ groups: [], totalDuplicates: 0, groupCount: 0 });
    }

    // Resolve collection names.
    const { data: collections } = await supabaseAdmin
      .from("collections")
      .select("id, name")
      .eq("user_id", user.id);

    const collectionNameMap = new Map<string, string>();
    for (const c of collections ?? []) {
      collectionNameMap.set(c.id, c.name);
    }

    // Group by canonical URL.
    const groupsMap = new Map<string, typeof bookmarks>();

    for (const b of bookmarks) {
      const key = canonicalBookmarkUrl(b.url);
      const existing = groupsMap.get(key);
      if (existing) {
        existing.push(b);
      } else {
        groupsMap.set(key, [b]);
      }
    }

    const groups: Array<{
      canonicalUrl: string;
      displayHost: string;
      displayPath: string;
      isCrossCollection: boolean;
      instances: Array<{
        id: string;
        title: string | null;
        url: string;
        collection_id: string | null;
        collection_name: string;
        created_at: string;
        favicon: string | null;
      }>;
    }> = [];

    let totalDuplicates = 0;

    for (const [canonicalUrl, items] of groupsMap) {
      if (items.length < 2) continue;

      totalDuplicates += items.length - 1;

      // Determine if cross-collection.
      const collectionIds = new Set(
        items.map((b) => b.collection_id ?? "__uncategorized__"),
      );

      const displayHost = (() => {
        try {
          return new URL(items[0].url).hostname.replace(/^www\./, "");
        } catch {
          return canonicalUrl;
        }
      })();

      const displayPath = (() => {
        try {
          const u = new URL(items[0].url);
          const path = u.pathname !== "/" ? u.pathname : "";
          const qs = u.search;
          return `${path}${qs}` || canonicalUrl;
        } catch {
          return "";
        }
      })();

      groups.push({
        canonicalUrl,
        displayHost,
        displayPath,
        isCrossCollection: collectionIds.size > 1,
        instances: items.map((b) => ({
          id: b.id,
          title: b.title,
          url: b.url,
          collection_id: b.collection_id,
          collection_name:
            collectionNameMap.get(b.collection_id ?? "") ?? "Uncategorized",
          created_at: b.created_at,
          favicon: b.favicon,
        })),
      });
    }

    return NextResponse.json({
      groups,
      totalDuplicates,
      groupCount: groups.length,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message =
      err instanceof Error ? err.message : "Failed to find duplicates";
    console.error(`[duplicates] ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
