import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { describeImage, lastImageAiError } from "@/lib/image-ai";

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
      // Surface the actual cause: prefer the specific error message the
      // AI client recorded (e.g. "anthropic 400: credit balance too low"),
      // fall back to a config-derived hint, and finally a generic message.
      const provider = (process.env.IMAGE_AI_PROVIDER?.trim() || "anthropic").toLowerCase();
      const specific = lastImageAiError();
      const reason =
        specific
          ? specific
          : provider === "anthropic" && !process.env.ANTHROPIC_API_KEY?.trim()
            ? "ANTHROPIC_API_KEY not set"
            : provider === "deepseek" && !(process.env.DEEPSEEK_API_KEY || process.env.AI_API_KEY)?.trim()
              ? "DEEPSEEK_API_KEY not set"
              : `${provider} returned no usable result`;
      const { data: failed } = await supabaseAdmin
        .schema("savers")
        .from("images")
        .update({
          ai_failed_at: new Date().toISOString(),
          processing_error: reason,
        })
        .eq("id", id)
        .eq("user_id", user.id)
        .select("*")
        .single();
      return NextResponse.json(
        { error: reason, image: failed },
        { status: 502 },
      );
    }

    const patch: Record<string, unknown> = {
      ai_processed_at: new Date().toISOString(),
      ai_failed_at: null,
      processing_error: null,
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
