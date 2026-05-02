import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { removePreviewObjects, storeCustomPreview } from "@/lib/preview-server";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const message = "message" in error ? (error as { message?: unknown }).message : null;
    const details = "details" in error ? (error as { details?: unknown }).details : null;
    const hint = "hint" in error ? (error as { hint?: unknown }).hint : null;

    const parts = [message, details, hint]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim());

    if (parts.length > 0) {
      return parts.join(" | ");
    }
  }

  return "Failed to upload preview";
}

function getErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") {
    return typeof error === "string" ? error : null;
  }

  const record = error as Record<string, unknown>;
  const details = {
    name: typeof record.name === "string" ? record.name : undefined,
    message: typeof record.message === "string" ? record.message : undefined,
    details: typeof record.details === "string" ? record.details : undefined,
    hint: typeof record.hint === "string" ? record.hint : undefined,
    code: typeof record.code === "string" ? record.code : undefined,
    status: typeof record.status === "number" ? record.status : undefined,
  };

  return JSON.stringify(details);
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
      console.error(
        `custom-preview lookup failed ${getErrorMessage(bookmarkError)} | ${getErrorDetails(bookmarkError)}`
      );
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

    console.error(
      `custom-preview upload failed ${getErrorMessage(error)} | ${getErrorDetails(error)}`
    );
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user } = await requireUser();
    const supabaseAdmin = getSupabaseAdmin();

    const { searchParams } = new URL(req.url);
    const bookmarkId = searchParams.get("bookmark_id");

    if (!bookmarkId) {
      return NextResponse.json({ error: "Missing bookmark id" }, { status: 400 });
    }

    const { data: bookmark, error: bookmarkError } = await supabaseAdmin
      .from("bookmarks")
      .select("id, custom_preview_path")
      .eq("id", bookmarkId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (bookmarkError) {
      console.error(
        `custom-preview clear lookup failed ${getErrorMessage(bookmarkError)} | ${getErrorDetails(bookmarkError)}`
      );
      return NextResponse.json({ error: getErrorMessage(bookmarkError) }, { status: 500 });
    }

    if (!bookmark) {
      return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
    }

    const previewVersion = Date.now();
    const previewUpdatedAt = new Date(previewVersion).toISOString();

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("bookmarks")
      .update({
        custom_preview_path: null,
        asset_override: false,
        preview_provider: null,
        preview_updated_at: previewUpdatedAt,
        preview_version: previewVersion,
      })
      .eq("id", bookmarkId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError) {
      console.error(
        `custom-preview clear update failed ${getErrorMessage(updateError)} | ${getErrorDetails(updateError)}`
      );
      return NextResponse.json({ error: getErrorMessage(updateError) }, { status: 500 });
    }

    if (bookmark.custom_preview_path) {
      void removePreviewObjects([bookmark.custom_preview_path]);
    }

    return NextResponse.json({ bookmark: updated });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error(
      `custom-preview clear failed ${getErrorMessage(error)} | ${getErrorDetails(error)}`
    );
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
