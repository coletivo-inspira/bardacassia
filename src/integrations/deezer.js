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

function limited(task) {
  return new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
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

function matchScore(track, song) {
  const title = normalizeText(track.title);
  const artist = normalizeText(track.artist?.name);
  const wantedTitle = normalizeText(song.title);
  const wantedArtist = normalizeText(cleanArtist(song.artist));
  const titleMatches = title === wantedTitle || (title.length > 3 && wantedTitle.length > 3 &&
    (title.includes(wantedTitle) || wantedTitle.includes(title)));
  const artistMatches = artist === wantedArtist || (artist.length > 3 && wantedArtist.length > 3 &&
    (artist.includes(wantedArtist) || wantedArtist.includes(artist)));
  return titleMatches && artistMatches ? (title === wantedTitle ? 2 : 1) + (artist === wantedArtist ? 2 : 1) : 0;
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
        cover: track?.album?.cover_medium || null,
        previewUrl: track?.preview || null,
      };
      metaCache.set(song.code, { value, expires: Date.now() + (track ? META_TTL : EMPTY_TTL) });
      persistCache();
      return value;
    } catch {
      return { cover: null, previewUrl: null };
    }
  });
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
