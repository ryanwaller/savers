import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enqueueScreenshot } from "@/lib/screenshot-queue";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const message = "message" in error ? (error as { message?: unknown }).message : null;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return "Failed to refresh previews";
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function POST(_req: NextRequest) {
  try {
    const { user } = await requireUser();
    const supabaseAdmin = getSupabaseAdmin();

    const { data: bookmarks, error } = await supabaseAdmin
      .from("bookmarks")
      .select("id, url, custom_preview_path, screenshot_status")
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }

    const allBookmarks = bookmarks ?? [];
    const skippedCustomCount = allBookmarks.filter((b) => !!b.custom_preview_path).length;
    const skippedInFlightCount = allBookmarks.filter(
      (b) =>
        !b.custom_preview_path &&
        (b.screenshot_status === "pending" || b.screenshot_status === "processing"),
    ).length;

    const eligible = allBookmarks.filter(
      (b) =>
        !b.custom_preview_path &&
        b.screenshot_status !== "pending" &&
        b.screenshot_status !== "processing",
    );

    const eligibleIds = eligible.map((bookmark) => bookmark.id);
    if (eligibleIds.length === 0) {
      return NextResponse.json({
        queued_ids: [],
        queued_count: 0,
        failed_ids: [],
        failed_count: 0,
        skipped_custom_count: skippedCustomCount,
        skipped_in_flight_count: skippedInFlightCount,
      });
    }

    const { error: markPendingError } = await supabaseAdmin
      .from("bookmarks")
      .update({
        screenshot_status: "pending",
        screenshot_error: null,
      })
      .in("id", eligibleIds)
      .eq("user_id", user.id);

    if (markPendingError) {
      return NextResponse.json({ error: getErrorMessage(markPendingError) }, { status: 500 });
    }

    const failedIds: string[] = [];
    for (const batch of chunk(eligible, 25)) {
      const settled = await Promise.allSettled(
        batch.map((bookmark) =>
          enqueueScreenshot({
            bookmarkId: bookmark.id,
            userId: user.id,
            url: bookmark.url,
          }),
        ),
      );

      settled.forEach((result, index) => {
        if (result.status === "rejected") {
          failedIds.push(batch[index].id);
        }
      });
    }

    if (failedIds.length > 0) {
      await supabaseAdmin
        .from("bookmarks")
        .update({
          screenshot_status: "error",
          screenshot_error: "Bulk refresh enqueue failed",
        })
        .in("id", failedIds)
        .eq("user_id", user.id);
    }

    const queuedIds = eligibleIds.filter((id) => !failedIds.includes(id));

    return NextResponse.json({
      queued_ids: queuedIds,
      queued_count: queuedIds.length,
      failed_ids: failedIds,
      failed_count: failedIds.length,
      skipped_custom_count: skippedCustomCount,
      skipped_in_flight_count: skippedInFlightCount,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
