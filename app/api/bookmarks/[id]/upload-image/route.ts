import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import sharp from "sharp";
import { generateProductInset } from "@/lib/generateProductInsetImage";
import { removePreviewObjects } from "@/lib/preview-server";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

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

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large (max 10 MB)" },
        { status: 400 },
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Verify bookmark exists and check if it's in a shopping collection
    const { data: bookmark, error: lookupError } = await supabaseAdmin
      .from("bookmarks")
      .select("id, preview_path, collection_id, tags")
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

    // Determine asset type: query collection + parent directly, plus tag fallback
    let isShopping = false;
    if (bookmark.collection_id) {
      const { data: collection } = await supabaseAdmin
        .from("collections")
        .select("id, name, parent_id")
        .eq("id", bookmark.collection_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (collection) {
        const names = [collection.name];
        if (collection.parent_id) {
          const { data: parent } = await supabaseAdmin
            .from("collections")
            .select("name")
            .eq("id", collection.parent_id)
            .maybeSingle();
          if (parent) names.push(parent.name);
        }

        const tags: string[] = Array.isArray(bookmark.tags) ? bookmark.tags : [];
        const hasShoppingTag = tags.some((t) =>
          ["shopping", "product", "buy", "store"].includes(t.toLowerCase()),
        );

        isShopping =
          names.some((n) => n.toLowerCase().includes("shopping")) ||
          hasShoppingTag;

        console.log(
          JSON.stringify({
            event: "upload_image_asset_detection",
            bookmarkId,
            collectionId: bookmark.collection_id,
            collectionNames: names,
            tags,
            isShopping,
          }),
        );
      }
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // Process through unified pipeline
    let processedBuffer: Buffer;
    let insetWidth: number | undefined;
    let insetHeight: number | undefined;

    if (isShopping) {
      const result = await generateProductInset(fileBuffer);
      processedBuffer = result.buffer;
      insetWidth = result.insetWidth;
      insetHeight = result.insetHeight;
    } else {
      // Standard resize for non-shopping
      processedBuffer = await sharp(fileBuffer)
        .resize(1280, 800, { fit: "inside", withoutEnlargement: false })
        .jpeg({ quality: 90 })
        .toBuffer();
    }

    // Delete old preview if it exists
    if (bookmark.preview_path) {
      void removePreviewObjects([bookmark.preview_path]);
    }

    // Upload new preview
    const version = Date.now();
    const previewPath = `${user.id}/${bookmarkId}/upload-${version}.jpg`;
    const previewUpdatedAt = new Date().toISOString();

    const { error: uploadError } = await supabaseAdmin.storage
      .from("bookmark-previews")
      .upload(previewPath, processedBuffer, {
        contentType: "image/jpeg",
        upsert: true,
        cacheControl: "31536000",
      });

    if (uploadError) {
      console.error(
        `upload-image storage failed ${getErrorMessage(uploadError)} | ${getErrorDetails(uploadError)}`,
      );
      return NextResponse.json(
        { error: getErrorMessage(uploadError) },
        { status: 500 },
      );
    }

    // Update bookmark
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("bookmarks")
      .update({
        preview_path: previewPath,
        preview_provider: "manual_upload",
        preview_updated_at: previewUpdatedAt,
        preview_version: version,
        screenshot_status: "complete",
        screenshot_error: null,
        ...(isShopping ? { asset_type: "product_inset" } : {}),
      })
      .eq("id", bookmarkId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError) {
      console.error(
        `upload-image update failed ${getErrorMessage(updateError)} | ${getErrorDetails(updateError)}`,
      );
      return NextResponse.json(
        { error: getErrorMessage(updateError) },
        { status: 500 },
      );
    }

    console.log(
      JSON.stringify({
        event: "manual_upload_success",
        bookmarkId,
        originalSize: file.size,
        processedSize: processedBuffer.length,
        isShopping,
        insetWidth,
        insetHeight,
      }),
    );

    return NextResponse.json({ bookmark: updated });
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
