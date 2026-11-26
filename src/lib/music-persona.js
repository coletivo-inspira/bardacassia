/** Persona musical e sugestões a partir do resumo salvo em music_profiles. Funções puras. */
import { artistMatchKey, cleanArtist, matchSpotifyTracks, normalizeText } from "./catalog.js";
import { GENRES, genreById } from "./genres.js";

export const TIME_RANGES = ["long_term", "medium_term", "short_term"];
const RANGE_WEIGHT = { long_term: 1, medium_term: 0.8, short_term: 0.5 };
const TRACK_ARTIST_WEIGHT = 0.5;
const RECENT_WEIGHT = 0.3;
const MIN_GENRE_SHARE = 0.08;

export const RANGE_LABELS = {
  short_term: "Últimas 4 semanas",
  medium_term: "Últimos 6 meses",
  long_term: "Último ano",
};

/** Spotify genre strings (normalized) → curated style. First matching rule wins per genre string. */
const GENRE_RULES = [
  ["gospel", /\b(gospel|worship|louvor|adoracao|christian|ccm|catolica)\b/],
  ["sertanejo", /\b(sertanej\w*|agronejo|arrocha|modao|musica caipira)\b/],
  ["forro-axe", /\b(forro|piseiro|pisadinha|axe|xote|baiao|frevo|pagodao|tecnobrega|brega)\b/],
  ["funk", /\b(funk (carioca|paulista|mtg|melody|ostentacao|consciente|pop|bh)|baile funk|brega funk|rave funk)\b/],
  ["pagode-samba", /\b(pagode|samba)\b/],
  ["mpb", /\b(mpb|bossa nova|tropicalia|musica popular brasileira)\b/],
  ["rock-nacional", /\b(brazilian|brasileir\w*|nacional|gaucho) (rock|punk|metal|indie|alternative)\b|\brock (brasileiro|nacional|gaucho)\b/],
  ["romanticas", /\b(romantic\w*|bolero|adult standards|soft rock|jovem guarda|seresta)\b/],
  ["anos-80-90", /\b(new wave|eurodance|synthpop|80s|90s|italo disco)\b/],
  ["rock-internacional", /\b(rock|metal|grunge|punk|britpop|alternative)\b/],
  ["pop", /\bpop\b/],
];

export function styleForSpotifyGenre(genre) {
  const text = normalizeText(genre);
  if (!text) return null;
  for (const [id, pattern] of GENRE_RULES) if (pattern.test(text)) return id;
  return null;
}

const CURATED_BY_ARTIST = (() => {
  const map = new Map();
  for (const genre of GENRES) {
    for (const name of genre.artists) {
      const key = artistMatchKey(name);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(genre.id);
    }
  }
  return map;
})();

function rankWeight(index, total) {
  return total > 0 ? (total - index) / total : 0;
}

function listFor(group, range) {
  return Array.isArray(group?.[range]) ? group[range] : [];
}

/** Artists scored by position across ranges, track credits and recent plays. */
export function scoreArtists(profile) {
  const scores = new Map();
  const add = (artist, points, details = null) => {
    const key = artistMatchKey(artist?.name);
    if (!key || points <= 0) return;
    const entry = scores.get(key) || { key, name: String(artist.name), score: 0, genres: [], image: "" };
    entry.score += points;
    if (details?.genres?.length && !entry.genres.length) entry.genres = details.genres.map(String);
    if (details?.image && !entry.image) entry.image = String(details.image);
    scores.set(key, entry);
  };
  for (const range of TIME_RANGES) {
    const weight = RANGE_WEIGHT[range];
    const artists = listFor(profile?.top_artists, range);
    artists.forEach((artist, index) => add(artist, weight * rankWeight(index, artists.length), artist));
    const tracks = listFor(profile?.top_tracks, range);
    tracks.forEach((track, index) => {
      const credit = (weight * TRACK_ARTIST_WEIGHT * rankWeight(index, tracks.length)) / Math.max(1, track.artists?.length || 1);
      (track.artists || []).forEach((artist) => add(artist, credit));
    });
  }
  const recent = Array.isArray(profile?.recent_tracks) ? profile.recent_tracks : [];
  recent.forEach((track) => (track.artists || []).slice(0, 1).forEach((artist) => add(artist, RECENT_WEIGHT / recent.length)));
  return [...scores.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "pt-BR"));
}

/** Curated name match first; Spotify genres fill the gaps (they may come empty). */
export function stylesForArtist(artist) {
  const styles = new Set(CURATED_BY_ARTIST.get(artistMatchKey(artist.name)) || []);
  if (!styles.size) {
    for (const genre of artist.genres || []) {
      const style = styleForSpotifyGenre(genre);
      if (style) styles.add(style);
    }
  }
  return [...styles];
}

function lowerFirst(label) {
  return /^[A-Z]{2,}/.test(label) ? label : label.charAt(0).toLocaleLowerCase("pt-BR") + label.slice(1);
}

export function personaLabel(topGenres) {
  const [first, second] = topGenres;
  if (!first) return "Gosto eclético";
  if (!second || first.share >= 0.6) return `Coração ${lowerFirst(first.label)}`;
  return `${first.label} com pitada de ${lowerFirst(second.label)}`;
}

/** { topGenres: [{id, label, share}], topArtists: [{name, score, image, styles, catalogName}], label } */
export function buildPersona(profile, catalog = []) {
  const catalogNames = new Map();
  for (const song of catalog) {
    const key = artistMatchKey(song.artist);
    if (key && !catalogNames.has(key)) catalogNames.set(key, cleanArtist(song.artist));
  }
  const artists = scoreArtists(profile).map((artist) => ({
    ...artist,
    styles: stylesForArtist(artist),
    catalogName: catalogNames.get(artist.key) || "",
  }));
  const genreScores = new Map();
  for (const artist of artists) {
    for (const style of artist.styles) {
      genreScores.set(style, (genreScores.get(style) || 0) + artist.score / artist.styles.length);
    }
  }
  const total = [...genreScores.values()].reduce((sum, value) => sum + value, 0);
  const topGenres = [...genreScores.entries()]
    .map(([id, score]) => ({ id, label: genreById(id)?.label || id, share: total ? score / total : 0 }))
    .filter((genre) => genre.share >= MIN_GENRE_SHARE)
    .sort((a, b) => b.share - a.share)
    .slice(0, 3);
  return {
    topGenres,
    topArtists: artists.slice(0, 8).map(({ name, score, image, styles, catalogName }) => ({ name, score, image, styles, catalogName })),
    label: personaLabel(topGenres),
  };
}

/** Every saved track, best-ranked first, without repeats across ranges. */
export function rankedTracks(profile) {
  const scored = new Map();
  for (const range of TIME_RANGES) {
    const tracks = listFor(profile?.top_tracks, range);
    tracks.forEach((track, index) => {
      const key = track.id || `${normalizeText(track.name)}|${normalizeText(track.artists?.[0]?.name)}`;
      const entry = scored.get(key) || { track, score: 0 };
      entry.score += RANGE_WEIGHT[range] * rankWeight(index, tracks.length);
      scored.set(key, entry);
    });
  }
  const recent = Array.isArray(profile?.recent_tracks) ? profile.recent_tracks : [];
  recent.forEach((track) => {
    const key = track.id || `${normalizeText(track.name)}|${normalizeText(track.artists?.[0]?.name)}`;
    const entry = scored.get(key) || { track, score: 0 };
    entry.score += RECENT_WEIGHT / recent.length;
    scored.set(key, entry);
  });
  return [...scored.values()].sort((a, b) => b.score - a.score).map(({ track }) => track);
}

/**
 * Catalog songs to sing, in order: songs she listens to, more songs by her top
 * artists, then curated artists of her dominant styles. Each item has a reason.
 */
export function musicSuggestions(catalog, profile, { persona = buildPersona(profile, catalog), limit = 60, perArtist = 3, perStyleArtist = 1, excludeCodes = [] } = {}) {
  const exclude = new Set([...excludeCodes].map(String));
  const seen = new Set();
  const result = [];
  const push = (song, reason, kind) => {
    const code = String(song.code);
    if (seen.has(code) || exclude.has(code) || result.length >= limit) return;
    seen.add(code);
    result.push({ song, reason, kind });
  };

  for (const song of matchSpotifyTracks(catalog, rankedTracks(profile))) push(song, "Você ouve muito", "track");

  const byArtist = new Map();
  for (const song of catalog) {
    const key = artistMatchKey(song.artist);
    if (!key) continue;
    if (!byArtist.has(key)) byArtist.set(key, []);
    byArtist.get(key).push(song);
  }

  for (const artist of scoreArtists(profile).slice(0, 25)) {
    const songs = byArtist.get(artist.key) || [];
    songs.filter((song) => !seen.has(String(song.code))).slice(0, perArtist)
      .forEach((song) => push(song, `Porque você ouve ${artist.name}`, "artist"));
  }

  for (const style of persona.topGenres) {
    for (const name of genreById(style.id)?.artists || []) {
      const songs = byArtist.get(artistMatchKey(name)) || [];
      songs.filter((song) => !seen.has(String(song.code))).slice(0, perStyleArtist)
        .forEach((song) => push(song, `Seu estilo: ${style.label}`, "style"));
    }
  }
  return result;
}

export function hasListeningData(profile) {
  return TIME_RANGES.some((range) => listFor(profile?.top_tracks, range).length || listFor(profile?.top_artists, range).length)
    || (Array.isArray(profile?.recent_tracks) && profile.recent_tracks.length > 0);
}
