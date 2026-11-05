import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadPublishedSongs, writePublishedCatalog } from "../scripts/lib/publish-catalog.js";

test("writePublishedCatalog strips coverUrl into song-covers.json", () => {
  const root = mkdtempSync(join(tmpdir(), "bdc-catalog-"));
  try {
    mkdirSync(join(root, "public", "data"), { recursive: true });
    const songs = [
      { code: "1", artist: "A", title: "T", lyricStart: "x", lang: "BRA", coverUrl: "https://example.com/a.jpg", deezerId: "9" },
      { code: "2", artist: "B", title: "U", lyricStart: "y", lang: "EUA" },
    ];
    const published = writePublishedCatalog(songs, root);
    assert.equal(published.coverCount, 1);

    const lean = JSON.parse(readFileSync(join(root, "public", "data", "songs.json"), "utf8"));
    assert.equal(lean[0].coverUrl, undefined);
    assert.equal(lean[0].deezerId, "9");
    assert.equal(lean[1].coverUrl, undefined);

    const covers = JSON.parse(readFileSync(join(root, "public", "data", "song-covers.json"), "utf8"));
    assert.deepEqual(covers, { 1: "https://example.com/a.jpg" });

    const restored = loadPublishedSongs(root);
    assert.equal(restored[0].coverUrl, "https://example.com/a.jpg");
    assert.equal(restored[1].coverUrl, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loadPublishedSongs tolerates missing covers sidecar", () => {
  const root = mkdtempSync(join(tmpdir(), "bdc-catalog-"));
  try {
    mkdirSync(join(root, "public", "data"), { recursive: true });
    writeFileSync(
      join(root, "public", "data", "songs.json"),
      `${JSON.stringify([{ code: "3", artist: "C", title: "V", lyricStart: "z", lang: "BRA" }], null, 0)}\n`,
    );
    const songs = loadPublishedSongs(root);
    assert.equal(songs.length, 1);
    assert.equal(songs[0].code, "3");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
