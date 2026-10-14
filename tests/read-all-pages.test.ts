import test from "node:test";
import assert from "node:assert/strict";
import { readAllPages } from "../lib/read-all-pages";

test("readAllPages collects beyond the PostgREST row cap", async () => {
  const source = Array.from({ length: 1203 }, (_, index) => index);
  const calls: number[] = [];
  const rows = await readAllPages((from, to) => {
    calls.push(from);
    return Promise.resolve({ data: source.slice(from, to + 1), error: null });
  });
  assert.deepEqual(rows, source);
  assert.deepEqual(calls, [0, 500, 1000]);
});

test("readAllPages propagates query errors", async () => {
  await assert.rejects(readAllPages(() => Promise.resolve({ data: null, error: { message: "query failed" } })), /query failed/);
});
