import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

// GET /api/share/[token] — public: returns bookmark data for a share token
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const supabase = getSupabaseAdmin();

    const { data: bookmark, error } = await supabase
      .from("bookmarks")
      .select(
        "id, title, url, description, preview_path, custom_preview_path, favicon, share_token",
      )
      .eq("share_token", token)
      .maybeSingle();

    if (error || !bookmark) {
      return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
    }

    return NextResponse.json({ bookmark });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
