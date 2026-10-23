/** Helpers puros para busca e conciliação com o catálogo de karaokê. */
export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/&/g, " e ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function cleanArtist(value) {
  return String(value || "").replace(/\.\.\.$/, "").trim();
}

function scoreSong(song, query, tokens) {
  const title = normalizeText(song.title);
  const artist = normalizeText(cleanArtist(song.artist));
  const code = normalizeText(song.code);
  const lyric = normalizeText(song.lyricStart);
  const haystack = [title, artist, code, lyric].join(" ");
  if (!tokens.every((token) => haystack.includes(token))) return -1;
  if (code === query) return 120;
  if (title === query) return 110;
  if (artist === query) return 100;
  if (title.startsWith(query)) return 90;
  if (artist.startsWith(query)) return 80;
  if (code.startsWith(query)) return 75;
  if (title.includes(query)) return 65;
  if (artist.includes(query)) return 60;
  if (lyric.includes(query)) return 40;
  return 10;
}

export function searchCatalog(list, rawQuery) {
  const query = normalizeText(rawQuery);
  if (!query) return list;
  const tokens = query.split(" ");
  return list
    .map((song, index) => ({ song, index, score: scoreSong(song, query, tokens) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ song }) => song);
}

function normalizedTrackTitle(value) {
  return normalizeText(String(value || "")
    .replace(/\s*[([](?:remaster(?:ed)?|live|ao vivo|radio edit|vers[aã]o)[^\])]*[\])]/gi, "")
    .replace(/\s+[-–]\s+(?:remaster(?:ed)?|live|ao vivo|radio edit).*$/i, ""));
}

/** Importa apenas faixas que existem no karaokê. Nunca inventa códigos. */
export function matchSpotifyTracks(catalog, tracks) {
  const byTitle = new Map();
  for (const song of catalog) {
    const title = normalizedTrackTitle(song.title);
    if (!title) continue;
    if (!byTitle.has(title)) byTitle.set(title, []);
    byTitle.get(title).push(song);
  }

  const matched = [];
  const seen = new Set();
  for (const track of tracks) {
    const title = normalizedTrackTitle(track.name);
    const candidates = byTitle.get(title) || [];
    const artists = (track.artists || []).map((artist) => normalizeText(artist.name)).filter(Boolean);
    const song = candidates.find((candidate) => {
      const catalogArtist = normalizeText(cleanArtist(candidate.artist));
      return artists.some((artist) =>
        artist.length >= 3 && (catalogArtist === artist ||
          catalogArtist.includes(artist) || artist.includes(catalogArtist))
      );
    });
    if (song && !seen.has(song.code)) {
      seen.add(song.code);
      matched.push(song);
    }
  }
  return matched;
}

/** Fallback editorial: só sugere artistas do mesmo grupo já curado e presentes no catálogo. */
export function curatedArtistSuggestions(catalog, artist, packs, limit = 8) {
  const target = normalizeText(artist);
  const available = new Map();
  for (const song of catalog) available.set(normalizeText(cleanArtist(song.artist)), cleanArtist(song.artist));
  const names = [];
  for (const pack of packs) {
    if (!pack.artists.some((name) => normalizeText(name) === target)) continue;
    for (const name of pack.artists) {
      const candidate = available.get(normalizeText(name));
      if (candidate && normalizeText(candidate) !== target && !names.includes(candidate)) names.push(candidate);
    }
  }
  return names.slice(0, limit);
}

/** One source for results, suggestions and counts. Codes remain strings. */
export function filterCatalog(catalog, { query = '', language = '', artist = '', favoritesOnly = false, favoriteCodes = new Set(), category = null } = {}) {
  const list = catalog.filter((song) => {
    const name = normalizeText(cleanArtist(song.artist));
    if (language && song.lang !== language) return false;
    if (artist && name !== normalizeText(artist)) return false;
    if (favoritesOnly && !favoriteCodes.has(song.code)) return false;
    if (category?.type === 'letter' && !name.startsWith(normalizeText(category.value))) return false;
    if (category?.type === 'artists' && !category.value.some((value) => {
      const key = normalizeText(value);
      return name === key || name.includes(key) || key.includes(name);
    })) return false;
    return true;
  });
  return searchCatalog(list, query);
}
