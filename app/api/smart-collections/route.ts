import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { validateFilter } from "@/lib/smart-collections";
import type { SmartCollection } from "@/lib/types";

const MAX_SMART_COLLECTIONS = 50;

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim());
    if (parts.length > 0) return parts.join(" | ");
  }
  return "Failed to load smart collections";
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

export async function GET() {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { user } = await requireUser();

    const { data, error } = await supabaseAdmin
      .from("smart_collections")
      .select("*")
      .eq("user_id", user.id)
      .order("position")
      .returns<SmartCollection[]>();

    if (error) {
      logUnexpectedError("Load smart collections error:", error);
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }

    return NextResponse.json({ smart_collections: data ?? [] });
  } catch (err) {
    logUnexpectedError("Load smart collections catch error:", err);
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load smart collections" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { user } = await requireUser();

    // Enforce max count
    const { count, error: countError } = await supabaseAdmin
      .from("smart_collections")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (countError) {
      logUnexpectedError("Count smart collections error:", countError);
      return NextResponse.json({ error: getErrorMessage(countError) }, { status: 500 });
    }

    if ((count ?? 0) >= MAX_SMART_COLLECTIONS) {
      return NextResponse.json(
        { error: `You can have at most ${MAX_SMART_COLLECTIONS} smart collections.` },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { name, icon, query_json } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }

    const validation = validateFilter(query_json);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Compute position
    const { data: last } = await supabaseAdmin
      .from("smart_collections")
      .select("position")
      .eq("user_id", user.id)
      .order("position", { ascending: false })
      .limit(1);

    const position = last?.length ? last[0].position + 1 : 0;

    const { data, error } = await supabaseAdmin
      .from("smart_collections")
      .insert({
        user_id: user.id,
        name: name.trim(),
        icon: icon ?? null,
        query_json,
        position,
      })
      .select()
      .single<SmartCollection>();

    if (error) {
      logUnexpectedError("Create smart collection error:", error);
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }

    return NextResponse.json({ smart_collection: data });
  } catch (err) {
    logUnexpectedError("Create smart collection catch error:", err);
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create smart collection" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { user } = await requireUser();
    const { id, user_id: _ignoredUserId, created_at: _ignoredCreatedAt, ...rest } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "Missing id." }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};

    if (rest.name !== undefined) {
      if (typeof rest.name !== "string" || !rest.name.trim()) {
        return NextResponse.json({ error: "Name must be a non-empty string." }, { status: 400 });
      }
      updates.name = rest.name.trim();
    }

    if (rest.icon !== undefined) {
      updates.icon = rest.icon;
    }

    if (rest.position !== undefined) {
      updates.position = rest.position;
    }

    if (rest.query_json !== undefined) {
      const validation = validateFilter(rest.query_json);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      updates.query_json = rest.query_json;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("smart_collections")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single<SmartCollection>();

    if (error) {
      logUnexpectedError("Update smart collection error:", error);
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }

    return NextResponse.json({ smart_collection: data });
  } catch (err) {
    logUnexpectedError("Update smart collection catch error:", err);
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update smart collection" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { user } = await requireUser();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { error } = await supabaseAdmin
      .from("smart_collections")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      logUnexpectedError("Delete smart collection error:", error);
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logUnexpectedError("Delete smart collection catch error:", err);
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete smart collection" },
      { status: 500 }
    );
  }
}
