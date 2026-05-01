/**
 * One-shot script: enqueue auto-tag jobs for all existing bookmarks.
 *
 * Run with: npx tsx scripts/backfill-auto-tags.ts
 */

import { createClient } from "@supabase/supabase-js";
import { enqueueAutoTag } from "@/lib/auto-tag-queue";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false }, db: { schema: "savers" } },
);

async function main() {
  const { data: bookmarks, error } = await supabase
    .from("bookmarks")
    .select("id, user_id, url, title, description")
    .eq("tagging_status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch bookmarks:", error.message);
    process.exit(1);
  }

  console.log(`Found ${bookmarks.length} bookmarks to enqueue for auto-tagging...`);

  let enqueued = 0;
  for (const b of bookmarks) {
    try {
      await enqueueAutoTag({
        bookmarkId: b.id,
        userId: b.user_id,
        url: b.url,
        title: b.title,
        description: b.description,
      });
      enqueued++;
    } catch (e) {
      console.error(`Failed to enqueue ${b.id}:`, e instanceof Error ? e.message : String(e));
    }
  }

  console.log(`Done. Enqueued ${enqueued} of ${bookmarks.length} bookmarks.`);
  console.log("The auto-tag worker will process these in the background.");
  process.exit(0);
}

main();
