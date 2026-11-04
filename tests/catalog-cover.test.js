import test from "node:test";
import assert from "node:assert/strict";
import { metaFromCatalog, metaFromDeezerTrack, scoreDeezerCandidate } from "../src/lib/deezer-match.js";

test("metaFromCatalog lê coverUrl, previewUrl e deezerId do catálogo", () => {
  assert.deepEqual(
    metaFromCatalog({
      code: "4920",
      coverUrl: "https://cdn-images.dzcdn.net/images/cover/abc/250x250-000000-80-0-0.jpg",
      previewUrl: "https://cdnt-preview.dzcdn.net/x.mp3",
      deezerId: "123",
    }),
    {
      cover: "https://cdn-images.dzcdn.net/images/cover/abc/250x250-000000-80-0-0.jpg",
      previewUrl: "https://cdnt-preview.dzcdn.net/x.mp3",
      deezerId: "123",
    },
  );
});

test("metaFromCatalog sem capa deixa Deezer como fallback", () => {
  assert.deepEqual(metaFromCatalog({ code: "1", title: "X", artist: "Y" }), {
    cover: null,
    previewUrl: null,
    deezerId: null,
  });
});

test("metaFromDeezerTrack expõe ids estáveis para enrich offline", () => {
  assert.deepEqual(
    metaFromDeezerTrack({
      id: 99,
      preview: "https://cdnt-preview.dzcdn.net/x.mp3",
      duration: 210,
      artist: { id: 7, name: "10cc" },
      album: { cover_medium: "https://cdn-images.dzcdn.net/images/cover/abc/250x250-000000-80-0-0.jpg" },
    }),
    {
      cover: "https://cdn-images.dzcdn.net/images/cover/abc/250x250-000000-80-0-0.jpg",
      previewUrl: "https://cdnt-preview.dzcdn.net/x.mp3",
      deezerId: "99",
      deezerArtistId: "7",
      duration: 210,
    },
  );
});

test("scoreDeezerCandidate segue disponível para o backfill", () => {
  const score = scoreDeezerCandidate(
    { title: "I'm Not In Love", artist: { name: "10cc" } },
    { title: "I'M NOT IN LOVE", artist: "10cc", code: "4920" },
  );
  assert.equal(score, 4);
});
