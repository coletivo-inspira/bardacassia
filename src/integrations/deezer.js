import { cleanArtist, normalizeText } from "../lib/catalog.js";

const META_KEY = "bdc-deezer-meta-v2";
const META_TTL = 7 * 24 * 60 * 60 * 1000;
const EMPTY_TTL = 24 * 60 * 60 * 1000;
const RELATED_TTL = 24 * 60 * 60 * 1000;
const metaCache = readCache();
const pending = new Map();
const relatedCache = new Map();
const queue = [];
let active = 0;
const MAX_CONCURRENT = 4;

function readCache() {
  try {
    const stored = JSON.parse(localStorage.getItem(META_KEY) || "{}");
    return new Map(Object.entries(stored).filter(([, item]) => item?.expires > Date.now()));
  } catch {
    return new Map();
  }
}

function persistCache() {
  try {
    const entries = [...metaCache.entries()].slice(-500);
    localStorage.setItem(META_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Navegação privada ou cota excedida: o catálogo continua funcionando.
  }
}

function limited(task, code = null) {
  return new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject, code });
    drain();
  });
}

function drain() {
  while (active < MAX_CONCURRENT && queue.length) {
    const job = queue.shift();
    active++;
    Promise.resolve().then(job.task).then(job.resolve, job.reject).finally(() => {
      active--;
      drain();
    });
  }
}

/** Cancela buscas ainda na fila (não iniciadas). Retorna true se removeu da fila. */
export function cancelPendingDeezerMeta(code) {
  const key = String(code);
  let removed = false;
  for (let i = queue.length - 1; i >= 0; i--) {
    if (String(queue[i].code) !== key) continue;
    const [job] = queue.splice(i, 1);
    job.resolve(null);
    removed = true;
  }
  if (removed) pending.delete(key);
  return removed;
}

function jsonp(path, params = {}) {
  return new Promise((resolve, reject) => {
    const callback = `bdcDz_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    const url = new URL(`https://api.deezer.com${path}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    url.searchParams.set("output", "jsonp");
    url.searchParams.set("callback", callback);
    const script = document.createElement("script");
    script.async = true;
    script.referrerPolicy = "no-referrer";
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      delete window[callback];
      script.remove();
    };
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };
    const timer = setTimeout(() => finish(reject, new Error("Tempo esgotado no Deezer")), 7000);
    window[callback] = (data) => finish(resolve, data);
    script.onerror = () => finish(reject, new Error("Deezer indisponível"));
    script.src = url.href;
    document.head.append(script);
  });
}

async function request(path, params = {}) {
  if (import.meta.env.DEV) {
    try {
      const url = new URL(`/api/deezer${path}`, location.origin);
      Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      // Fallback para JSONP.
    }
  }
  return jsonp(path, params);
}

/** Strip remaster/live/parenthetical noise so "The Kill (Bury Me)" ≈ "The Kill". */
function coreTitle(value) {
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
function expandNumberWords(value) {
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

/** Exported for unit tests. */
export function scoreDeezerCandidate(track, song) {
  return matchScore(track, song);
}

function matchScore(track, song) {
  const titleExact = coreTitle(track.title) === coreTitle(song.title);
  const artistExact = normalizeText(track.artist?.name) === normalizeText(cleanArtist(song.artist))
    || expandNumberWords(track.artist?.name) === expandNumberWords(cleanArtist(song.artist));
  const titleOk = titlesMatch(track.title, song.title);
  const artistOk = artistsMatch(track.artist?.name, song.artist);
  return titleOk && artistOk ? (titleExact ? 2 : 1) + (artistExact ? 2 : 1) : 0;
}

export async function fetchDeezerMeta(song) {
  const cached = metaCache.get(song.code);
  if (cached?.expires > Date.now()) return cached.value;
  if (pending.has(song.code)) return pending.get(song.code);

  const promise = limited(async () => {
    const query = `${cleanArtist(song.artist)} ${song.title}`;
    try {
      const response = await request("/search", { q: query, limit: "8" });
      const candidates = Array.isArray(response?.data) ? response.data : [];
      const best = candidates
        .map((track) => ({ track, score: matchScore(track, song) }))
        .sort((a, b) => b.score - a.score)[0];
      const track = best?.score > 0 ? best.track : null;
      const value = {
        cover: track?.album?.cover_medium || track?.album?.cover || track?.album?.cover_big || null,
        previewUrl: track?.preview || null,
      };
      metaCache.set(song.code, { value, expires: Date.now() + (track ? META_TTL : EMPTY_TTL) });
      persistCache();
      return value;
    } catch {
      return { cover: null, previewUrl: null };
    }
  }, song.code);
  pending.set(song.code, promise);
  try {
    return await promise;
  } finally {
    pending.delete(song.code);
  }
}

/** Resultados externos são sugestões, não músicas disponíveis no karaokê. */
export async function fetchRelatedArtists(artistName) {
  const key = normalizeText(artistName);
  const cached = relatedCache.get(key);
  if (cached?.expires > Date.now()) return cached.names;
  try {
    const search = await limited(() => request("/search/artist", { q: artistName, limit: "5" }));
    const artist = (search?.data || []).find((item) => normalizeText(item.name) === key);
    if (!artist?.id) return [];
    const result = await limited(() => request(`/artist/${encodeURIComponent(artist.id)}/related`, { limit: "20" }));
    const names = (Array.isArray(result?.data) ? result.data : [])
      .map((item) => item.name).filter(Boolean);
    relatedCache.set(key, { names, expires: Date.now() + RELATED_TTL });
    return names;
  } catch {
    return [];
  }
}
