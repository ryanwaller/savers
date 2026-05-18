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

    const subscriptions = data ?? [];
    const ids = subscriptions.map((subscription) => subscription.id);
    let counts: Record<string, number> = {};

    if (ids.length > 0) {
      const { data: pendingRows, error: pendingError } = await supabase
        .from("feed_items")
        .select("subscription_id")
        .in("subscription_id", ids)
        .eq("imported", false)
        .eq("dismissed", false);

      if (pendingError) throw pendingError;

      counts = {};
      for (const row of pendingRows ?? []) {
        const subscriptionId = row.subscription_id;
        if (!subscriptionId || typeof subscriptionId !== "string") continue;
        counts[subscriptionId] = (counts[subscriptionId] ?? 0) + 1;
      }
    }

    return NextResponse.json({ subscriptions, counts });
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
        // Extract all <link> tags (handles multiline attributes)
        const linkTags = text.match(/<link\b[^>]*\/?>/gi) || [];
        for (const tag of linkTags) {
          const hasAlternate = /\brel=["']alternate["']/i.test(tag);
          const isFeedType = /\btype=["']application\/(?:rss|atom)\+xml["']/i.test(tag);
          const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
          const hrefLooksFeed = hrefMatch?.[1] && /(?:feed|rss|atom)/i.test(hrefMatch[1]);

          if ((hasAlternate && isFeedType) || (hasAlternate && hrefLooksFeed)) {
            feedUrl = new URL(hrefMatch![1], feedUrl).href;
            break;
          }
        }

        // Fallback: try common feed paths if no <link> tag found
        if (feedUrl === String(body.feed_url ?? "").trim()) {
          const commonPaths = ["/feed", "/atom", "/rss", "/feed.xml", "/atom.xml", "/rss.xml", "/index.xml"];
          for (const path of commonPaths) {
            try {
              const candidate = new URL(path, feedUrl).href;
              const probe = await fetch(candidate, {
                headers: { "User-Agent": "Savers/1.0 (FeedFetcher; +https://savers-production.up.railway.app)" },
              });
              if (probe.ok && probe.headers.get("content-type")?.includes("xml")) {
                feedUrl = candidate;
                break;
              }
            } catch {
              // continue to next path
            }
          }
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
