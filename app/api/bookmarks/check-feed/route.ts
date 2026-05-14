import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { canonicalBookmarkUrl } from "@/lib/api";

export async function GET(req: NextRequest) {
  const { user } = await requireUser();
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing ?url parameter" }, { status: 400 });
  }

  const canonical = canonicalBookmarkUrl(url);
  const supabase = getSupabaseAdmin();

  // Find bookmarks with this canonical URL that are linked to a feed
  const { data: matches, error } = await supabase
    .from("bookmarks")
    .select("id, feed_subscription_id")
    .eq("user_id", user.id)
    .eq("url", canonical)
    .not("feed_subscription_id", "is", null);

  if (error || !matches || matches.length === 0) {
    return NextResponse.json({ match: false, feeds: [] });
  }

  // Fetch feed names for the matched subscriptions
  const feedIds = [...new Set(matches.map((m) => m.feed_subscription_id))];
  const { data: feeds } = await supabase
    .from("feed_subscriptions")
    .select("id, name")
    .in("id", feedIds);

  return NextResponse.json({
    match: true,
    feeds: (feeds ?? []).map((f) => ({ id: f.id, name: f.name })),
  });
}
