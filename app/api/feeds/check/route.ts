import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { runFeedChecks } from "@/lib/feed-check";

// Browser-triggered checks can only read and update the caller's feeds.
// The scheduled all-account check calls runFeedChecks directly from instrumentation.
export async function POST(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (cronSecret && req.headers.get("x-cron-secret") === cronSecret) {
      return NextResponse.json(await runFeedChecks());
    }
    const { user } = await requireUser();
    const body = await req.json().catch(() => ({}));
    if (body.subscription_id !== undefined && typeof body.subscription_id !== "string") {
      return NextResponse.json({ error: "Invalid subscription_id" }, { status: 400 });
    }
    const subscriptionId = typeof body.subscription_id === "string" ? body.subscription_id : undefined;
    const result = await runFeedChecks({ userId: user.id, subscriptionId });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Feed check failed" }, { status: 500 });
  }
}
