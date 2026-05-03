import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { enqueueLinkCheck } from "@/lib/link-check-queue";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Failed to run link check";
}

/**
 * POST /api/bookmarks/check-health
 *
 * Body:
 *   { bookmark_id?: string } — check a single bookmark
 *   { collection_id?: string } — check all bookmarks in a collection
 *   { all?: boolean } — check all user bookmarks not checked in 30+ days
 *
 * Sends "fire and forget" — enqueues the checks, returns immediately with
 * a count of queued jobs.
 */
export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { user } = await requireUser();
    const body = await req.json().catch(() => ({}));
    const { bookmark_id, collection_id, all } = body;

    let query = supabaseAdmin
      .from("bookmarks")
      .select("id, url")
      .eq("user_id", user.id);

    if (bookmark_id) {
      query = query.eq("id", bookmark_id);
    } else if (collection_id) {
      query = query.eq("collection_id", collection_id);
    } else if (all) {
      // Only re-check bookmarks not checked in 30 days, or never checked
      const thirtyDaysAgo = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString();
      query = query.or(
        `last_link_check.is.null,last_link_check.lt.${thirtyDaysAgo}`,
      );
    } else {
      return NextResponse.json(
        { error: "Provide bookmark_id, collection_id, or all=true" },
        { status: 400 },
      );
    }

    const { data: bookmarks, error } = await query;
    if (error) throw error;

    if (!bookmarks || bookmarks.length === 0) {
      return NextResponse.json({ queued: 0, message: "No bookmarks to check" });
    }

    for (const b of bookmarks) {
      try {
        await enqueueLinkCheck({
          bookmarkId: b.id,
          userId: user.id,
          url: b.url,
        });
      } catch {
        // Fire-and-forget — continue queueing remaining bookmarks
      }
    }

    return NextResponse.json({ queued: bookmarks.length });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("Link check health error:", err);
    return NextResponse.json(
      { error: getErrorMessage(err) },
      { status: 500 },
    );
  }
}

/**
 * GET /api/bookmarks/check-health
 *
 * Returns counts of broken/redirect/unknown links for the user.
 */
export async function GET(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { user } = await requireUser();

    const { data, error } = await supabaseAdmin
      .from("bookmarks")
      .select("link_status")
      .eq("user_id", user.id);

    if (error) throw error;

    const counts: Record<string, number> = { broken: 0, redirect: 0, unknown: 0, active: 0 };
    for (const row of data ?? []) {
      const s = row.link_status ?? "unknown";
      counts[s] = (counts[s] ?? 0) + 1;
    }

    return NextResponse.json({ counts });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load link health" },
      { status: 500 },
    );
  }
}
