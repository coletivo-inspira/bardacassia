import test from "node:test";
import assert from "node:assert/strict";
import { codesToUpload, mergeFavoriteCodes, MAX_SYNCED_FAVORITES } from "../src/lib/favorites.js";

test("merges local and account favorites without duplicates", () => {
  const merged = mergeFavoriteCodes(new Set(["1001", "1002"]), ["1002", "2001"]);
  assert.deepEqual([...merged].sort(), ["1001", "1002", "2001"]);
});

test("drops codes that are no longer in the catalog", () => {
  const catalog = new Set(["1001", "2001"]);
  const merged = mergeFavoriteCodes(["1001", "9999"], ["2001", "", null], (code) => catalog.has(code));
  assert.deepEqual([...merged].sort(), ["1001", "2001"]);
});

test("normalizes numeric codes to strings", () => {
  assert.deepEqual([...mergeFavoriteCodes([1001], [" 1001 "])], ["1001"]);
});

test("upload list is unique and capped", () => {
  assert.deepEqual(codesToUpload(["1", "1", "2", ""]), ["1", "2"]);
  const many = Array.from({ length: MAX_SYNCED_FAVORITES + 50 }, (_, i) => String(i));
  assert.equal(codesToUpload(many).length, MAX_SYNCED_FAVORITES);
});
