import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { storeCustomPreview } from "@/lib/preview-server";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const msg = "message" in error ? (error as { message?: unknown }).message : null;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return "Failed to upload image";
}

function getErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") return typeof error === "string" ? error : null;
  const record = error as Record<string, unknown>;
  return JSON.stringify({
    name: record.name,
    message: record.message,
    details: record.details,
    hint: record.hint,
    code: record.code,
    status: record.status,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireUser();
    const { id: bookmarkId } = await params;

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No image file provided" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: bookmark, error: lookupError } = await supabaseAdmin
      .from("bookmarks")
      .select("id, custom_preview_path")
      .eq("id", bookmarkId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (lookupError) {
      console.error(
        `upload-image lookup failed ${getErrorMessage(lookupError)} | ${getErrorDetails(lookupError)}`,
      );
      return NextResponse.json(
        { error: getErrorMessage(lookupError) },
        { status: 500 },
      );
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
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error(
      `upload-image failed ${getErrorMessage(err)} | ${getErrorDetails(err)}`,
    );
    return NextResponse.json(
      { error: getErrorMessage(err) },
      { status: 500 },
    );
  }
}
