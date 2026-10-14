import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import {
  buildBookmarkletCode,
  buildSaveUrl,
  resolveSaveSource,
} from "../lib/save-url";

test("buildSaveUrl includes token and source url using canonical u param", () => {
  const url = buildSaveUrl({
    baseUrl: "https://example.com",
    token: "svr_test",
    sourceUrl: "https://source.example/item",
  });

  assert.equal(
    url,
    "https://example.com/save?token=svr_test&u=https%3A%2F%2Fsource.example%2Fitem",
  );
});

test("resolveSaveSource prefers u over legacy url", () => {
  const params = new URLSearchParams({
    u: "https://preferred.example",
    url: "https://legacy.example",
  });

  assert.equal(resolveSaveSource(params, "https://referrer.example"), "https://preferred.example");
});

test("resolveSaveSource falls back to legacy url and then referrer", () => {
  assert.equal(
    resolveSaveSource(new URLSearchParams({ url: "https://legacy.example" }), "https://referrer.example"),
    "https://legacy.example",
  );

  assert.equal(
    resolveSaveSource(new URLSearchParams(), "https://referrer.example"),
    "https://referrer.example",
  );
});

test("buildBookmarkletCode generates self-contained popup code", () => {
  const code = buildBookmarkletCode({ baseUrl: "https://example.com" });
  assert.ok(code.startsWith("javascript:(function(){var b="));
  assert.ok(code.includes("/quick-save.html?url="));
  assert.ok(code.includes("window.open(u,'savers-save')"));
  assert.ok(code.includes("f.target='savers-save'"));
  assert.ok(code.includes("f.action=b+'/quick-save.html'"));
  assert.ok(code.includes("a.value=location.href"));
  assert.ok(code.includes("f.submit()"));
  assert.ok(code.endsWith("})()"));
});

test("token bookmarklet shows save status before its iframe loads", () => {
  const code = buildBookmarkletCode({ baseUrl: "https://savers.example", token: "svr_test" });
  const elements: Array<{ id?: string; src?: string; textContent?: string; children: unknown[]; appendChild: (child: unknown) => void; style: { cssText: string }; remove: () => void }> = [];
  const createElement = () => {
    const element = {
      children: [] as unknown[],
      style: { cssText: "" },
      appendChild(child: unknown) { this.children.push(child); },
      remove() {},
    };
    elements.push(element);
    return element;
  };
  const body = { appendChild(child: unknown) { this.child = child; }, child: null as unknown };
  runInNewContext(code.slice("javascript:".length), {
    document: { getElementById: () => null, createElement, body, title: "Example title", addEventListener() {}, removeEventListener() {} },
    location: { href: "https://page.example/story" },
    window: { addEventListener() {}, removeEventListener() {} },
    encodeURIComponent,
    setTimeout: () => 1,
    clearTimeout() {},
  });

  assert.equal(elements.find((element) => element.id === "savers-bm-root"), body.child);
  assert.match(elements.find((element) => element.id === "savers-bm-root")?.style.cssText ?? "", /top:12px/);
  assert.doesNotMatch(elements.find((element) => element.id === "savers-bm-root")?.style.cssText ?? "", /inset:0|background:/);
  assert.equal(elements.find((element) => element.textContent === "Saving to Unsorted…")?.textContent, "Saving to Unsorted…");
  const iframe = elements.find((element) => element.src?.includes("/quick-save.html?"));
  assert.ok(iframe);
  const url = new URL(iframe.src!);
  assert.equal(url.searchParams.get("url"), "https://page.example/story");
  assert.equal(url.searchParams.get("title"), "Example title");
  assert.equal(url.searchParams.get("token"), "svr_test");
});
