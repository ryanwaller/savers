import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enqueueScreenshot } from "@/lib/screenshot-queue";
import type { Bookmark } from "@/lib/types";

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
      .select("id, guid, url, title, description, published_at, imported, dismissed, bookmark_id, subscription_id")
      .eq("id", itemId)
      .maybeSingle();

    if (itemError) throw itemError;
    if (!item) {
      return NextResponse.json({ error: "Feed item not found" }, { status: 404 });
    }

    const { data: subscription, error: subscriptionError } = await supabase
      .from("feed_subscriptions")
      .select("id, user_id, collection_id")
      .eq("id", item.subscription_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (subscriptionError) throw subscriptionError;
    if (!subscription) {
      return NextResponse.json({ error: "Feed item not found" }, { status: 404 });
    }

    if (!item.url) {
      return NextResponse.json({ error: "This feed item cannot be saved yet." }, { status: 400 });
    }

    if (item.bookmark_id) {
      const { data: existingBookmark } = await supabase
        .from("bookmarks")
        .select("*")
        .eq("id", item.bookmark_id)
        .maybeSingle();

      if (existingBookmark) {
        const normalizedBookmark: Bookmark = {
          ...(existingBookmark as Bookmark),
          feed_subscription_id: (existingBookmark as Bookmark).feed_subscription_id ?? subscription.id,
          source: (existingBookmark as Bookmark).source ?? "feed",
        };

        await supabase
          .from("feed_items")
          .update({ imported: true, dismissed: false, bookmark_id: normalizedBookmark.id })
          .eq("id", item.id);

        return NextResponse.json({ bookmark: normalizedBookmark });
      }
    }

    const { data: duplicate } = await supabase
      .from("bookmarks")
      .select("*")
      .eq("user_id", user.id)
      .eq("url", item.url)
      .maybeSingle();

    if (duplicate) {
      const normalizedDuplicate: Bookmark = {
        ...(duplicate as Bookmark),
        feed_subscription_id: (duplicate as Bookmark).feed_subscription_id ?? subscription.id,
        source: (duplicate as Bookmark).source ?? "feed",
      };

      if (!duplicate.feed_subscription_id) {
        await supabase
          .from("bookmarks")
          .update({ feed_subscription_id: subscription.id, source: "feed" })
          .eq("id", duplicate.id);
      }

      await supabase
        .from("feed_items")
        .update({ imported: true, dismissed: false, bookmark_id: duplicate.id })
        .eq("id", item.id);

      return NextResponse.json({ bookmark: normalizedDuplicate });
    }

    const createdAt =
      item.published_at && Date.parse(item.published_at)
        ? new Date(item.published_at).toISOString()
        : new Date().toISOString();

    const { data: bookmark, error: insertError } = await supabase
      .from("bookmarks")
      .insert({
        user_id: user.id,
        url: item.url,
        title: item.title || item.url,
        description: item.description?.slice(0, 1000) ?? null,
        collection_id: subscription.collection_id,
        source: "feed",
        feed_subscription_id: subscription.id,
        screenshot_status: "pending",
        created_at: createdAt,
      })
      .select("*")
      .single();

    if (insertError || !bookmark) {
      throw insertError ?? new Error("Failed to create bookmark");
    }

    await supabase
      .from("feed_items")
      .update({ imported: true, dismissed: false, bookmark_id: bookmark.id })
      .eq("id", item.id);

    try {
      await enqueueScreenshot({
        bookmarkId: bookmark.id,
        url: bookmark.url,
        userId: user.id,
      });
    } catch {
      // Queue may be unavailable; keep the bookmark anyway.
    }

    return NextResponse.json({ bookmark });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save feed item" }, { status: 500 });
  }
}
