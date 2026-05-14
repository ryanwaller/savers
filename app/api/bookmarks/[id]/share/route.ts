import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

// POST /api/bookmarks/[id]/share — generate or return existing share token
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireUser();
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const { data: bookmark, error: fetchError } = await supabase
      .from("bookmarks")
      .select("id, share_token")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchError || !bookmark) {
      return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
    }

    if (bookmark.share_token) {
      return NextResponse.json({ token: bookmark.share_token });
    }

    const newToken = crypto.randomUUID();

    const { data: updated, error: updateError } = await supabase
      .from("bookmarks")
      .update({ share_token: newToken })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("share_token")
      .single();

    if (updateError || !updated?.share_token) {
      return NextResponse.json({ error: "Failed to generate share token" }, { status: 500 });
    }

    return NextResponse.json({ token: updated.share_token });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
