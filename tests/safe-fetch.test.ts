import test from "node:test";
import assert from "node:assert/strict";
import { isPublicUrl } from "../lib/public-url";
import { safePublicFetch } from "../lib/safe-fetch";

test("public URL validation rejects private and reserved destinations", () => {
  for (const url of [
    "http://127.0.0.2/",
    "http://169.254.0.1/",
    "http://10.1.2.3/",
    "http://172.31.0.1/",
    "http://192.168.1.1/",
    "http://[fd00::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://localhost/",
    "https://metadata.google.internal/",
    "http://user:pass@example.com/",
  ]) assert.equal(isPublicUrl(url), false, url);
  assert.equal(isPublicUrl("https://example.org/path"), true);
  assert.equal(isPublicUrl("https://[2606:4700:4700::1111]/"), true);
});

test("safe fetch rejects private destinations before connecting", async () => {
  await assert.rejects(safePublicFetch("http://127.0.0.2/"), /public HTTP/);
  await assert.rejects(safePublicFetch("http://[fd00::1]/"), /public HTTP/);
});
