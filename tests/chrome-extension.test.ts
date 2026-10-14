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

test("extension options retain the token and verify it with Savers", async () => {
  type Element = { value: string; textContent: string; placeholder: string; disabled: boolean; addEventListener: (event: string, listener: (event: { preventDefault(): void }) => Promise<void>) => void };
  const listeners = new Map<string, (event: { preventDefault(): void }) => Promise<void>>();
  const elements = new Map<string, Element>();
  for (const id of ["token", "status", "saved-token", "test-token", "token-form", "clear-token"]) {
    elements.set(id, {
      value: "", textContent: "", placeholder: "", disabled: false,
      addEventListener(event, listener) { listeners.set(`${id}:${event}`, listener); },
    });
  }
  const stored: Record<string, string> = {};
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const script = readFileSync(new URL("../chrome-extension/options.js", import.meta.url), "utf8");
  runInNewContext(script, {
    document: { getElementById(id: string) { return elements.get(id); } },
    chrome: {
      storage: {
        local: {
          async get() { return { ...stored }; },
          async set(values: Record<string, string>) { Object.assign(stored, values); },
          async remove(key: string) { delete stored[key]; },
        },
        sync: { async get() { return {}; } },
      },
    },
    AbortSignal,
    fetch: async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return { ok: true, status: 200 };
    },
  });
  await Promise.resolve();
  elements.get("token")!.value = "svr_example_token_1234";
  await listeners.get("token-form:submit")!({ preventDefault() {} });
  assert.equal(stored.saversApiToken, "svr_example_token_1234");
  assert.match(elements.get("saved-token")!.textContent, /svr_…1234/);
  assert.match(elements.get("status")!.textContent, /^Connected\./);
  assert.equal(requests[0].url, "https://savers-production.up.railway.app/api/tokens");
  assert.equal(new Headers(requests[0].init.headers).get("Authorization"), "Bearer svr_example_token_1234");
});
