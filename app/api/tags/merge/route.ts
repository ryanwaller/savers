import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

/**
 * POST /api/tags/merge
 *
 * Body: { sourceTags: string[], targetTag: string }
 *
 * Merges all source tags into the target tag across all bookmarks
 * owned by the current user. Records the merge for undo support.
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser();
    const body = await req.json().catch(() => ({}));
    const { sourceTags, targetTag } = body as {
      sourceTags?: string[];
      targetTag?: string;
    };

    if (!sourceTags?.length || !targetTag?.trim()) {
      return NextResponse.json(
        { error: "sourceTags (non-empty array) and targetTag are required" },
        { status: 400 },
      );
    }

    const normalizedSources = sourceTags.map((t) => t.trim().toLowerCase());
    const normalizedTarget = targetTag.trim().toLowerCase();

    // Remove target from sources if present (merging a tag into itself is a no-op)
    const filtered = normalizedSources.filter((t) => t !== normalizedTarget);
    if (filtered.length === 0) {
      return NextResponse.json(
        { error: "All source tags are identical to the target tag" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    // Find all bookmarks that have any of the source tags.
    // PostgreSQL: tags && ARRAY['a','b'] checks overlap.
    const { data: bookmarks, error: lookupError } = await supabase
      .from("bookmarks")
      .select("id, tags")
      .eq("user_id", user.id)
      .overlaps("tags", filtered);

    if (lookupError) {
      return NextResponse.json({ error: lookupError.message }, { status: 500 });
    }

    if (!bookmarks?.length) {
      return NextResponse.json({
        success: true,
        affectedBookmarks: 0,
        mergeId: null,
      });
    }

    const affectedIds: string[] = [];

    // Update each bookmark: remove source tags, add target tag if not present.
    for (const b of bookmarks) {
      const currentTags: string[] = b.tags ?? [];
      const newTags = currentTags
        .filter((t) => !filtered.includes(t.trim().toLowerCase()))
        .map((t) => t.trim());

      // Keep original casing of target if it already exists, otherwise add normalized
      const hasTarget = newTags.some(
        (t) => t.toLowerCase() === normalizedTarget,
      );
      if (!hasTarget) {
        newTags.push(normalizedTarget);
      }

      const { error: updateError } = await supabase
        .from("bookmarks")
        .update({ tags: newTags })
        .eq("id", b.id)
        .eq("user_id", user.id);

      if (updateError) {
        console.error(`Failed to update tags for bookmark ${b.id}: ${updateError.message}`);
        continue;
      }
      affectedIds.push(b.id);
    }

    // Also update auto_tags on affected bookmarks.
    for (const b of bookmarks) {
      const { data: full } = await supabase
        .from("bookmarks")
        .select("auto_tags")
        .eq("id", b.id)
        .single();

      const autoTags: string[] = full?.auto_tags ?? [];
      if (autoTags.length === 0) continue;

      const hasSourceAuto = autoTags.some((t) =>
        filtered.includes(t.trim().toLowerCase()),
      );
      if (!hasSourceAuto) continue;

      const newAutoTags = autoTags
        .filter((t) => !filtered.includes(t.trim().toLowerCase()))
        .map((t) => t.trim());

      const hasTarget = newAutoTags.some(
        (t) => t.toLowerCase() === normalizedTarget,
      );
      if (!hasTarget) {
        newAutoTags.push(normalizedTarget);
      }

      await supabase
        .from("bookmarks")
        .update({ auto_tags: newAutoTags })
        .eq("id", b.id)
        .eq("user_id", user.id);
    }

    // Record the merge for undo.
    const { data: mergeRecord, error: recordError } = await supabase
      .from("tag_merges")
      .insert({
        user_id: user.id,
        source_tags: filtered,
        target_tag: normalizedTarget,
        affected_bookmark_ids: affectedIds,
      })
      .select("id")
      .single();

    if (recordError) {
      console.error(`Failed to record tag merge: ${recordError.message}`);
    }

    // Also update tag_aliases: make each source tag point to the target.
    // This ensures future auto-tagging respects the merge.
    for (const src of filtered) {
      // Check if canonical already exists
      const { data: existing } = await supabase
        .from("tag_aliases")
        .select("id, variants")
        .eq("canonical_tag", normalizedTarget)
        .maybeSingle();

      if (existing) {
        // Append source to variants if not already present
        const variants: string[] = existing.variants ?? [];
        if (!variants.includes(src) && src !== normalizedTarget) {
          variants.push(src);
          await supabase
            .from("tag_aliases")
            .update({ variants })
            .eq("id", existing.id);
        }
      } else {
        // Check if src is already a canonical tag — if so, update it
        const { data: srcCanonical } = await supabase
          .from("tag_aliases")
          .select("id")
          .eq("canonical_tag", src)
          .maybeSingle();

        if (srcCanonical) {
          await supabase
            .from("tag_aliases")
            .update({ canonical_tag: normalizedTarget })
            .eq("id", srcCanonical.id);
        } else {
          // Insert new alias: target is canonical, src is variant
          await supabase
            .from("tag_aliases")
            .insert({
              canonical_tag: normalizedTarget,
              variants: [src],
            });
        }
      }
    }

    return NextResponse.json({
      success: true,
      affectedBookmarks: affectedIds.length,
      mergeId: mergeRecord?.id ?? null,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message =
      err instanceof Error ? err.message : "Failed to merge tags";
    console.error(`tag merge POST failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
