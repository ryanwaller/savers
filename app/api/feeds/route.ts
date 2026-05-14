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

    let feedUrl = String(body.feed_url ?? "").trim();
    const name = String(body.name ?? "").trim();
    const collectionId = body.collection_id ?? null;

    if (!feedUrl || !name) {
      return NextResponse.json({ error: "feed_url and name are required" }, { status: 400 });
    }

    // Auto-discover feed URL from homepage if user pasted a website URL
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const probe = await fetch(feedUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "Savers/1.0 (FeedFetcher; +https://savers-production.up.railway.app)" },
      });
      clearTimeout(timeout);

      const text = await probe.text();
      const looksLikeXml = text.trimStart().startsWith("<");

      if (!looksLikeXml) {
        // Search for <link rel="alternate" type="application/rss+xml"> or atom
        const feedLinkMatch = text.match(
          /<link[^>]*\brel=["']alternate["'][^>]*\btype=["']application\/(?:rss|atom)\+xml["'][^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i,
        ) || text.match(
          /<link[^>]*\btype=["']application\/(?:rss|atom)\+xml["'][^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i,
        );

        if (feedLinkMatch?.[1]) {
          const resolved = new URL(feedLinkMatch[1], feedUrl).href;
          feedUrl = resolved;
        }
      }
    } catch {
      // If discovery fails, proceed with the original URL
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
