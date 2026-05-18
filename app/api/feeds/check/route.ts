import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

// Simple RSS/Atom parser — extracts entries from XML without dependencies
function parseFeedEntries(xml: string): {
  title: string | null;
  url: string | null;
  description: string | null;
  preview_image: string | null;
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

    const decodeCdata = (value: string) => value.replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1");
    const stripHtml = (value: string) =>
      decodeCdata(value)
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const getTagInner = (tag: string): string | null => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
      return m ? decodeCdata(m[1]).trim() : null;
    };

    const getTagText = (tag: string): string | null => {
      const inner = getTagInner(tag);
      return inner ? stripHtml(inner) : null;
    };

    // For Atom <link>, the href is in an attribute
    let link: string | null = getTagText("link");
    if (!link) {
      const linkMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
      link = linkMatch ? linkMatch[1] : null;
    }

    const title = getTagText("title");
    const descriptionHtml =
      getTagInner("description") || getTagInner("summary") || getTagInner("content");
    const description = descriptionHtml ? stripHtml(descriptionHtml) : null;
    // Try Atom-style <id> first, then RSS <guid>, then fallback to link
    let guid = getTagText("id") || getTagText("guid");
    if (!guid) guid = link;

    const pubDate = getTagText("pubDate") || getTagText("published") || getTagText("updated");

    const previewImage =
      block.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["']image\/[^"']+["'][^>]*\/?>/i)?.[1] ||
      block.match(/<media:content[^>]*url=["']([^"']+)["'][^>]*\/?>/i)?.[1] ||
      block.match(/<media:thumbnail[^>]*url=["']([^"']+)["'][^>]*\/?>/i)?.[1] ||
      descriptionHtml?.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ||
      null;

    const fallbackTitle = (() => {
      if (title) return title;
      if (description) return description.slice(0, 120).trim();
      if (!link) return null;
      try {
        const url = new URL(link);
        const slug = url.pathname.split("/").filter(Boolean).pop();
        if (slug) {
          return slug
            .replace(/[-_]+/g, " ")
            .replace(/\.[a-z0-9]+$/i, "")
            .replace(/\b\w/g, (char) => char.toUpperCase());
        }
        return url.hostname.replace(/^www\./, "");
      } catch {
        return link;
      }
    })();

    entries.push({ title: fallbackTitle, url: link, description, preview_image: previewImage, guid, pubDate });
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
      totalEntries: number;
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
            totalEntries: 0,
            error: `HTTP ${res.status}`,
          });
          continue;
        }

        let xml = await res.text();

        // Auto-discover feed URL if the response is HTML instead of XML
        if (!xml.trimStart().startsWith("<")) {
          let discovered: string | null = null;

          // Extract all <link> tags (handles multiline attributes)
          const linkTags = xml.match(/<link\b[^>]*\/?>/gi) || [];
          for (const tag of linkTags) {
            const hasAlternate = /\brel=["']alternate["']/i.test(tag);
            const isFeedType = /\btype=["']application\/(?:rss|atom)\+xml["']/i.test(tag);
            const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
            const hrefLooksFeed = hrefMatch?.[1] && /(?:feed|rss|atom)/i.test(hrefMatch[1]);

            if ((hasAlternate && isFeedType) || (hasAlternate && hrefLooksFeed)) {
              discovered = new URL(hrefMatch![1], sub.feed_url).href;
              break;
            }
          }

          // Fallback: try common feed paths if no <link> tag found
          if (!discovered) {
            const commonPaths = ["/feed", "/atom", "/rss", "/feed.xml", "/atom.xml", "/rss.xml", "/index.xml"];
            for (const path of commonPaths) {
              try {
                const candidate = new URL(path, sub.feed_url).href;
                const probe = await fetch(candidate, {
                  headers: { "User-Agent": "Savers/1.0 (FeedFetcher; +https://savers-production.up.railway.app)" },
                });
                if (probe.ok && probe.headers.get("content-type")?.includes("xml")) {
                  discovered = candidate;
                  break;
                }
              } catch {
                // continue to next path
              }
            }
          }

          if (discovered) {
            const feedRes = await fetch(discovered, {
              headers: { "User-Agent": "Savers/1.0 (FeedFetcher; +https://savers-production.up.railway.app)" },
            });
            if (feedRes.ok) {
              xml = await feedRes.text();
            }
          }
        }

        const entries = parseFeedEntries(xml);

        // Sort newest first by pubDate (fallback: keep original order)
        entries.sort((a, b) => {
          const da = a.pubDate ? Date.parse(a.pubDate) : 0;
          const db = b.pubDate ? Date.parse(b.pubDate) : 0;
          return db - da;
        });

        // Record or refresh feed items so the review queue has the latest metadata
        // without immediately creating permanent bookmarks.
        const validEntries = entries.filter((e) => e.url && e.guid);
        let newCount = 0;
        for (const entry of validEntries) {
          const { data: existingItem } = await supabase
            .from("feed_items")
            .select("id, imported, dismissed")
            .eq("subscription_id", sub.id)
            .eq("guid", entry.guid!)
            .maybeSingle();

          const publishedAt =
            entry.pubDate && Date.parse(entry.pubDate)
              ? new Date(entry.pubDate).toISOString()
              : null;

          // If the user already saved this URL, don't surface it in the review queue.
          const { data: existingBookmark } = await supabase
            .from("bookmarks")
            .select("id, feed_subscription_id")
            .eq("user_id", sub.user_id)
            .eq("url", entry.url!)
            .maybeSingle();

          if (existingItem) {
            const patch: Record<string, unknown> = {
              url: entry.url!,
              title: entry.title || entry.url,
              description: entry.description?.slice(0, 1000) ?? null,
              preview_image: entry.preview_image ?? null,
              published_at: publishedAt,
            };

            if (!existingItem.imported && !existingItem.dismissed && existingBookmark?.id) {
              patch.imported = true;
              patch.bookmark_id = existingBookmark.id;
            }

            await supabase
              .from("feed_items")
              .update(patch)
              .eq("id", existingItem.id);

            if (existingBookmark?.id && !existingBookmark.feed_subscription_id) {
              await supabase
                .from("bookmarks")
                .update({ feed_subscription_id: sub.id, source: "feed" })
                .eq("id", existingBookmark.id);
            }
            continue;
          }

          await supabase.from("feed_items").insert({
            subscription_id: sub.id,
            guid: entry.guid!,
            url: entry.url!,
            title: entry.title || entry.url,
            description: entry.description?.slice(0, 1000) ?? null,
            preview_image: entry.preview_image ?? null,
            published_at: publishedAt,
            imported: !!existingBookmark?.id,
            dismissed: false,
            bookmark_id: existingBookmark?.id ?? null,
          });

          if (existingBookmark?.id && !existingBookmark.feed_subscription_id) {
            await supabase
              .from("bookmarks")
              .update({ feed_subscription_id: sub.id, source: "feed" })
              .eq("id", existingBookmark.id);
          }

          if (!existingBookmark?.id) {
            newCount++;
          }
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
          totalEntries: entries.length,
        });
      } catch (err) {
        results.push({
          subscription_id: sub.id,
          name: sub.name,
          newItems: 0,
          totalEntries: 0,
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
