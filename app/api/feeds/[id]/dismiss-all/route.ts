import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const BATCH_SIZE = 100;

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

    let pendingIds: string[] = [];

    if (requestedIds.length > 0) {
      pendingIds = requestedIds;
    } else {
      const { data: pendingItems, error: pendingError } = await supabase
        .from("feed_items")
        .select("id")
        .eq("subscription_id", id)
        .eq("imported", false)
        .eq("dismissed", false);

      if (pendingError) throw pendingError;
      pendingIds = (pendingItems ?? []).map((item) => item.id).filter(Boolean);
    }

    if (pendingIds.length === 0) {
      return NextResponse.json({ ok: true, dismissed: 0 });
    }

    let dismissed = 0;
    for (let i = 0; i < pendingIds.length; i += BATCH_SIZE) {
      const batch = pendingIds.slice(i, i + BATCH_SIZE);
      const { error: updateError, count } = await supabase
        .from("feed_items")
        .update({ dismissed: true }, { count: "exact" })
        .eq("subscription_id", id)
        .eq("imported", false)
        .eq("dismissed", false)
        .in("id", batch);

      if (updateError) throw updateError;
      dismissed += count ?? batch.length;
    }

    return NextResponse.json({ ok: true, dismissed });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to dismiss feed items",
      },
      { status: 500 }
    );
  }
}
