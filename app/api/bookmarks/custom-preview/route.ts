import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { storeCustomPreview } from "@/lib/preview-server";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Failed to upload preview";
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser();
    const supabaseAdmin = getSupabaseAdmin();
    const formData = await req.formData();

    const bookmarkId = formData.get("bookmark_id");
    const file = formData.get("file");

    if (typeof bookmarkId !== "string" || !bookmarkId) {
      return NextResponse.json({ error: "Missing bookmark id" }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing image file" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }

    const { data: bookmark, error: bookmarkError } = await supabaseAdmin
      .from("bookmarks")
      .select("id, custom_preview_path")
      .eq("id", bookmarkId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (bookmarkError) {
      return NextResponse.json({ error: getErrorMessage(bookmarkError) }, { status: 500 });
    }

    if (!bookmark) {
      return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
    }

    const stored = await storeCustomPreview({
      bookmarkId,
      userId: user.id,
      fileName: file.name || "upload",
      contentType: file.type,
      body: await file.arrayBuffer(),
      currentCustomPreviewPath: bookmark.custom_preview_path ?? null,
    });

    return NextResponse.json({ bookmark: stored.bookmark });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
