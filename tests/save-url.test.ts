import test from "node:test";
import assert from "node:assert/strict";
import { buildSaveUrl, resolveSaveSource } from "../lib/save-url";

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
