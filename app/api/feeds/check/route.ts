import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { fetchPageContent } from "@/lib/page-content";
import { DOMParser } from "linkedom";

// Extract the channel-level <link> — the actual website homepage URL.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractChannelLink(doc: any): string | null {
  // RSS: <channel><link>https://example.com</link></channel>
  const channel = doc.querySelector("channel");
  if (channel) {
    // RSS channel <link> is the direct child text of a <link> element.
    // RSS link elements with no attributes = channel link.
    const linkEls = channel.querySelectorAll("link");
    for (const link of linkEls) {
      if (!link.hasAttribute("rel") && !link.hasAttribute("href")) {
        const text = link.textContent?.trim();
        if (text) return text;
      }
    }
  }

  // Atom: <link href="..." rel="alternate" type="text/html"/>
  const feedEl = doc.querySelector("feed");
  if (feedEl) {
    const links = feedEl.querySelectorAll("link");
    for (const link of links) {
      const rel = link.getAttribute("rel");
      const type = link.getAttribute("type");
      const href = link.getAttribute("href");
      if (href && rel === "alternate" && type === "text/html") return href;
    }
    // Fallback: any feed-level <link> with href
    for (const link of links) {
      const href = link.getAttribute("href");
      if (href) return href;
    }
  }

  return null;
}

type FeedEntry = {
  title: string | null;
  url: string | null;
  description: string | null;
  preview_image: string | null;
  guid: string | null;
  pubDate: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseFeedEntries(doc: any): FeedEntry[] {
  const entries: FeedEntry[] = [];

  const getText = (el: Element | null, ...tags: string[]): string | null => {
    if (!el) return null;
    for (const tag of tags) {
      const child = el.querySelector(tag);
      if (child?.textContent?.trim()) {
        return child.textContent.trim();
      }
    }
    return null;
  };

  const getLink = (el: Element): string | null => {
    // RSS: <link>text</link>
    const rssLink = el.querySelector("link");
    if (rssLink && !rssLink.hasAttribute("href")) {
      return rssLink.textContent?.trim() || null;
    }
    // Atom: <link href="..."/>
    const atomLinks = el.querySelectorAll("link");
    for (const l of atomLinks) {
      const href = l.getAttribute("href");
      if (href && l.getAttribute("rel") !== "enclosure") return href;
    }
    return null;
  };

  const getPreviewImage = (el: Element): string | null => {
    // enclosure with image type
    const enclosures = el.querySelectorAll("enclosure");
    for (const enc of enclosures) {
      const type = enc.getAttribute("type") ?? "";
      const url = enc.getAttribute("url");
      if (url && type.startsWith("image/")) return url;
    }
    // media:content / media:thumbnail
    const mediaContent = el.querySelector("media\\:content, content[url]");
    if (mediaContent) {
      const url = mediaContent.getAttribute("url");
      if (url) return url;
    }
    const mediaThumb = el.querySelector("media\\:thumbnail, thumbnail");
    if (mediaThumb) {
      return mediaThumb.getAttribute("url") ?? null;
    }
    // itunes:image
    const itunesImg = el.querySelector("itunes\\:image");
    if (itunesImg) {
      return itunesImg.getAttribute("href") ?? null;
    }
    // First <img> in description
    const descEl = el.querySelector("description, content\\:encoded, summary, content");
    if (descEl?.textContent) {
      const imgMatch = descEl.textContent.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch) return imgMatch[1];
    }
    return null;
  };

  const stripHtml = (value: string): string =>
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const fallbackTitle = (title: string | null, description: string | null, link: string | null): string | null => {
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
  };

  // RSS items and Atom entries
  const itemElements = doc.querySelectorAll("item, entry");
  for (const el of itemElements) {
    const link = getLink(el);
    const title = getText(el, "title");
    const descriptionRaw = getText(el, "description", "summary", "content", "content\\:encoded");
    const description = descriptionRaw ? stripHtml(descriptionRaw) : null;
    const guid = getText(el, "id", "guid") || link;
    const pubDate = getText(el, "pubDate", "published", "updated");
    const previewImage = getPreviewImage(el);

    entries.push({
      title: fallbackTitle(title, description, link),
      url: link,
      description,
      preview_image: previewImage,
      guid,
      pubDate,
    });
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
      let timeout: ReturnType<typeof setTimeout> | null = null;
      try {
        const controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(sub.feed_url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Savers/1.0 (FeedFetcher; +https://savers-production.up.railway.app)",
          },
        });

        if (!res.ok) {
          clearTimeout(timeout);
          timeout = null;
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

        // Auto-discover feed URL if the response is HTML instead of XML.
        // HTML pages start with <!DOCTYPE or <html, both start with "<", so we
        // can't just check the first character. Look for HTML signatures instead.
        const looksLikeHtml =
          /^\s*<!DOCTYPE\s+html|<html\b/i.test(xml.trimStart().slice(0, 500)) ||
          (res.headers.get("content-type") ?? "").includes("text/html");
        if (looksLikeHtml) {
          let discovered: string | null = null;

          // Use DOM to find feed <link> tags
          const htmlDoc = new DOMParser().parseFromString(xml, "text/html");
          const linkElements = htmlDoc.querySelectorAll('link[rel="alternate"]');
          for (const linkEl of linkElements) {
            const type = (linkEl.getAttribute("type") ?? "").toLowerCase();
            const href = linkEl.getAttribute("href") ?? "";
            const isFeedType = /application\/(?:rss|atom)\+xml/.test(type);
            const hrefLooksFeed = /(?:feed|rss|atom)/i.test(href);

            if (href && (isFeedType || hrefLooksFeed)) {
              discovered = new URL(href, sub.feed_url).href;
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
                  signal: controller.signal,
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
              signal: controller.signal,
              headers: { "User-Agent": "Savers/1.0 (FeedFetcher; +https://savers-production.up.railway.app)" },
            });
            if (feedRes.ok) {
              xml = await feedRes.text();
            }
          }
        }

        // Network phase done — clear the abort timeout before per-entry processing.
        if (timeout) { clearTimeout(timeout); timeout = null; }

        const feedDoc = new DOMParser().parseFromString(xml, "text/xml");
        const entries = parseFeedEntries(feedDoc);

        // Extract and persist the channel-level <link> (the actual website)
        // so the UI can link to the real site, not just the XML feed URL.
        const channelLink = (() => {
          const raw = extractChannelLink(feedDoc);
          if (!raw) return null;
          try { return new URL(raw).origin; } catch { return null; }
        })();
        if (channelLink && channelLink !== sub.site_url) {
          supabase
            .from("feed_subscriptions")
            .update({ site_url: channelLink })
            .eq("id", sub.id)
            .then(/* fire-and-forget */);
        }

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
          let previewImage = entry.preview_image ?? null;
          let entryTitle = entry.title || entry.url;
          let entryDescription = entry.description?.slice(0, 1000) ?? null;

          if ((!previewImage || !entryDescription) && entry.url) {
            try {
              const page = await fetchPageContent(entry.url);
              previewImage = previewImage ?? page?.og_image ?? null;
              entryTitle = entry.title || page?.title || entry.url;
              entryDescription = entryDescription ?? page?.description ?? null;
            } catch {
              // Page metadata is a best-effort enhancement for feed inbox rows.
            }
          }

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
              title: entryTitle,
              description: entryDescription,
              preview_image: previewImage,
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
            title: entryTitle,
            description: entryDescription,
            preview_image: previewImage,
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
        if (timeout) clearTimeout(timeout);
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
