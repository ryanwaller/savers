import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { describeImage, lastImageAiError } from "@/lib/image-ai";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes — bulk over many rows can take a while

/**
 * POST /api/images/reenrich-failed
 *
 * One-shot bulk re-enrich for image rows that previously failed AI. Fires
 * the vision provider against each row's preview JPEG; on success it
 * patches title/description/tags/ai_processed_at and clears the failure
 * markers. Returns a summary count.
 *
 * Bounded by:
 *   - A hard cap of 50 rows per call to stay within the route timeout.
 *   - Sequential processing (no parallel fanout) so providers' per-key
 *     rate limits don't trip.
 *
 * Caller is expected to refresh the grid afterward to see the new titles.
 */
export async function POST(_req: NextRequest) {
  try {
    const { user } = await requireUser();
    const supabaseAdmin = getSupabaseAdmin();

    const { data: rows, error: listErr } = await supabaseAdmin
      .schema("savers")
      .from("images")
      .select("id, preview_path, file_kind")
      .eq("user_id", user.id)
      .not("ai_failed_at", "is", null)
      .is("ai_processed_at", null)
      .not("preview_path", "is", null)
      .order("ai_failed_at", { ascending: true })
      .limit(50);

    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

    let succeeded = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const row of (rows ?? []) as Array<{ id: string; preview_path: string; file_kind: string }>) {
      try {
        const { data: file, error: dlErr } = await supabaseAdmin.storage
          .from("image-previews")
          .download(row.preview_path);
        if (dlErr || !file) {
          failed++;
          continue;
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        const enrichment = await describeImage(buffer, "image/jpeg");
        if (!enrichment) {
          failed++;
          const e = lastImageAiError();
          if (e && !errors.includes(e)) errors.push(e);
          await supabaseAdmin
            .schema("savers")
            .from("images")
            .update({
              ai_failed_at: new Date().toISOString(),
              processing_error: e ?? "AI returned no usable result",
            })
            .eq("id", row.id)
            .eq("user_id", user.id);
          continue;
        }
        const patch: Record<string, unknown> = {
          ai_processed_at: new Date().toISOString(),
          ai_failed_at: null,
          processing_error: null,
        };
        if (enrichment.title) patch.title = enrichment.title;
        if (enrichment.description) patch.description = enrichment.description;
        if (enrichment.tags.length > 0) patch.tags = enrichment.tags;

        await supabaseAdmin
          .schema("savers")
          .from("images")
          .update(patch)
          .eq("id", row.id)
          .eq("user_id", user.id);

        succeeded++;
      } catch (err) {
        failed++;
        console.error(
          `[reenrich-failed] row ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return NextResponse.json({
      attempted: rows?.length ?? 0,
      succeeded,
      failed,
      errors: errors.slice(0, 3),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bulk re-enrich failed" },
      { status: 500 },
    );
  }
}
