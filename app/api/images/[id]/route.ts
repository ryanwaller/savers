import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";

/**
 * PATCH /api/images/[id]
 *
 * Update editable fields on an image row. Allowed fields:
 *   - title           string (or "" to clear; falls back to filename)
 *   - description     string (or "" to clear)
 *   - notes           string (or "" to clear)
 *   - tags            string[]  (replaces the whole array)
 *   - collection_id   string | null
 *
 * DELETE /api/images/[id]
 *
 * Removes the DB row AND best-effort cleans up the originals + preview
 * objects so storage doesn't leak.
 */

type Patch = {
  title?: string;
  description?: string;
  notes?: string;
  tags?: unknown;
  collection_id?: string | null;
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireUser();
    const { id } = await params;

    const body = (await req.json().catch(() => ({}))) as Patch;
    const updates: Record<string, unknown> = {};

    if (typeof body.title === "string") {
      updates.title = body.title.trim();
    }
    if (typeof body.description === "string") {
      updates.description = body.description.trim();
    }
    if (typeof body.notes === "string") {
      updates.notes = body.notes.trim();
    }
    if (Array.isArray(body.tags)) {
      updates.tags = (body.tags as unknown[])
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0 && t.length <= 60)
        .slice(0, 32);
    }
    if ("collection_id" in body) {
      const v = body.collection_id;
      if (v === null) {
        updates.collection_id = null;
      } else if (typeof v === "string" && v.trim()) {
        updates.collection_id = v.trim();
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .schema("savers")
      .from("images")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select(
        "id, user_id, collection_id, title, description, tags, notes, source_url, source_kind, file_kind, mime_type, width, height, preview_path, original_path, original_filename, original_size_bytes, processing_status, taken_at, camera_make, camera_model, ai_processed_at, ai_failed_at, position, created_at",
      )
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Image not found" },
        { status: error ? 500 : 404 },
      );
    }

    return NextResponse.json({ image: data });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update image" },
      { status: 500 },
    );
  }
}

export async function DELETE(
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
      .select("id, original_path, preview_path")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: "Image not found" }, { status: 404 });

    const { error: delErr } = await supabaseAdmin
      .schema("savers")
      .from("images")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    // Best-effort storage cleanup; failures here aren't fatal — orphaned
    // objects can be cleaned up later by a background job.
    void supabaseAdmin.storage.from("image-originals").remove([row.original_path]);
    if (row.preview_path) {
      void supabaseAdmin.storage.from("image-previews").remove([row.preview_path]);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete image" },
      { status: 500 },
    );
  }
}
