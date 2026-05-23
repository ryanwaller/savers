import test from "node:test";
import assert from "node:assert/strict";
import { evaluateFilter } from "../lib/smart-collections";
import type { Bookmark, FilterGroup } from "../lib/types";

function bookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    user_id: null,
    collection_id: null,
    url: "https://example.com/page",
    title: "Example Page",
    description: "A description of the example page",
    og_image: null,
    favicon: null,
    tags: ["design", "typography"],
    notes: null,
    position: 0,
    created_at: "2025-01-15T00:00:00.000Z",
    pinned: false,
    ...overrides,
  };
}

// ── Tag filters ──

test("contains tags — matches when bookmark has ALL specified tags", () => {
  const filter: FilterGroup = {
    and: [{ property: "tags", operator: "contains", value: ["design", "typography"] }],
  };
  assert.equal(evaluateFilter(bookmark({ tags: ["design", "typography"] }), filter), true);
  assert.equal(evaluateFilter(bookmark({ tags: ["design", "typography", "extra"] }), filter), true);
  assert.equal(evaluateFilter(bookmark({ tags: ["design"] }), filter), false);
  assert.equal(evaluateFilter(bookmark({ tags: [] }), filter), false);
});

test("not_contains tags — matches when bookmark has NONE of the specified tags", () => {
  const filter: FilterGroup = {
    and: [{ property: "tags", operator: "not_contains", value: ["news", "politics"] }],
  };
  assert.equal(evaluateFilter(bookmark({ tags: ["design"] }), filter), true);
  assert.equal(evaluateFilter(bookmark({ tags: ["design", "news"] }), filter), false);
});

// ── Title filters ──

test("contains title", () => {
  const filter: FilterGroup = {
    and: [{ property: "title", operator: "contains", value: "example" }],
  };
  assert.equal(evaluateFilter(bookmark({ title: "An Example Page" }), filter), true);
  assert.equal(evaluateFilter(bookmark({ title: "Something Else" }), filter), false);
  assert.equal(evaluateFilter(bookmark({ title: null }), filter), false);
});

test("starts_with title", () => {
  const filter: FilterGroup = {
    and: [{ property: "title", operator: "starts_with", value: "an ex" }],
  };
  assert.equal(evaluateFilter(bookmark({ title: "An Example Page" }), filter), true);
  assert.equal(evaluateFilter(bookmark({ title: "Example Page" }), filter), false);
});

// ── Domain filter ──

test("domain contains", () => {
  const filter: FilterGroup = {
    and: [{ property: "domain", operator: "contains", value: "github" }],
  };
  assert.equal(evaluateFilter(bookmark({ url: "https://github.com/user/repo" }), filter), true);
  assert.equal(evaluateFilter(bookmark({ url: "https://example.com" }), filter), false);
});

// ── Date filters ──

test("created_at after", () => {
  const filter: FilterGroup = {
    and: [{ property: "created_at", operator: "after", value: "2025-01-01" }],
  };
  assert.equal(evaluateFilter(bookmark({ created_at: "2025-06-01T00:00:00.000Z" }), filter), true);
  assert.equal(evaluateFilter(bookmark({ created_at: "2024-06-01T00:00:00.000Z" }), filter), false);
});

test("created_at before", () => {
  const filter: FilterGroup = {
    and: [{ property: "created_at", operator: "before", value: "2025-06-01" }],
  };
  assert.equal(evaluateFilter(bookmark({ created_at: "2025-01-15T00:00:00.000Z" }), filter), true);
  assert.equal(evaluateFilter(bookmark({ created_at: "2025-07-01T00:00:00.000Z" }), filter), false);
});

test("created_at with relative date", () => {
  // "now-7d" = 7 days ago. Bookmark from 1 day ago should match.
  const filter: FilterGroup = {
    and: [{ property: "created_at", operator: "after", value: "now-7d" }],
  };
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const lastMonth = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(evaluateFilter(bookmark({ created_at: yesterday }), filter), true);
  assert.equal(evaluateFilter(bookmark({ created_at: lastMonth }), filter), false);
});

// ── Pinned filter ──

test("pinned equals true", () => {
  const filter: FilterGroup = {
    and: [{ property: "pinned", operator: "equals", value: true }],
  };
  assert.equal(evaluateFilter(bookmark({ pinned: true }), filter), true);
  assert.equal(evaluateFilter(bookmark({ pinned: false }), filter), false);
});

// ── Compound filters (AND/OR) ──

test("AND combines conditions", () => {
  const filter: FilterGroup = {
    and: [
      { property: "tags", operator: "contains", value: ["design"] },
      { property: "domain", operator: "contains", value: "dribbble" },
    ],
  };
  assert.equal(
    evaluateFilter(
      bookmark({ tags: ["design"], url: "https://dribbble.com/shots/123" }),
      filter
    ),
    true
  );
  assert.equal(
    evaluateFilter(
      bookmark({ tags: ["design"], url: "https://example.com" }),
      filter
    ),
    false
  );
});

test("OR combines conditions", () => {
  const filter: FilterGroup = {
    or: [
      { property: "tags", operator: "contains", value: ["design"] },
      { property: "tags", operator: "contains", value: ["dev"] },
    ],
  };
  assert.equal(evaluateFilter(bookmark({ tags: ["design"] }), filter), true);
  assert.equal(evaluateFilter(bookmark({ tags: ["dev"] }), filter), true);
  assert.equal(evaluateFilter(bookmark({ tags: ["writing"] }), filter), false);
});

test("nested AND inside OR", () => {
  const filter: FilterGroup = {
    or: [
      { property: "pinned", operator: "equals", value: true },
      {
        and: [
          { property: "tags", operator: "contains", value: ["design"] },
          { property: "domain", operator: "contains", value: "dribbble" },
        ],
      },
    ],
  };
  assert.equal(evaluateFilter(bookmark({ pinned: true }), filter), true);
  assert.equal(
    evaluateFilter(
      bookmark({ tags: ["design"], url: "https://dribbble.com" }),
      filter
    ),
    true
  );
  assert.equal(
    evaluateFilter(
      bookmark({ tags: ["design"], url: "https://example.com" }),
      filter
    ),
    false
  );
});

test("empty filter returns false", () => {
  assert.equal(evaluateFilter(bookmark(), {} as FilterGroup), false);
});
