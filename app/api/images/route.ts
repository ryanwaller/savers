import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";

/**
 * GET /api/images
 *
 * Returns the current user's image rows. Optional filters:
 *   ?collection_id=<uuid>     scope to a single collection
 *   ?unsorted=1               only rows with collection_id IS NULL
 *   ?sort=newest|oldest|name  default: newest
 *   ?limit=<n>                default 500, max 2000
 *
 * Includes a publicly-accessible preview URL when preview_path is set.
 * Originals are served via a separate signed-URL endpoint when the user
 * clicks "Download Original" in the slideshow.
 */
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser();

    const url = new URL(req.url);
    const collectionId = url.searchParams.get("collection_id");
    const unsorted = url.searchParams.get("unsorted") === "1";
    const sort = url.searchParams.get("sort") || "newest";
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") || "500", 10) || 500, 1),
      2000,
    );

    const supabaseAdmin = getSupabaseAdmin();

    let query = supabaseAdmin
      .schema("savers")
      .from("images")
      .select(
        "id, user_id, collection_id, title, description, tags, notes, source_url, source_kind, file_kind, mime_type, width, height, preview_path, original_path, original_filename, original_size_bytes, processing_status, taken_at, camera_make, camera_model, ai_processed_at, ai_failed_at, position, created_at",
      )
      .eq("user_id", user.id)
      .limit(limit);

    if (collectionId) {
      query = query.eq("collection_id", collectionId);
    } else if (unsorted) {
      query = query.is("collection_id", null);
    }

    if (sort === "oldest") {
      query = query.order("created_at", { ascending: true });
    } else if (sort === "name") {
      query = query.order("title", { ascending: true, nullsFirst: false });
    } else {
      query = query.order("created_at", { ascending: false });
    }

    const { data, error } = await query;

    if (error) {
      console.error(`[images/list] query failed: ${error.message}`);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Resolve preview URLs server-side. The previews bucket is public so we
    // can compose the URL without a signing roundtrip.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "") || "";
    const images = (data || []).map((row) => ({
      ...row,
      preview_url: row.preview_path
        ? `${supabaseUrl}/storage/v1/object/public/image-previews/${row.preview_path}`
        : null,
    }));

    return NextResponse.json({ images });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error(
      `[images/list] failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list images" },
      { status: 500 },
    );
  }
}
