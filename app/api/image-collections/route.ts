import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";

/**
 * GET  /api/image-collections   — list the current user's image collections.
 * POST /api/image-collections   — create a new image collection.
 *
 * Body for POST: { name: string, parent_id?: string|null }
 */

export async function GET() {
  try {
    const { user } = await requireUser();
    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .schema("savers")
      .from("image_collections")
      .select("id, user_id, name, parent_id, position, icon, is_public, public_id, public_slug, public_description, created_at")
      .eq("user_id", user.id)
      .order("parent_id", { ascending: true, nullsFirst: true })
      .order("position", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ collections: data ?? [] });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list image collections" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser();

    const body = await req.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const parentId = typeof body?.parent_id === "string" && body.parent_id.trim()
      ? body.parent_id.trim()
      : null;
    const icon = typeof body?.icon === "string" && body.icon.trim()
      ? body.icon.trim()
      : null;

    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Compute the next sibling position so newly-created collections land
    // at the end of their parent's list.
    const siblingsQuery = supabaseAdmin
      .schema("savers")
      .from("image_collections")
      .select("position")
      .eq("user_id", user.id);

    const { data: siblings } = parentId
      ? await siblingsQuery.eq("parent_id", parentId)
      : await siblingsQuery.is("parent_id", null);

    let nextPos = 0;
    if (siblings && siblings.length > 0) {
      nextPos = Math.max(...siblings.map((s: { position: number | null }) => s.position ?? 0)) + 1;
    }

    const { data, error } = await supabaseAdmin
      .schema("savers")
      .from("image_collections")
      .insert({
        user_id: user.id,
        name,
        parent_id: parentId,
        position: nextPos,
        icon,
      })
      .select("id, user_id, name, parent_id, position, icon, is_public, public_id, public_slug, public_description, created_at")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Failed to create image collection" },
        { status: 500 },
      );
    }

    return NextResponse.json({ collection: data });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create image collection" },
      { status: 500 },
    );
  }
}
