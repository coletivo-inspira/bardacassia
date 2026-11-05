/**
 * Publish the karaoke catalog as a lean songs.json plus song-covers.json map.
 * CSV / enrichment keep coverUrl on song objects; only the browser payload is split.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

export function catalogPaths(root) {
  return {
    songsJson: join(root, "public", "data", "songs.json"),
    coversJson: join(root, "public", "data", "song-covers.json"),
  };
}

/** Read published catalog and reattach coverUrl from the covers sidecar when present. */
export function loadPublishedSongs(root) {
  const { songsJson, coversJson } = catalogPaths(root);
  if (!existsSync(songsJson)) throw new Error(`Missing ${songsJson}`);
  const songs = JSON.parse(readFileSync(songsJson, "utf8"));
  if (!Array.isArray(songs)) throw new Error(`Expected array in ${songsJson}`);
  if (!existsSync(coversJson)) return songs;
  try {
    const covers = JSON.parse(readFileSync(coversJson, "utf8"));
    if (!covers || typeof covers !== "object") return songs;
    for (const song of songs) {
      const url = covers[String(song.code)];
      if (url && !String(song.coverUrl || "").trim()) song.coverUrl = url;
    }
  } catch {
    /* keep lean songs as-is */
  }
  return songs;
}

/** Strip coverUrl into song-covers.json; write lean songs.json for the client. */
export function writePublishedCatalog(songs, root) {
  const { songsJson, coversJson } = catalogPaths(root);
  mkdirSync(dirname(songsJson), { recursive: true });
  const covers = {};
  const lean = songs.map((song) => {
    const next = { ...song };
    delete next.previewUrl;
    const coverUrl = String(next.coverUrl || "").trim();
    delete next.coverUrl;
    if (coverUrl) covers[String(next.code)] = coverUrl;
    return next;
  });
  const body = `[\n${lean.map((s) => JSON.stringify(s)).join(",\n")}\n]\n`;
  writeFileSync(songsJson, body, "utf8");
  writeFileSync(coversJson, `${JSON.stringify(covers)}\n`, "utf8");
  return { songsPath: songsJson, coversPath: coversJson, coverCount: Object.keys(covers).length };
}
