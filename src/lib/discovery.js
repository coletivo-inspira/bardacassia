import { cleanArtist, normalizeText } from "./catalog.js";

export function catalogArtists(songs) {
  const seen = new Map();
  for (const song of songs) {
    const name = cleanArtist(song.artist);
    const key = normalizeText(name);
    if (key && !seen.has(key)) seen.set(key, name);
  }
  return [...seen.entries()].map(([key, name]) => ({ key, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export function filterArtists(artists, query) {
  const normalized = normalizeText(query);
  if (!normalized) return artists;
  return artists.filter(({ name }) => normalizeText(name).includes(normalized));
}

function roundRobinByArtist(songs, artists, source) {
  const byArtist = new Map();
  const chosenKeys = new Set(artists.map((name) => normalizeText(name)));
  for (const song of songs) {
    const artist = normalizeText(cleanArtist(song.artist));
    if (!chosenKeys.has(artist)) continue;
    if (!byArtist.has(artist)) byArtist.set(artist, []);
    byArtist.get(artist).push(song);
  }
  const result = [];
  let remaining = true;
  while (remaining) {
    remaining = false;
    for (const name of artists) {
      const next = byArtist.get(normalizeText(name))?.shift();
      if (next) {
        result.push({ ...next, source });
        remaining = true;
      }
    }
  }
  return result;
}

/**
 * Chosen artists lead; songs from the chosen styles' artists follow, then popular/editorial.
 * `selection` may be a plain artist list (legacy) or `{ artists, genreArtists }`.
 */
export function buildDiscoveryQueue(songs, selection, popularSongs = [], editorialArtists = []) {
  const { artists = [], genreArtists = [] } = Array.isArray(selection) ? { artists: selection } : selection || {};
  const chosenKeys = new Set(artists.map(normalizeText));
  const personal = [
    ...roundRobinByArtist(songs, artists, "Artista escolhido"),
    ...roundRobinByArtist(songs, genreArtists.filter((name) => !chosenKeys.has(normalizeText(name))), "Do estilo escolhido"),
  ];

  let editorial = [];
  if (!popularSongs.length && editorialArtists.length) {
    const keys = new Set(editorialArtists.map(normalizeText));
    editorial = songs.filter((song) => keys.has(normalizeText(cleanArtist(song.artist))))
      .map((song) => ({ ...song, source: "Sugestão da casa" }));
  }
  const popular = popularSongs.map((entry) => {
    const song = typeof entry === "string" ? songs.find((item) => item.code === entry) : entry;
    return song ? { ...song, source: "Mais popular" } : null;
  }).filter(Boolean);
  const secondary = popular.length ? popular : editorial;
  const result = [];
  const seen = new Set();
  let personalIndex = 0;
  let secondaryIndex = 0;
  while (personalIndex < personal.length || secondaryIndex < secondary.length) {
    for (let i = 0; i < 2 && personalIndex < personal.length; i++) {
      const song = personal[personalIndex++];
      if (!seen.has(song.code)) { result.push(song); seen.add(song.code); }
    }
    if (secondaryIndex < secondary.length) {
      const song = secondary[secondaryIndex++];
      if (!seen.has(song.code)) { result.push(song); seen.add(song.code); }
    }
  }
  return result;
}

export function sanitizeDiscoveryState(value, songCodes) {
  const allowed = new Set(songCodes.map(String));
  const validStrings = (items, max = 2000) => Array.isArray(items)
    ? [...new Set(items.filter((item) => typeof item === "string").map(String))].slice(0, max)
    : [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyDiscoveryState();
  const artists = [...new Map(validStrings(value.artists, 500).map((name) => name.slice(0, 120)).map((name) => [normalizeText(name), name]).filter(([key]) => key)).values()];
  const genres = validStrings(value.genres, 50).map((id) => id.slice(0, 40));
  const queue = validStrings(value.queue).filter((code) => allowed.has(code)).slice(0, 2000);
  const list = validStrings(value.list).slice(0, 2000);
  const seen = validStrings(value.seen).slice(0, 2000);
  const passed = validStrings(value.passed).filter((code) => allowed.has(code)).slice(0, 2000);
  const history = Array.isArray(value.history) ? value.history.slice(-1).map((entry) => {
    if (!entry || !["pass", "choose"].includes(entry.action) || typeof entry.code !== "string" || !allowed.has(entry.code)) return null;
    return { action: entry.action, code: entry.code, index: Number.isInteger(entry.index) ? Math.max(0, entry.index) : 0, added: entry.added === true };
  }).filter(Boolean) : [];
  return {
    version: 2,
    genres,
    artists,
    queue,
    index: Math.max(0, Math.min(Number.isInteger(value.index) ? value.index : 0, queue.length)),
    seen: seen.filter((code) => allowed.has(code)),
    passed,
    list,
    history,
  };
}

export function emptyDiscoveryState() {
  return { version: 2, genres: [], artists: [], queue: [], index: 0, seen: [], passed: [], list: [], history: [] };
}
