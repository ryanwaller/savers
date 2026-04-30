import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { validateFilter, evaluateFilter } from "@/lib/smart-collections";
import type { Bookmark } from "@/lib/types";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim());
    if (parts.length > 0) return parts.join(" | ");
  }
  return "Failed to preview smart collection";
}

function logUnexpectedError(scope: string, error: unknown) {
  if (error instanceof UnauthorizedError) return;
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : null;
  const details = record
    ? JSON.stringify({
        name: typeof record.name === "string" ? record.name : undefined,
        message: typeof record.message === "string" ? record.message : undefined,
        details: typeof record.details === "string" ? record.details : undefined,
        hint: typeof record.hint === "string" ? record.hint : undefined,
        code: typeof record.code === "string" ? record.code : undefined,
      })
    : null;
  console.error(`${scope} ${getErrorMessage(error)}${details ? ` | ${details}` : ""}`);
}

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { user } = await requireUser();

    const body = await req.json();
    const { query_json } = body;

    if (!query_json) {
      return NextResponse.json({ error: "Missing query_json." }, { status: 400 });
    }

    const validation = validateFilter(query_json);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Fetch all user bookmarks for filtering
    const { data: bookmarks, error } = await supabaseAdmin
      .from("bookmarks")
      .select("*")
      .eq("user_id", user.id)
      .returns<Bookmark[]>();

    if (error) {
      logUnexpectedError("Preview smart collection error:", error);
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }

    const filtered = (bookmarks ?? []).filter((b) => evaluateFilter(b, query_json));

    return NextResponse.json({
      count: filtered.length,
      sample: filtered.slice(0, 5).map((b) => ({
        id: b.id,
        title: b.title,
        url: b.url,
        tags: b.tags,
      })),
    });
  } catch (err) {
    logUnexpectedError("Preview smart collection catch error:", err);
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to preview smart collection" },
      { status: 500 }
    );
  }
}
