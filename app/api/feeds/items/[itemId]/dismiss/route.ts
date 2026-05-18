import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const { user } = await requireUser();
    const { itemId } = await params;
    const supabase = getSupabaseAdmin();

    const { data: item, error: itemError } = await supabase
      .from("feed_items")
      .select("id, subscription_id")
      .eq("id", itemId)
      .maybeSingle();

    if (itemError) throw itemError;
    if (!item) {
      return NextResponse.json({ error: "Feed item not found" }, { status: 404 });
    }

    const { data: subscription, error: subscriptionError } = await supabase
      .from("feed_subscriptions")
      .select("id")
      .eq("id", item.subscription_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (subscriptionError) throw subscriptionError;
    if (!subscription) {
      return NextResponse.json({ error: "Feed item not found" }, { status: 404 });
    }

    await supabase
      .from("feed_items")
      .update({ dismissed: true })
      .eq("id", itemId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to dismiss feed item" }, { status: 500 });
  }
}
