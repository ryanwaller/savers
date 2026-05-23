import test from "node:test";
import assert from "node:assert/strict";
import { canonicalBookmarkUrl, isPublicUrl } from "../lib/api";
import { normalizeUrl } from "../lib/normalizeUrl";

// ── normalizeUrl ──

test("normalizeUrl adds https:// when no scheme is present", () => {
  assert.equal(normalizeUrl("example.com"), "https://example.com");
  assert.equal(normalizeUrl("example.com/path?q=1"), "https://example.com/path?q=1");
});

test("normalizeUrl preserves http:// and https://", () => {
  assert.equal(normalizeUrl("http://example.com"), "http://example.com");
  assert.equal(normalizeUrl("https://example.com"), "https://example.com");
});

test("normalizeUrl rejects javascript: and data: schemes", () => {
  assert.equal(normalizeUrl("javascript:alert(1)"), "");
  assert.equal(normalizeUrl("data:text/html,<script>alert(1)</script>"), "");
});

test("normalizeUrl rejects file: scheme", () => {
  assert.equal(normalizeUrl("file:///etc/passwd"), "");
});

test("normalizeUrl rejects ftp: and other non-http schemes", () => {
  assert.equal(normalizeUrl("ftp://example.com/file"), "");
});

test("normalizeUrl returns empty for empty input", () => {
  assert.equal(normalizeUrl(""), "");
  assert.equal(normalizeUrl("  "), "");
});

// ── canonicalBookmarkUrl ──

test("canonicalBookmarkUrl strips www and trailing slashes", () => {
  const result = canonicalBookmarkUrl("https://www.example.com/path/");
  assert.equal(result, "example.com/path");
});

test("canonicalBookmarkUrl strips utm_ params", () => {
  const result = canonicalBookmarkUrl(
    "https://example.com/page?utm_source=twitter&utm_medium=social&keep=me"
  );
  assert.equal(result, "example.com/page?keep=me");
});

test("canonicalBookmarkUrl strips fbclid and gclid", () => {
  const result = canonicalBookmarkUrl(
    "https://example.com/page?fbclid=abc123&gclid=def456&x=1"
  );
  assert.equal(result, "example.com/page?x=1");
});

test("canonicalBookmarkUrl sorts remaining query params", () => {
  const result = canonicalBookmarkUrl("https://example.com/page?b=2&a=1");
  assert.equal(result, "example.com/page?a=1&b=2");
});

test("canonicalBookmarkUrl handles empty path and query", () => {
  const result = canonicalBookmarkUrl("https://www.example.com");
  assert.equal(result, "example.com/");
});

// ── isPublicUrl ──

test("isPublicUrl allows public URLs", () => {
  assert.equal(isPublicUrl("https://example.com"), true);
  assert.equal(isPublicUrl("https://github.com/ryanwaller/savers"), true);
  assert.equal(isPublicUrl("https://sub.domain.example.co.uk/path"), true);
});

test("isPublicUrl blocks localhost", () => {
  assert.equal(isPublicUrl("http://localhost:3000"), false);
  assert.equal(isPublicUrl("https://localhost"), false);
  assert.equal(isPublicUrl("http://127.0.0.1:3000"), false);
  assert.equal(isPublicUrl("http://[::1]"), false);
});

test("isPublicUrl blocks private IP ranges", () => {
  assert.equal(isPublicUrl("http://10.0.0.1"), false);
  assert.equal(isPublicUrl("http://192.168.1.1"), false);
  assert.equal(isPublicUrl("http://172.16.0.1"), false);
  assert.equal(isPublicUrl("http://172.31.255.255"), false);
});

test("isPublicUrl blocks .local and .internal domains", () => {
  assert.equal(isPublicUrl("http://server.local"), false);
  assert.equal(isPublicUrl("http://host.internal"), false);
});

test("isPublicUrl blocks AWS/GCP metadata endpoints", () => {
  assert.equal(isPublicUrl("http://169.254.169.254/latest/meta-data"), false);
  assert.equal(isPublicUrl("http://metadata.google.internal"), false);
});

test("isPublicUrl blocks .test, .invalid, .example TLDs", () => {
  assert.equal(isPublicUrl("http://example.test"), false);
  assert.equal(isPublicUrl("http://example.invalid"), false);
  assert.equal(isPublicUrl("http://example.example"), false);
});

test("isPublicUrl blocks empty and truly unparseable input", () => {
  assert.equal(isPublicUrl(""), false);
});
