/** Matching puro Deezer ↔ catálogo (browser e scripts Node). */
import { cleanArtist, normalizeText } from "./catalog.js";

/** Strip remaster/live/parenthetical noise so "The Kill (Bury Me)" ≈ "The Kill". */
export function coreTitle(value) {
  return normalizeText(String(value || "")
    .replace(/\s*[([][^)\]]*[)\]]/g, " ")
    .replace(/\s+[-–—]\s+(?:remaster(?:ed)?|live|ao vivo|radio edit|album version).*$/i, ""));
}

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function numberToWords(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num < 0 || num > 99) return String(n);
  if (num < 20) return ONES[num];
  const ten = TENS[Math.floor(num / 10)];
  const one = num % 10;
  return one ? `${ten} ${ONES[one]}` : ten;
}

/** "30 seconds to mars" ↔ "thirty seconds to mars" for Deezer artist spelling. */
export function expandNumberWords(value) {
  return normalizeText(value).replace(/\b\d{1,2}\b/g, (digits) => numberToWords(digits));
}

function titlesMatch(trackTitle, songTitle) {
  const a = coreTitle(trackTitle);
  const b = coreTitle(songTitle);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.length > 3 && b.length > 3 && (a.includes(b) || b.includes(a));
}

function artistsMatch(trackArtist, songArtist) {
  const a = normalizeText(trackArtist);
  const b = normalizeText(cleanArtist(songArtist));
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length > 3 && b.length > 3 && (a.includes(b) || b.includes(a))) return true;
  const ea = expandNumberWords(a);
  const eb = expandNumberWords(b);
  return ea === eb || (ea.length > 3 && eb.length > 3 && (ea.includes(eb) || eb.includes(ea)));
}

/** Score 0 = no match; 1–4 = better title/artist exactness. */
export function scoreDeezerCandidate(track, song) {
  const titleExact = coreTitle(track.title) === coreTitle(song.title);
  const artistExact = normalizeText(track.artist?.name) === normalizeText(cleanArtist(song.artist))
    || expandNumberWords(track.artist?.name) === expandNumberWords(cleanArtist(song.artist));
  const titleOk = titlesMatch(track.title, song.title);
  const artistOk = artistsMatch(track.artist?.name, song.artist);
  return titleOk && artistOk ? (titleExact ? 2 : 1) + (artistExact ? 2 : 1) : 0;
}

/** Meta already stored on the catalog song (by code). */
export function metaFromCatalog(song) {
  if (!song) return { cover: null, previewUrl: null };
  const cover = String(song.coverUrl || song.cover || "").trim() || null;
  const previewUrl = String(song.previewUrl || song.preview || "").trim() || null;
  return { cover, previewUrl };
}

export function pickBestDeezerTrack(candidates, song) {
  const list = Array.isArray(candidates) ? candidates : [];
  const best = list
    .map((track) => ({ track, score: scoreDeezerCandidate(track, song) }))
    .sort((a, b) => b.score - a.score)[0];
  return best?.score > 0 ? best.track : null;
}

export function metaFromDeezerTrack(track) {
  if (!track) return { cover: null, previewUrl: null };
  return {
    cover: track?.album?.cover_medium || track?.album?.cover || track?.album?.cover_big || null,
    previewUrl: track?.preview || null,
  };
}
