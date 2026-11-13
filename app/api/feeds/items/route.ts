import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { readAllPages } from "@/lib/read-all-pages";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { FeedItem, FeedSubscription } from "@/lib/types";

// Pending items for the signed-in user's feed subscriptions.
export async function GET() {
  try {
    const { user } = await requireUser();
    const db = await createSupabaseServerClient();
    const subscriptions = await readAllPages<Pick<FeedSubscription, "id">>((from, to) => db
      .from("feed_subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .order("id")
      .range(from, to));
    const ids = subscriptions.map((subscription) => subscription.id);
    if (!ids.length) return NextResponse.json({ items: [] });

    const items = await readAllPages<FeedItem>((from, to) => db
      .from("feed_items")
      .select("*")
      .in("subscription_id", ids)
      .eq("imported", false)
      .eq("dismissed", false)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to)
      .returns<FeedItem[]>());
    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    return NextResponse.json({ error: "Failed to load feed items" }, { status: 500 });
  }
}
