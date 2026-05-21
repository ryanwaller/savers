import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { fetchPageContent } from "@/lib/page-content";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import type { FeedItem } from "@/lib/types";

function looksLikeWeakTitle(item: FeedItem) {
  const title = item.title?.trim();
  if (!title) return true;
  if (title.toLowerCase() === "untitled") return true;
  try {
    const host = item.url ? new URL(item.url).hostname.replace(/^www\./, "") : "";
    return !!host && title.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireUser();
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const { data: subscription, error: subError } = await supabase
      .from("feed_subscriptions")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (subError) throw subError;
    if (!subscription) {
      return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("feed_items")
      .select("*")
      .eq("subscription_id", id)
      .eq("imported", false)
      .eq("dismissed", false)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .returns<FeedItem[]>();

    if (error) throw error;

    const items = data ?? [];
    const enrichable = items
      .filter((item) => item.url && (!item.preview_image || !item.description || looksLikeWeakTitle(item)))
      .slice(0, 12);

    if (enrichable.length > 0) {
      const enriched = await Promise.all(
        enrichable.map(async (item) => {
          try {
            const page = await fetchPageContent(item.url!);
            if (!page) return item;

            const patch: Partial<FeedItem> = {};
            if (!item.preview_image && page.og_image) patch.preview_image = page.og_image;
            if ((!item.description || !item.description.trim()) && page.description) {
              patch.description = page.description.slice(0, 1000);
            }
            if (looksLikeWeakTitle(item) && page.title) {
              patch.title = page.title.slice(0, 300);
            }

            if (Object.keys(patch).length === 0) return item;

            await supabase.from("feed_items").update(patch).eq("id", item.id);
            return { ...item, ...patch };
          } catch {
            return item;
          }
        })
      );

      const enrichedMap = new Map(enriched.map((item) => [item.id, item]));
      return NextResponse.json({
        items: items.map((item) => enrichedMap.get(item.id) ?? item),
      });
    }

    return NextResponse.json({ items });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to load feed items" }, { status: 500 });
  }
}
