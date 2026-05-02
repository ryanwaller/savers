import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enqueueScreenshot } from "@/lib/screenshot-queue";
import { removePreviewObjects } from "@/lib/preview-server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireUser();
    const { id: bookmarkId } = await params;

    let mode: "screenshot" | "product_inset" = "screenshot";
    try {
      const body = await req.json();
      if (body.mode === "product_inset") mode = "product_inset";
    } catch {
      // no body or invalid JSON — default to screenshot
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: bookmark, error: lookupError } = await supabaseAdmin
      .from("bookmarks")
      .select("id, preview_path, custom_preview_path, url, user_id")
      .eq("id", bookmarkId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (lookupError) {
      console.error(`force-cover lookup failed: ${lookupError.message}`);
      return NextResponse.json(
        { error: lookupError.message },
        { status: 500 },
      );
    }

    if (!bookmark) {
      return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
    }

    // Delete old preview objects from storage (fire-and-forget)
    if (bookmark.preview_path || bookmark.custom_preview_path) {
      void removePreviewObjects([bookmark.preview_path, bookmark.custom_preview_path]);
    }

    const updateFields: Record<string, unknown> = {
      asset_override: true,
      screenshot_status: "pending",
      preview_path: null,
      custom_preview_path: null,
      preview_provider: null,
      preview_updated_at: null,
      preview_version: null,
    };

    if (mode === "screenshot") {
      updateFields.asset_type = "screenshot";
    } else {
      // Let the worker decide asset_type via classification
      updateFields.asset_type = null;
    }

    const { error: updateError } = await supabaseAdmin
      .from("bookmarks")
      .update(updateFields)
      .eq("id", bookmarkId)
      .eq("user_id", user.id);

    if (updateError) {
      console.error(`force-cover update failed: ${updateError.message}`);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 },
      );
    }

    await enqueueScreenshot({
      bookmarkId,
      url: bookmark.url,
      userId: user.id,
      force_screenshot: mode === "screenshot",
    });

    console.log(
      JSON.stringify({
        event: "force_cover_applied",
        bookmarkId,
        mode,
      }),
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message =
      err instanceof Error ? err.message : "Failed to apply cover";
    console.error(`force-cover failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
