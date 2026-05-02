import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enqueueScreenshot } from "@/lib/screenshot-queue";
import { determineAssetType, buildCollectionPath } from "@/lib/assetTypeRules";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const msg = "message" in error ? (error as { message?: unknown }).message : null;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return "Failed to move bookmarks";
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser();
    const { ids, collectionId } = await req.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "Missing ids" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const newCollectionId = (collectionId ?? null) as string | null;

    // Fetch old state before overwriting
    const { data: oldBookmarks } = await supabaseAdmin
      .from("bookmarks")
      .select("id, url, tags, collection_id, asset_override")
      .in("id", ids)
      .eq("user_id", user.id);

    const { error } = await supabaseAdmin
      .from("bookmarks")
      .update({ collection_id: newCollectionId })
      .in("id", ids)
      .eq("user_id", user.id);

    if (error) {
      console.error(`[bulk-move] ${getErrorMessage(error)}`);
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }

    // Fire-and-forget: check if any bookmarks need preview regeneration
    if (oldBookmarks && oldBookmarks.length > 0) {
      void regenerateChangedBookmarks(
        supabaseAdmin,
        user.id,
        oldBookmarks,
        newCollectionId,
      );
    }

    return NextResponse.json({ moved: ids.length });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error(`[bulk-move] ${getErrorMessage(err)}`);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}

async function regenerateChangedBookmarks(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  oldBookmarks: Array<{
    id: string;
    url: string;
    tags: string[];
    collection_id: string | null;
    asset_override?: boolean;
  }>,
  newCollectionId: string | null,
) {
  try {
    // Fetch all user collections once to build path map
    const { data: allCollections } = await supabaseAdmin
      .from("collections")
      .select("id, name, parent_id")
      .eq("user_id", userId);

    if (!allCollections) return;

    const byId = new Map(allCollections.map((c) => [c.id, c]));
    const newPath = buildCollectionPath(newCollectionId, byId);

    const idsToRegen: string[] = [];

    for (const bm of oldBookmarks) {
      // Skip bookmarks with manual overrides
      if (bm.asset_override) continue;
      // Only check if collection actually changed
      if (bm.collection_id === newCollectionId) continue;

      const oldPath = buildCollectionPath(bm.collection_id, byId);
      const tags = (bm.tags ?? []) as string[];
      const oldType = determineAssetType(oldPath, tags);
      const newType = determineAssetType(newPath, tags);

      if (oldType !== newType) {
        idsToRegen.push(bm.id);
      }
    }

    if (idsToRegen.length === 0) return;

    // Batch reset preview state
    await supabaseAdmin
      .from("bookmarks")
      .update({
        preview_path: null,
        preview_provider: null,
        preview_updated_at: null,
        screenshot_status: "pending",
        screenshot_error: null,
      })
      .in("id", idsToRegen)
      .eq("user_id", userId);

    // Enqueue regeneration for each changed bookmark
    const urlMap = new Map(oldBookmarks.map((b) => [b.id, b.url]));
    await Promise.all(
      idsToRegen.map((id) => {
        const url = urlMap.get(id)!;
        return enqueueScreenshot({ bookmarkId: id, userId, url }).catch(
          (err) =>
            console.error(
              `[bulk-move] Enqueue error for ${id}: ${getErrorMessage(err)}`,
            ),
        );
      }),
    );
  } catch (err) {
    console.error(
      `[bulk-move] Regeneration check error: ${getErrorMessage(err)}`,
    );
  }
}
