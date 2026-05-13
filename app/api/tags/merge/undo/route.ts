import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

/**
 * POST /api/tags/merge/undo
 *
 * Body: { mergeId: string }
 *
 * Reverts a tag merge by restoring the original source tags and
 * removing the target tag from all affected bookmarks (unless the
 * bookmark independently had the target tag before the merge).
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser();
    const body = await req.json().catch(() => ({}));
    const { mergeId } = body as { mergeId?: string };

    if (!mergeId) {
      return NextResponse.json(
        { error: "mergeId is required" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    // Fetch the merge record.
    const { data: merge, error: lookupError } = await supabase
      .from("tag_merges")
      .select("*")
      .eq("id", mergeId)
      .eq("user_id", user.id)
      .single();

    if (lookupError || !merge) {
      return NextResponse.json(
        { error: "Merge record not found" },
        { status: 404 },
      );
    }

    if (merge.reverted) {
      return NextResponse.json(
        { error: "Merge has already been reverted" },
        { status: 400 },
      );
    }

    const sourceTags: string[] = merge.source_tags;
    const targetTag: string = merge.target_tag;
    const affectedIds: string[] = merge.affected_bookmark_ids ?? [];
    let reverted = 0;

    // For each affected bookmark, restore the source tags and remove target.
    for (const bookmarkId of affectedIds) {
      const { data: bookmark } = await supabase
        .from("bookmarks")
        .select("tags")
        .eq("id", bookmarkId)
        .eq("user_id", user.id)
        .single();

      if (!bookmark) continue;

      const currentTags: string[] = (bookmark.tags ?? []).map((t: string) =>
        t.trim(),
      );

      // Remove the target tag
      let restored = currentTags.filter(
        (t) => t.toLowerCase() !== targetTag.toLowerCase(),
      );

      // Add back source tags that aren't already present
      for (const src of sourceTags) {
        if (!restored.some((t) => t.toLowerCase() === src.toLowerCase())) {
          restored.push(src);
        }
      }

      const { error: updateError } = await supabase
        .from("bookmarks")
        .update({ tags: restored })
        .eq("id", bookmarkId)
        .eq("user_id", user.id);

      if (!updateError) reverted++;
    }

    // Mark the merge as reverted.
    await supabase
      .from("tag_merges")
      .update({ reverted: true })
      .eq("id", mergeId);

    return NextResponse.json({ success: true, revertedBookmarks: reverted });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message =
      err instanceof Error ? err.message : "Failed to undo tag merge";
    console.error(`tag merge undo failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
