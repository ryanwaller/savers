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

    const { error } = await supabaseAdmin
      .from("bookmarks")
      .update({
        link_status,
        last_link_check: new Date().toISOString(),
      })
      .eq("id", bookmarkId)
      .eq("user_id", user.id);

    if (error) {
      console.error(`link-status reset failed: ${error.message}`);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, link_status });
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
