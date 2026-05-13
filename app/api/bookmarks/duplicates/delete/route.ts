import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { removePreviewObjects } from "@/lib/preview-server";

/**
 * POST /api/bookmarks/duplicates/delete
 *
 * Body: { ids: string[] }
 *
 * Deletes the selected duplicate bookmarks after storing full
 * snapshots in savers.duplicate_deletes for undo support.
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser();
    const body = await req.json().catch(() => ({}));
    const { ids } = body as { ids?: string[] };

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "ids (non-empty array) is required" },
        { status: 400 },
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Load full bookmark rows for the IDs to delete.
    const { data: bookmarks, error: loadError } = await supabaseAdmin
      .from("bookmarks")
      .select("*")
      .in("id", ids)
      .eq("user_id", user.id);

    if (loadError) {
      console.error(`[duplicates/delete] load error: ${loadError.message}`);
      return NextResponse.json({ error: loadError.message }, { status: 500 });
    }

    if (!bookmarks || bookmarks.length === 0) {
      return NextResponse.json(
        { error: "No matching bookmarks found" },
        { status: 404 },
      );
    }

    // Strip preview paths from snapshots — they reference R2 objects
    // that get cleaned up and can't be restored from the DB.
    const snapshots = bookmarks.map((b) => {
      const { preview_path, custom_preview_path, ...rest } = b;
      return rest;
    });

    // Insert undo record.
    const { data: undoRecord, error: insertError } = await supabaseAdmin
      .from("duplicate_deletes")
      .insert({
        user_id: user.id,
        deleted_bookmarks: snapshots,
        deleted_count: ids.length,
        duplicate_group_count: 0, // informational; not critical for undo
      })
      .select("id")
      .single();

    if (insertError || !undoRecord) {
      console.error(
        `[duplicates/delete] undo insert error: ${insertError?.message}`,
      );
      return NextResponse.json(
        { error: "Failed to create undo record" },
        { status: 500 },
      );
    }

    // Delete the bookmarks.
    const { error: deleteError } = await supabaseAdmin
      .from("bookmarks")
      .delete()
      .in("id", ids)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error(
        `[duplicates/delete] delete error: ${deleteError.message}`,
      );
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // Clean up preview storage objects (fire-and-forget).
    const previewPaths = bookmarks
      .flatMap((b) => [b.preview_path, b.custom_preview_path])
      .filter((p): p is string => typeof p === "string" && p.length > 0);
    if (previewPaths.length > 0) {
      void removePreviewObjects(previewPaths);
    }

    return NextResponse.json({
      ok: true,
      deletedCount: bookmarks.length,
      deleteId: undoRecord.id,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message =
      err instanceof Error ? err.message : "Failed to delete duplicates";
    console.error(`[duplicates/delete] ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
