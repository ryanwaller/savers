import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

test("Chrome toolbar click quick-saves the current page with the extension token", async () => {
  const manifest = JSON.parse(readFileSync(new URL("../chrome-extension/manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.action.default_popup, undefined);
  assert.equal(manifest.options_ui.page, "options.html");

  let onClick: ((tab: { id: number; url: string; title: string }) => void) | undefined;
  let resolveSaved!: () => void;
  const saved = new Promise<void>((resolve) => { resolveSaved = resolve; });
  const messages: Array<{ state: string; message: string }> = [];
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const chrome = {
    action: {
      onClicked: { addListener(listener: typeof onClick) { onClick = listener; } },
      setBadgeBackgroundColor: async () => {},
      setBadgeText: async () => {},
      setTitle: async () => {},
    },
    alarms: { create() {}, onAlarm: { addListener() {} } },
    contextMenus: { onClicked: { addListener() {} } },
    runtime: {
      onMessage: { addListener() {} },
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
    },
    storage: {
      sync: { get: async () => ({}) },
      local: { get: async () => ({ saversApiToken: "svr_test" }) },
    },
    tabs: {
      sendMessage: async (_id: number, message: { state: string; message: string }) => {
        messages.push(message);
        if (message.state === "saved") resolveSaved();
      },
    },
  };

  const script = readFileSync(new URL("../chrome-extension/background.js", import.meta.url), "utf8");
  runInNewContext(script, {
    chrome,
    Headers,
    URL,
    setTimeout: () => 1,
    fetch: async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ bookmark: { id: "saved" } }) };
    },
  });
  assert.ok(onClick);
  onClick({ id: 7, url: "https://page.example/story", title: "Example story" });
  await saved;

  assert.deepEqual(messages.map(({ state }) => state), ["saving", "saved"]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://savers-production.up.railway.app/api/bookmarks");
  assert.equal(requests[0].init.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[0].init.body)), {
    url: "https://page.example/story",
    title: "Example story",
    collection_id: null,
    quick_save: true,
  });
  assert.equal(new Headers(requests[0].init.headers).get("Authorization"), "Bearer svr_test");
});
