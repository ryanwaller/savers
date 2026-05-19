import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireUser();
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const { data: subscription, error: subscriptionError } = await supabase
      .from("feed_subscriptions")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (subscriptionError) throw subscriptionError;
    if (!subscription) {
      return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const requestedIds = Array.isArray(body?.item_ids)
      ? body.item_ids.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
      : [];

    let pendingQuery = supabase
      .from("feed_items")
      .select("id")
      .eq("subscription_id", id)
      .eq("imported", false)
      .eq("dismissed", false);

    if (requestedIds.length > 0) {
      pendingQuery = pendingQuery.in("id", requestedIds);
    }

    const { data: pendingItems, error: pendingError } = await pendingQuery;

    if (pendingError) throw pendingError;

    const pendingIds = (pendingItems ?? []).map((item) => item.id).filter(Boolean);
    if (pendingIds.length === 0) {
      return NextResponse.json({ ok: true, dismissed: 0 });
    }

    const { error: updateError } = await supabase
      .from("feed_items")
      .update({ dismissed: true })
      .in("id", pendingIds);

    if (updateError) throw updateError;

    return NextResponse.json({ ok: true, dismissed: pendingIds.length });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to dismiss feed items" }, { status: 500 });
  }
}
