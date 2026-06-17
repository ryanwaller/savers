import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { describeImage } from "@/lib/image-ai";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/images/[id]/reenrich
 *
 * Re-runs vision AI against the image's preview JPEG. Useful for:
 *   - Backfilling rows that failed under a previous provider (e.g.
 *     DeepSeek without image_url support → ai_failed_at stamped).
 *   - Retrying after the user manually edited the title and decided AI
 *     was better.
 *
 * Returns the patched image row. Synchronous — caller waits up to ~30s
 * for the vision call to finish.
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
      .select("id, preview_path, file_kind")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: "Image not found" }, { status: 404 });
    if (!row.preview_path) {
      return NextResponse.json(
        { error: "Preview isn't ready yet — try again after it processes." },
        { status: 400 },
      );
    }

    // Pull the preview bytes from the public previews bucket.
    const { data: file, error: dlErr } = await supabaseAdmin.storage
      .from("image-previews")
      .download(row.preview_path);

    if (dlErr || !file) {
      return NextResponse.json(
        { error: dlErr?.message || "Failed to read preview" },
        { status: 500 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const enrichment = await describeImage(buffer, "image/jpeg");

    if (!enrichment) {
      const { data: failed } = await supabaseAdmin
        .schema("savers")
        .from("images")
        .update({ ai_failed_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", user.id)
        .select("*")
        .single();
      return NextResponse.json(
        { error: "AI returned no usable result", image: failed },
        { status: 502 },
      );
    }

    const patch: Record<string, unknown> = {
      ai_processed_at: new Date().toISOString(),
      ai_failed_at: null,
    };
    if (enrichment.title) patch.title = enrichment.title;
    if (enrichment.description) patch.description = enrichment.description;
    if (enrichment.tags.length > 0) patch.tags = enrichment.tags;

    const { data, error: updErr } = await supabaseAdmin
      .schema("savers")
      .from("images")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (updErr || !data) {
      return NextResponse.json(
        { error: updErr?.message || "Failed to save enrichment" },
        { status: 500 },
      );
    }

    return NextResponse.json({ image: data });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Re-enrichment failed" },
      { status: 500 },
    );
  }
}
