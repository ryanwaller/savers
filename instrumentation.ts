// Feed check cron — runs every 30 minutes in production
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const CHECK_INTERVAL_MS = 30 * 60 * 1000;

    async function checkAllFeeds() {
      try {
        const port = process.env.PORT ?? "3000";
        const res = await fetch(`http://localhost:${port}/api/feeds/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) {
          console.error(`[feed-cron] check failed: HTTP ${res.status}`);
          return;
        }
        const data = await res.json();
        if (data.totalNew > 0) {
          console.log(`[feed-cron] ${data.totalNew} new bookmark(s) across ${data.results.length} feed(s)`);
        }
      } catch (err) {
        console.error("[feed-cron] error:", err instanceof Error ? err.message : err);
      }
    }

    // Stagger first run by 2 minutes to let the server settle
    setTimeout(() => {
      checkAllFeeds().catch(() => {});
      setInterval(() => {
        checkAllFeeds().catch(() => {});
      }, CHECK_INTERVAL_MS);
    }, 2 * 60 * 1000);
  }
}
