import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const { user } = await requireUser();
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing ?url parameter" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("bookmarks")
    .select("id, title")
    .eq("user_id", user.id)
    .eq("url", url)
    .maybeSingle();

  if (data) {
    return NextResponse.json({ exists: true, bookmark: data });
  }
  return NextResponse.json({ exists: false, bookmark: null });
}
