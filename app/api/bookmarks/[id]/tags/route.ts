import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export interface MergedTag {
  tag: string;
  source: "user" | "auto";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireUser();
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("bookmarks")
      .select("tags, auto_tags")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
    }

    const userTags: string[] = Array.isArray(data.tags) ? data.tags : [];
    const autoTags: string[] = Array.isArray(data.auto_tags) ? data.auto_tags : [];

    const seen = new Set<string>();
    const merged: MergedTag[] = [];

    for (const t of userTags) {
      if (seen.has(t)) continue;
      seen.add(t);
      merged.push({ tag: t, source: "user" });
    }
    for (const t of autoTags) {
      if (seen.has(t)) continue;
      seen.add(t);
      merged.push({ tag: t, source: "auto" });
    }

    return NextResponse.json({ tags: merged });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Failed to load tags";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Accept an auto-tag (promote to user tag) or reject it (remove from auto_tags). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { action, tag } = body ?? {};

    if (!tag || typeof tag !== "string") {
      return NextResponse.json({ error: "Missing tag" }, { status: 400 });
    }
    if (action !== "accept" && action !== "reject") {
      return NextResponse.json({ error: "Action must be 'accept' or 'reject'" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: bookmark, error: loadError } = await supabase
      .from("bookmarks")
      .select("tags, auto_tags")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (loadError) {
      return NextResponse.json({ error: loadError.message }, { status: 500 });
    }
    if (!bookmark) {
      return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
    }

    const autoTags: string[] = Array.isArray(bookmark.auto_tags) ? bookmark.auto_tags : [];
    const userTags: string[] = Array.isArray(bookmark.tags) ? bookmark.tags : [];

    if (action === "accept") {
      if (!autoTags.includes(tag)) {
        return NextResponse.json({ error: "Tag not in auto_tags" }, { status: 400 });
      }
      const updatedAutoTags = autoTags.filter((t) => t !== tag);
      const updatedUserTags = userTags.includes(tag) ? userTags : [...userTags, tag];

      const { data: updated, error: updateError } = await supabase
        .from("bookmarks")
        .update({ tags: updatedUserTags, auto_tags: updatedAutoTags })
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .maybeSingle();

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      return NextResponse.json({ bookmark: updated });
    }

    // reject
    if (!autoTags.includes(tag)) {
      return NextResponse.json({ error: "Tag not in auto_tags" }, { status: 400 });
    }
    const updatedAutoTags = autoTags.filter((t) => t !== tag);

    const { data: updated, error: updateError } = await supabase
      .from("bookmarks")
      .update({ auto_tags: updatedAutoTags })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    return NextResponse.json({ bookmark: updated });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Failed to update tags";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
