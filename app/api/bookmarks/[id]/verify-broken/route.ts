import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

/**
 * POST /api/bookmarks/[id]/verify-broken
 *
 * Body: { action: "confirm" | "dispute" }
 *
 * - "confirm": User agrees the link is broken.
 *   Sets broken_status = 'confirmed_broken', link_status = 'broken'.
 * - "dispute": User says the link still works (false positive).
 *   Sets broken_status = 'verified_active', link_status = 'active'.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireUser();
    const { id: bookmarkId } = await params;

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (!action || !["confirm", "dispute"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'confirm' or 'dispute'" },
        { status: 400 },
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const now = new Date().toISOString();

    if (action === "confirm") {
      const confirmUpdates: Record<string, unknown> = {
        broken_status: "confirmed_broken",
        broken_verified_at: now,
        link_status: "broken",
      };
      confirmUpdates.broken_verified_by = user.id;

      let confirmResult = await supabaseAdmin
        .from("bookmarks")
        .update(confirmUpdates)
        .eq("id", bookmarkId)
        .eq("user_id", user.id);

      if (confirmResult.error && confirmResult.error.message?.includes("broken_verified_by")) {
        delete confirmUpdates.broken_verified_by;
        confirmResult = await supabaseAdmin
          .from("bookmarks")
          .update(confirmUpdates)
          .eq("id", bookmarkId)
          .eq("user_id", user.id);
      }

      const { error } = confirmResult;

      if (error) {
        console.error(`verify-broken confirm failed: ${error.message}`);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        broken_status: "confirmed_broken",
        link_status: "broken",
      });
    }

    // dispute
    const updates: Record<string, unknown> = {
      broken_status: "verified_active",
      broken_verified_at: now,
      link_status: "active",
    };
    updates.broken_verified_by = user.id;

    let result = await supabaseAdmin
      .from("bookmarks")
      .update(updates)
      .eq("id", bookmarkId)
      .eq("user_id", user.id);

    if (result.error && result.error.message?.includes("broken_verified_by")) {
      delete updates.broken_verified_by;
      result = await supabaseAdmin
        .from("bookmarks")
        .update(updates)
        .eq("id", bookmarkId)
        .eq("user_id", user.id);
    }

    const { error } = result;

    if (error) {
      console.error(`verify-broken dispute failed: ${error.message}`);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      broken_status: "verified_active",
      link_status: "active",
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message =
      err instanceof Error ? err.message : "Failed to verify broken link";
    console.error(`verify-broken POST failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
