import { safePublicFetch } from "@/lib/safe-fetch";
import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { runFeedChecks } from "@/lib/feed-check";
import { readAllPages } from "@/lib/read-all-pages";

// GET /api/feeds — list subscriptions
export async function GET() {
  try {
    const { user } = await requireUser();
    const supabase = getSupabaseAdmin();

    const subscriptions = await readAllPages((from, to) => supabase
      .from("feed_subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .order("id")
      .range(from, to));
    const ids = subscriptions.map((subscription) => subscription.id);
    let counts: Record<string, number> = {};

    if (ids.length > 0) {
      const pendingRows = await readAllPages((from, to) => supabase
        .from("feed_items")
        .select("subscription_id")
        .in("subscription_id", ids)
        .eq("imported", false)
        .eq("dismissed", false)
        .order("id")
        .range(from, to));

      counts = {};
      for (const row of pendingRows) {
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

    if (collectionId) {
      if (typeof collectionId !== "string") {
        return NextResponse.json({ error: "Invalid collection_id" }, { status: 400 });
      }
      const { data: collection, error: collectionError } = await supabase
        .from("collections")
        .select("id")
        .eq("id", collectionId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (collectionError) throw collectionError;
      if (!collection) {
        return NextResponse.json({ error: "Collection not found" }, { status: 404 });
      }
    }

    // Auto-discover feed URL from homepage if user pasted a website URL
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const probe = await safePublicFetch(feedUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "Savers/1.0 (FeedFetcher; +https://savers-production.up.railway.app)" },
      });
      clearTimeout(timeout);

      const text = await probe.text();
      const ct = probe.headers.get("content-type") || "";
      const looksLikeXml =
        ct.includes("application/rss") ||
        ct.includes("application/atom") ||
        ct.includes("text/xml") ||
        ct.includes("application/xml") ||
        text.trimStart().startsWith("<?");

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
              const probe = await safePublicFetch(candidate, {
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

    // Kick off an immediate check without exposing a privileged HTTP route.
    void runFeedChecks({ userId: user.id, subscriptionId: data.id }).catch(() => {});

    return NextResponse.json({ subscription: data });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to create feed" }, { status: 500 });
  }
}
