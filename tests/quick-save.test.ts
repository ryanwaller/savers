import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

test("quick save posts directly to Unsorted with the bookmarklet token", async () => {
  const html = readFileSync(new URL("../public/quick-save.html", import.meta.url), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);

  const status = { textContent: "", hidden: false, addEventListener() {} };
  const retry = { textContent: "", hidden: false, addEventListener() {} };
  const messages: unknown[] = [];
  const requests: Array<{ path: string; init: RequestInit }> = [];
  const parent = { postMessage(message: unknown) { messages.push(message); } };
  runInNewContext(script, {
    document: { getElementById: (id: string) => id === "status" ? status : retry },
    location: { search: "?url=https%3A%2F%2Fpage.example%2Fstory&title=Example&token=svr_test" },
    window: { parent },
    URLSearchParams,
    URL,
    fetch: async (path: string, init: RequestInit) => {
      requests.push({ path, init });
      return { ok: true };
    },
  });
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, "/api/bookmarks");
  assert.equal(requests[0].init.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[0].init.body)), {
    url: "https://page.example/story",
    title: "Example",
    collection_id: null,
    quick_save: true,
  });
  assert.equal((requests[0].init.headers as Record<string, string>).Authorization, "Bearer svr_test");
  assert.equal(status.textContent, "Saved to Unsorted");
  assert.deepEqual(JSON.parse(JSON.stringify(messages)), [{ type: "savers-quick-save", state: "saved", message: "Saved to Unsorted" }]);
});
