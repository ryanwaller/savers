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

    const [{ data: collections, error: cErr }, { data: countRows, error: countErr }] = await Promise.all([
      supabaseAdmin
        .schema("savers")
        .from("image_collections")
        .select("id, user_id, name, parent_id, position, icon, is_public, public_id, public_slug, public_description, created_at")
        .eq("user_id", user.id)
        .order("parent_id", { ascending: true, nullsFirst: true })
        .order("position", { ascending: true }),
      // Pull just the collection_id column for every image we own. Grouping
      // in JS is cheaper than a per-folder COUNT roundtrip and the typical
      // user has hundreds of images, not millions.
      supabaseAdmin
        .schema("savers")
        .from("images")
        .select("collection_id")
        .eq("user_id", user.id),
    ]);

    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
    if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });

    const counts = new Map<string, number>();
    for (const row of (countRows ?? []) as Array<{ collection_id: string | null }>) {
      if (!row.collection_id) continue;
      counts.set(row.collection_id, (counts.get(row.collection_id) ?? 0) + 1);
    }

    const enriched = (collections ?? []).map((c) => ({
      ...c,
      image_count: counts.get(c.id) ?? 0,
    }));

    return NextResponse.json({ collections: enriched });
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
