import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";

/**
 * PATCH  /api/image-collections/[id]  — update name and/or icon
 * DELETE /api/image-collections/[id]  — delete a folder
 *
 * RLS already restricts to the owner; we also defensively scope queries
 * by user_id so a bad token can't act on someone else's row even with a
 * leaky policy.
 */

type Patch = {
  name?: string;
  icon?: string | null;
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

    if (typeof body.name === "string") {
      const trimmed = body.name.trim();
      if (!trimmed) {
        return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
      }
      updates.name = trimmed;
    }

    if ("icon" in body) {
      // Allow explicit null to clear an icon, or string to set one.
      if (body.icon === null) {
        updates.icon = null;
      } else if (typeof body.icon === "string") {
        updates.icon = body.icon.trim() || null;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .schema("savers")
      .from("image_collections")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, user_id, name, parent_id, position, icon, is_public, public_id, public_slug, public_description, created_at")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Folder not found" },
        { status: error ? 500 : 404 },
      );
    }

    return NextResponse.json({ collection: data });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update folder" },
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
    // The schema declares "on delete set null" for the FK from images to
    // image_collections, so child images become unsorted (collection_id
    // null) rather than getting cascaded out. Worth preserving the actual
    // image rows even when a folder is deleted.
    const { error } = await supabaseAdmin
      .schema("savers")
      .from("image_collections")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete folder" },
      { status: 500 },
    );
  }
}
