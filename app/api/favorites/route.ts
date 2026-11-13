import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await requireUser();
    const body = await req.json() as { id?: unknown; kind?: unknown; favorite?: unknown };
    if (typeof body.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)
      || (body.kind !== "link" && body.kind !== "image") || typeof body.favorite !== "boolean") {
      return NextResponse.json({ error: "Invalid favorite update" }, { status: 400 });
    }

    const db = await createSupabaseServerClient();
    const table = body.kind === "image" ? "images" : "bookmarks";
    const { data, error } = await db.from(table)
      .update({ favorite: body.favorite })
      .eq("id", body.id)
      .eq("user_id", user.id)
      .select("id,favorite")
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    return NextResponse.json({ favorite: data.favorite });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("Favorite update failed:", error);
    return NextResponse.json({ error: "Could not update favorite" }, { status: 500 });
  }
}
