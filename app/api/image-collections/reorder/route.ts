import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser();
    const body = await req.json().catch(() => ({}));
    const ids = body.ids;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 2000 || ids.some((id) => typeof id !== "string") || new Set(ids).size !== ids.length) {
      return NextResponse.json({ error: "Expected distinct collection IDs." }, { status: 400 });
    }

    const db = getSupabaseAdmin().schema("savers");
    const { data: owned, error: ownedError } = await db.from("image_collections").select("id,parent_id").eq("user_id", user.id).in("id", ids);
    if (ownedError) throw ownedError;
    if (!owned || owned.length !== ids.length) return NextResponse.json({ error: "One or more collections were not found." }, { status: 404 });
    const parentId = owned[0].parent_id;
    if (owned.some((row) => row.parent_id !== parentId)) return NextResponse.json({ error: "Collections must share a parent." }, { status: 400 });

    const siblingQuery = db.from("image_collections").select("id").eq("user_id", user.id);
    const { data: siblings, error: siblingsError } = parentId ? await siblingQuery.eq("parent_id", parentId) : await siblingQuery.is("parent_id", null);
    if (siblingsError) throw siblingsError;
    if (!siblings || siblings.length !== ids.length) return NextResponse.json({ error: "Include every collection at this level." }, { status: 400 });

    for (const [position, id] of ids.entries()) {
      const { error } = await db.from("image_collections").update({ position }).eq("id", id).eq("user_id", user.id);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not reorder image collections." }, { status: 500 });
  }
}
