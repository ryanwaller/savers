import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import type { FeedItem } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireUser();
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const { data: subscription, error: subError } = await supabase
      .from("feed_subscriptions")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (subError) throw subError;
    if (!subscription) {
      return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("feed_items")
      .select("*")
      .eq("subscription_id", id)
      .eq("imported", false)
      .eq("dismissed", false)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .returns<FeedItem[]>();

    if (error) throw error;

    return NextResponse.json({ items: data ?? [] });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to load feed items" }, { status: 500 });
  }
}
