/** Offline song-to-song connections for discovery and dialog. */
import { cleanArtist, normalizeText } from "./catalog.js";
import { GENRES } from "./genres.js";

const DEFAULT_LIMIT = 12;

function artistKey(song) {
  return normalizeText(cleanArtist(song?.artist));
}

/** Map normalized artist name → curated genre ids. */
export function artistGenreIndex(genres = GENRES) {
  const index = new Map();
  for (const genre of genres) {
    for (const name of genre.artists || []) {
      const key = normalizeText(name);
      if (!key) continue;
      if (!index.has(key)) index.set(key, []);
      const list = index.get(key);
      if (!list.includes(genre.id)) list.push(genre.id);
    }
  }
  return index;
}

/**
 * Build a compact adjacency map: code → related karaoke codes.
 * Prefers same artist, then shared curated genres, then same language.
 */
export function buildSongConnections(songs, { limit = DEFAULT_LIMIT, genres = GENRES } = {}) {
  const list = Array.isArray(songs) ? songs : [];
  const byArtist = new Map();
  const byLang = new Map();
  const byGenre = new Map();
  const genreIndex = artistGenreIndex(genres);

  for (const song of list) {
    const code = String(song.code);
    const artist = artistKey(song);
    if (artist) {
      if (!byArtist.has(artist)) byArtist.set(artist, []);
      byArtist.get(artist).push(code);
    }
    const lang = String(song.lang || "").trim().toUpperCase();
    if (lang) {
      if (!byLang.has(lang)) byLang.set(lang, []);
      byLang.get(lang).push(code);
    }
    for (const genreId of genreIndex.get(artist) || []) {
      if (!byGenre.has(genreId)) byGenre.set(genreId, []);
      byGenre.get(genreId).push(code);
    }
  }

  const connections = {};
  for (const song of list) {
    const code = String(song.code);
    const seen = new Set([code]);
    const related = [];

    const pushPool = (pool) => {
      if (!pool) return;
      for (const other of pool) {
        if (seen.has(other)) continue;
        seen.add(other);
        related.push(other);
        if (related.length >= limit) return;
      }
    };

    const artist = artistKey(song);
    pushPool(byArtist.get(artist));
    if (related.length < limit) {
      for (const genreId of genreIndex.get(artist) || []) {
        pushPool(byGenre.get(genreId));
        if (related.length >= limit) break;
      }
    }
    if (related.length < limit) {
      const lang = String(song.lang || "").trim().toUpperCase();
      pushPool(byLang.get(lang));
    }

    if (related.length) connections[code] = related;
  }
  return connections;
}

/** Related codes for one song from a prebuilt map. */
export function relatedCodesFor(connections, code, { limit = DEFAULT_LIMIT } = {}) {
  if (!connections || typeof connections !== "object") return [];
  const list = connections[String(code)];
  if (!Array.isArray(list)) return [];
  return list.map(String).filter(Boolean).slice(0, limit);
}
