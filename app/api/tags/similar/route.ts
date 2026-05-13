import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

interface SimilarGroup {
  tags: string[];
  counts: number[];
  totalBookmarks: number;
  reason: "case_insensitive" | "normalized" | "levenshtein";
}

/**
 * GET /api/tags/similar
 *
 * Scans the user's tags and returns groups of similar/duplicate tags
 * that are good candidates for merging.
 */
export async function GET(_req: NextRequest) {
  try {
    const { user } = await requireUser();
    const supabase = getSupabaseAdmin();

    // Get all unique tags with counts. Tags are stored as text[] on bookmarks,
    // so we unnest and aggregate.
    const { data: rows, error } = await supabase.rpc("get_tag_counts", {
      p_user_id: user.id,
    });

    // Fallback: if RPC doesn't exist, fetch bookmarks and compute in-memory.
    let tagCounts: Map<string, number>;
    if (error) {
      const { data: bookmarks } = await supabase
        .from("bookmarks")
        .select("tags")
        .eq("user_id", user.id);

      tagCounts = new Map<string, number>();
      for (const b of bookmarks ?? []) {
        for (const t of b.tags ?? []) {
          const key = t.trim().toLowerCase();
          tagCounts.set(key, (tagCounts.get(key) ?? 0) + 1);
        }
      }
    } else {
      tagCounts = new Map<string, number>();
      for (const r of rows ?? []) {
        tagCounts.set(r.tag.trim().toLowerCase(), Number(r.count));
      }
    }

    const allTags = Array.from(tagCounts.keys());
    const groups: SimilarGroup[] = [];
    const processed = new Set<string>();

    for (let i = 0; i < allTags.length; i++) {
      const a = allTags[i];
      if (processed.has(a)) continue;

      const group: string[] = [a];
      const counts: number[] = [tagCounts.get(a) ?? 0];
      let reason: SimilarGroup["reason"] | null = null;

      for (let j = i + 1; j < allTags.length; j++) {
        const b = allTags[j];
        if (processed.has(b)) continue;

        const aNormalized = a.replace(/[-_]/g, " ");
        const bNormalized = b.replace(/[-_]/g, " ");

        if (a.toLowerCase() === b.toLowerCase()) {
          // Case-insensitive match
          reason = "case_insensitive";
          group.push(b);
          counts.push(tagCounts.get(b) ?? 0);
          processed.add(b);
        } else if (aNormalized === bNormalized) {
          // Hyphen/underscore/space normalization
          reason = reason ?? "normalized";
          group.push(b);
          counts.push(tagCounts.get(b) ?? 0);
          processed.add(b);
        } else if (levenshteinDistance(a, b) <= 2) {
          // Close edit distance
          reason = reason ?? "levenshtein";
          group.push(b);
          counts.push(tagCounts.get(b) ?? 0);
          processed.add(b);
        }
      }

      if (group.length > 1 && reason) {
        processed.add(a);
        groups.push({
          tags: group,
          counts,
          totalBookmarks: counts.reduce((s, c) => s + c, 0),
          reason,
        });
      }
    }

    return NextResponse.json({ groups });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message =
      err instanceof Error ? err.message : "Failed to find similar tags";
    console.error(`tags/similar failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
