import test from "node:test";
import assert from "node:assert/strict";
import { metaFromCatalog, scoreDeezerCandidate } from "../src/lib/deezer-match.js";

test("metaFromCatalog lê coverUrl e previewUrl do código no catálogo", () => {
  assert.deepEqual(
    metaFromCatalog({
      code: "4920",
      coverUrl: "https://cdn-images.dzcdn.net/images/cover/abc/250x250-000000-80-0-0.jpg",
      previewUrl: "https://cdnt-preview.dzcdn.net/x.mp3",
    }),
    {
      cover: "https://cdn-images.dzcdn.net/images/cover/abc/250x250-000000-80-0-0.jpg",
      previewUrl: "https://cdnt-preview.dzcdn.net/x.mp3",
    },
  );
});

test("metaFromCatalog sem capa deixa Deezer como fallback", () => {
  assert.deepEqual(metaFromCatalog({ code: "1", title: "X", artist: "Y" }), {
    cover: null,
    previewUrl: null,
  });
});

test("scoreDeezerCandidate segue disponível para o backfill", () => {
  const score = scoreDeezerCandidate(
    { title: "I'm Not In Love", artist: { name: "10cc" } },
    { title: "I'M NOT IN LOVE", artist: "10cc", code: "4920" },
  );
  assert.equal(score, 4);
});
