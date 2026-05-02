import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { isPublicUrl } from "@/lib/api";
import { removePreviewObjects } from "@/lib/preview-server";
import { enqueueScreenshot } from "@/lib/screenshot-queue";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const msg = "message" in error ? (error as { message?: unknown }).message : null;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return "Failed to update URL";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireUser();
    const { id } = await params;
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    if (!isPublicUrl(url)) {
      return NextResponse.json({ error: "Invalid url" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("bookmarks")
      .select("id, preview_path, custom_preview_path")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (lookupError) {
      console.error(`update-url lookup failed ${getErrorMessage(lookupError)}`);
      return NextResponse.json({ error: getErrorMessage(lookupError) }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
    }

    const { data: bookmark, error: updateError } = await supabaseAdmin
      .from("bookmarks")
      .update({
        url,
        preview_path: null,
        custom_preview_path: null,
        preview_provider: null,
        preview_updated_at: null,
        preview_version: null,
        screenshot_status: "pending",
        screenshot_error: null,
        asset_type: null,
        asset_override: false,
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError) {
      console.error(`update-url failed ${getErrorMessage(updateError)}`);
      return NextResponse.json({ error: getErrorMessage(updateError) }, { status: 500 });
    }

    if (existing.preview_path || existing.custom_preview_path) {
      void removePreviewObjects([existing.preview_path, existing.custom_preview_path]);
    }

    try {
      await enqueueScreenshot({
        bookmarkId: bookmark.id,
        userId: user.id,
        url: bookmark.url,
      });
    } catch (queueError) {
      console.error(`update-url enqueue failed ${getErrorMessage(queueError)}`);
      return NextResponse.json({ error: getErrorMessage(queueError) }, { status: 500 });
    }

    return NextResponse.json({ bookmark });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error(`update-url catch failed ${getErrorMessage(err)}`);
    return NextResponse.json(
      { error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}
