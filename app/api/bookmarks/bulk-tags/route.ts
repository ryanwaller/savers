import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const msg = "message" in error ? (error as { message?: unknown }).message : null;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return "Failed to update tags";
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser();
    const { ids, action, tags } = await req.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "Missing ids" }, { status: 400 });
    }
    if (action !== "add_tags" && action !== "remove_tags") {
      return NextResponse.json({ error: "Action must be 'add_tags' or 'remove_tags'" }, { status: 400 });
    }
    if (!Array.isArray(tags) || tags.length === 0) {
      return NextResponse.json({ error: "Missing tags" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // For add_tags: append to existing tags array, deduplicating.
    // For remove_tags: remove specified tags from the array.
    if (action === "add_tags") {
      const { data: bookmarks, error: loadError } = await supabaseAdmin
        .from("bookmarks")
        .select("id, tags")
        .in("id", ids)
        .eq("user_id", user.id);

      if (loadError) {
        return NextResponse.json({ error: getErrorMessage(loadError) }, { status: 500 });
      }

      let updated = 0;
      for (const b of (bookmarks ?? [])) {
        const existing: string[] = Array.isArray(b.tags) ? b.tags : [];
        const newTags = tags.filter((t: string) => !existing.includes(t));
        if (newTags.length === 0) continue;
        const { error } = await supabaseAdmin
          .from("bookmarks")
          .update({ tags: [...existing, ...newTags] })
          .eq("id", b.id)
          .eq("user_id", user.id);
        if (!error) updated++;
      }

      return NextResponse.json({ updated });
    }

    // remove_tags
    const { error } = await supabaseAdmin.rpc("array_remove_elements", {
      table_name: "bookmarks",
      column_name: "tags",
      p_ids: ids,
      p_user_id: user.id,
      p_elements: tags,
    });

    // If RPC not available, fall back to per-row updates.
    if (error) {
      const { data: bookmarks, error: loadError } = await supabaseAdmin
        .from("bookmarks")
        .select("id, tags")
        .in("id", ids)
        .eq("user_id", user.id);

      if (loadError) {
        return NextResponse.json({ error: getErrorMessage(loadError) }, { status: 500 });
      }

      let updated = 0;
      for (const b of (bookmarks ?? [])) {
        const existing: string[] = Array.isArray(b.tags) ? b.tags : [];
        const kept = existing.filter((t) => !tags.includes(t));
        if (kept.length === existing.length) continue;
        const { error: updateError } = await supabaseAdmin
          .from("bookmarks")
          .update({ tags: kept })
          .eq("id", b.id)
          .eq("user_id", user.id);
        if (!updateError) updated++;
      }

      return NextResponse.json({ updated });
    }

    return NextResponse.json({ updated: ids.length });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error(`[bulk-tags] ${getErrorMessage(err)}`);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
