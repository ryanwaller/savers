import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enqueueLinkCheck } from "@/lib/link-check-queue";

/**
 * PATCH /api/bookmarks/[id]/link-status
 * Reset a bookmark's link_status (e.g. mark a false positive "broken"
 * back to "active").
 *
 * Body: { link_status: "active" | "unknown" }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireUser();
    const { id: bookmarkId } = await params;

    const body = await req.json().catch(() => ({}));
    const { link_status } = body;

    if (!link_status || !["active", "unknown"].includes(link_status)) {
      return NextResponse.json(
        { error: "link_status must be 'active' or 'unknown'" },
        { status: 400 },
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const updates: Record<string, unknown> = {
      link_status,
      broken_status: link_status === "active" ? "verified_active" : null,
      broken_verified_at:
        link_status === "active" ? new Date().toISOString() : null,
      last_link_check: new Date().toISOString(),
    };
    updates.broken_verified_by = link_status === "active" ? user.id : null;

    let result = await supabaseAdmin
      .from("bookmarks")
      .update(updates)
      .eq("id", bookmarkId)
      .eq("user_id", user.id)
      .select()
      .single();

    // Retry without broken_verified_by if the FK on savers.users(id) fails,
    // or if the column doesn't exist (migration 017 may have partially failed).
    if (result.error) {
      const msg = result.error.message ?? "";
      const det = result.error.details ?? "";
      const code = result.error.code ?? "";
      const hit =
        msg.includes("broken_verified_by") ||
        det.includes("broken_verified_by") ||
        msg.includes("savers.users") ||
        det.includes("savers.users") ||
        code === "23503" ||
        code === "42703";

      if (hit) {
        delete updates.broken_verified_by;
        result = await supabaseAdmin
          .from("bookmarks")
          .update(updates)
          .eq("id", bookmarkId)
          .eq("user_id", user.id)
          .select()
          .single();
      }
    }

    const { data: bookmark, error } = result;

    if (error) {
      console.error(`link-status reset failed: ${error.message}`);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, link_status, bookmark });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message =
      err instanceof Error ? err.message : "Failed to reset link status";
    console.error(`link-status PATCH failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/bookmarks/[id]/link-status
 * Trigger an immediate recheck of this bookmark's URL.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireUser();
    const { id: bookmarkId } = await params;

    const supabaseAdmin = getSupabaseAdmin();

    const { data: bookmark, error: lookupError } = await supabaseAdmin
      .from("bookmarks")
      .select("id, url, user_id")
      .eq("id", bookmarkId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (lookupError) {
      return NextResponse.json({ error: lookupError.message }, { status: 500 });
    }

    if (!bookmark) {
      return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
    }

    await enqueueLinkCheck({
      bookmarkId: bookmark.id,
      url: bookmark.url,
      userId: user.id,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message =
      err instanceof Error ? err.message : "Failed to recheck link";
    console.error(`link-status POST failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
