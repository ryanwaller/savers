import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enqueueImagePreview } from "@/lib/image-preview-queue";

export const runtime = "nodejs";

/**
 * POST /api/images/[id]/regenerate-preview
 *
 * Re-enqueues a worker job to regenerate the preview for a non-raster
 * image (PDF / EPS / SVG). Useful when:
 *   - The previous preview rendered badly (e.g. SVG transparency → black
 *     before the flatten-on-white fix).
 *   - The worker failed and the row got stuck in processing_status=failed.
 *   - The user uploaded a new version of the same file (out of scope for
 *     now — would need replace flow).
 *
 * Resets processing_status to "pending" so the UI shows the right state
 * while the worker runs.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireUser();
    const { id } = await params;

    const supabaseAdmin = getSupabaseAdmin();
    const { data: row, error: lookupErr } = await supabaseAdmin
      .schema("savers")
      .from("images")
      .select("id, user_id, original_path, file_kind, mime_type")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: "Image not found" }, { status: 404 });

    // Raster images are previewed synchronously at upload — the worker
    // only handles PDF / EPS / SVG. Reject other types loudly so the
    // caller doesn't think it succeeded.
    if (row.file_kind === "image") {
      return NextResponse.json(
        { error: "Raster images don't use the preview worker — re-upload to regenerate." },
        { status: 400 },
      );
    }

    await supabaseAdmin
      .schema("savers")
      .from("images")
      .update({
        processing_status: "pending",
        processing_error: null,
      })
      .eq("id", id)
      .eq("user_id", user.id);

    await enqueueImagePreview({
      imageId: row.id,
      userId: row.user_id,
      originalPath: row.original_path,
      fileKind: row.file_kind,
      mimeType: row.mime_type,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to regenerate preview" },
      { status: 500 },
    );
  }
}
