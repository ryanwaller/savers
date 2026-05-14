import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

// GET /api/feeds — list subscriptions
export async function GET() {
  try {
    const { user } = await requireUser();
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("feed_subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ subscriptions: data });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to list feeds" }, { status: 500 });
  }
}

// POST /api/feeds — create subscription
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser();
    const supabase = getSupabaseAdmin();
    const body = await req.json();

    const feedUrl = String(body.feed_url ?? "").trim();
    const name = String(body.name ?? "").trim();
    const collectionId = body.collection_id ?? null;

    if (!feedUrl || !name) {
      return NextResponse.json({ error: "feed_url and name are required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("feed_subscriptions")
      .insert({
        user_id: user.id,
        feed_url: feedUrl,
        name,
        collection_id: collectionId,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ subscription: data });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to create feed" }, { status: 500 });
  }
}
