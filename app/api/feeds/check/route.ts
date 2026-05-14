import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

// Simple RSS/Atom parser — extracts entries from XML without dependencies
function parseFeedEntries(xml: string): {
  title: string | null;
  url: string | null;
  description: string | null;
  guid: string | null;
  pubDate: string | null;
}[] {
  const entries: ReturnType<typeof parseFeedEntries> = [];

  // Strip namespaces for simpler matching
  const clean = xml.replace(/\sxmlns[:=][^\s>]*/g, "");

  // Match <item> (RSS) or <entry> (Atom) blocks
  const itemRegex = /<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
  let itemMatch: RegExpExecArray | null;

  while ((itemMatch = itemRegex.exec(clean)) !== null) {
    const block = itemMatch[1];

    const getTag = (tag: string): string | null => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
      return m ? m[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").trim() : null;
    };

    // For Atom <link>, the href is in an attribute
    let link: string | null = getTag("link");
    if (!link) {
      const linkMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
      link = linkMatch ? linkMatch[1] : null;
    }

    const title = getTag("title");
    const description = getTag("description") || getTag("summary") || getTag("content");
    // Try Atom-style <id> first, then RSS <guid>, then fallback to link
    let guid = getTag("id") || getTag("guid");
    if (!guid) guid = link;

    const pubDate = getTag("pubDate") || getTag("published") || getTag("updated");

    entries.push({ title, url: link, description, guid, pubDate });
  }

  return entries;
}

// POST /api/feeds/check — trigger a feed check (called by cron)
// Can check all subscriptions or a specific one via subscription_id in body
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json().catch(() => ({}));
    const subscriptionId = body.subscription_id as string | undefined;

    // Verify this is called with a valid cron secret (optional hardening)
    // const authHeader = req.headers.get("authorization");
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // }

    const subQuery = supabase
      .from("feed_subscriptions")
      .select("*")
      .order("created_at", { ascending: true });

    if (subscriptionId) {
      subQuery.eq("id", subscriptionId);
    }

    const { data: subscriptions, error: subError } = await subQuery;

    if (subError) {
      return NextResponse.json({ error: "Failed to fetch subscriptions" }, { status: 500 });
    }

    const results: {
      subscription_id: string;
      name: string;
      newItems: number;
      error?: string;
    }[] = [];

    for (const sub of subscriptions) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(sub.feed_url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Savers/1.0 (FeedFetcher; +https://savers-production.up.railway.app)",
          },
        });
        clearTimeout(timeout);

        if (!res.ok) {
          results.push({
            subscription_id: sub.id,
            name: sub.name,
            newItems: 0,
            error: `HTTP ${res.status}`,
          });
          continue;
        }

        const xml = await res.text();
        const entries = parseFeedEntries(xml);

        let newCount = 0;
        for (const entry of entries) {
          if (!entry.url || !entry.guid) continue;

          // Check if we've already seen this GUID
          const { data: existing } = await supabase
            .from("feed_items")
            .select("id")
            .eq("subscription_id", sub.id)
            .eq("guid", entry.guid)
            .maybeSingle();

          if (existing) continue;

          // Create bookmark
          const { error: insertError } = await supabase.from("bookmarks").insert({
            user_id: sub.user_id,
            url: entry.url,
            title: entry.title || entry.url,
            description: entry.description?.slice(0, 1000) ?? null,
            collection_id: sub.collection_id,
            source: "feed",
          });

          if (insertError) {
            // If insert fails (e.g., duplicate URL), still mark as seen
            if (!insertError.message?.includes("duplicate")) {
              continue;
            }
          }

          // Record seen GUID
          await supabase.from("feed_items").insert({
            subscription_id: sub.id,
            guid: entry.guid,
          });

          newCount++;
        }

        // Update last_checked_at
        await supabase
          .from("feed_subscriptions")
          .update({ last_checked_at: new Date().toISOString() })
          .eq("id", sub.id);

        results.push({
          subscription_id: sub.id,
          name: sub.name,
          newItems: newCount,
        });
      } catch (err) {
        results.push({
          subscription_id: sub.id,
          name: sub.name,
          newItems: 0,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const totalNew = results.reduce((s, r) => s + r.newItems, 0);
    return NextResponse.json({ results, totalNew });
  } catch {
    return NextResponse.json({ error: "Feed check failed" }, { status: 500 });
  }
}
