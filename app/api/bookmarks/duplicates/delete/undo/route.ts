import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

/**
 * POST /api/bookmarks/duplicates/delete/undo
 *
 * Body: { deleteId: string }
 *
 * Restores bookmarks from a duplicate delete operation by
 * re-inserting the stored snapshots from savers.duplicate_deletes.
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser();
    const body = await req.json().catch(() => ({}));
    const { deleteId } = body as { deleteId?: string };

    if (!deleteId) {
      return NextResponse.json(
        { error: "deleteId is required" },
        { status: 400 },
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Fetch the delete record.
    const { data: record, error: lookupError } = await supabaseAdmin
      .from("duplicate_deletes")
      .select("*")
      .eq("id", deleteId)
      .eq("user_id", user.id)
      .single();

    if (lookupError || !record) {
      return NextResponse.json(
        { error: "Delete record not found" },
        { status: 404 },
      );
    }

    if (record.reverted) {
      return NextResponse.json(
        { error: "Delete has already been reverted" },
        { status: 400 },
      );
    }

    const bookmarks = record.deleted_bookmarks as Record<string, unknown>[];

    if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
      return NextResponse.json(
        { error: "No bookmark snapshots found in delete record" },
        { status: 400 },
      );
    }

    // Re-insert each bookmark with its original ID and all fields.
    let restoredCount = 0;
    for (const bm of bookmarks) {
      const { error: insertError } = await supabaseAdmin
        .from("bookmarks")
        .insert(bm);

      if (insertError) {
        console.error(
          `[duplicates/delete/undo] re-insert error for ${bm.id}: ${insertError.message}`,
        );
      } else {
        restoredCount++;
      }
    }

    // Mark the delete record as reverted.
    await supabaseAdmin
      .from("duplicate_deletes")
      .update({ reverted: true })
      .eq("id", deleteId);

    return NextResponse.json({
      success: true,
      restoredCount,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message =
      err instanceof Error ? err.message : "Failed to undo duplicate delete";
    console.error(`[duplicates/delete/undo] ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
