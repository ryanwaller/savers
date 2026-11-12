import test from "node:test";
import assert from "node:assert/strict";
import { assertRebuildStagingSupabaseUrl } from "../lib/rebuild-staging-guard";

test("staging processes reject the production Supabase project", () => {
  const previous = process.env.SAVERS_REBUILD_STAGING;
  process.env.SAVERS_REBUILD_STAGING = "1";
  try {
    assert.doesNotThrow(() => assertRebuildStagingSupabaseUrl("https://zhcepsclcjigaqnlwxiw.supabase.co"));
    assert.throws(
      () => assertRebuildStagingSupabaseUrl("https://zyeuthooypsjclffmird.supabase.co"),
      /isolated Supabase project/,
    );
  } finally {
    if (previous === undefined) delete process.env.SAVERS_REBUILD_STAGING;
    else process.env.SAVERS_REBUILD_STAGING = previous;
  }
});
