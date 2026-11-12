/** Fail closed if a functional Rebuild staging process points at another database. */
export function assertRebuildStagingSupabaseUrl(url: string): void {
  if (process.env.SAVERS_REBUILD_STAGING !== "1") return;
  if (new URL(url).hostname !== "zhcepsclcjigaqnlwxiw.supabase.co") {
    throw new Error("Rebuild staging is not pointed at its isolated Supabase project");
  }
}
