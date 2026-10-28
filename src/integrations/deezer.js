import { cleanArtist, normalizeText } from "../lib/catalog.js";
import {
  metaFromCatalog,
  metaFromDeezerTrack,
  pickBestDeezerTrack,
  scoreDeezerCandidate,
} from "../lib/deezer-match.js";

export { scoreDeezerCandidate, metaFromCatalog } from "../lib/deezer-match.js";

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

/**
 * Prefer cover/preview already linked to the karaoke code in songs.json.
 * Only hits Deezer when the catalog song has no coverUrl.
 */
export async function fetchDeezerMeta(song) {
  const fromCatalog = metaFromCatalog(song);
  if (fromCatalog.cover) return fromCatalog;

  const cached = metaCache.get(song.code);
  if (cached?.expires > Date.now()) return cached.value;
  if (pending.has(song.code)) return pending.get(song.code);

  const promise = limited(async () => {
    const query = `${cleanArtist(song.artist)} ${song.title}`;
    try {
      const response = await request("/search", { q: query, limit: "8" });
      const track = pickBestDeezerTrack(response?.data, song);
      const value = metaFromDeezerTrack(track);
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

const PICTURE_KEY = "bdc-deezer-artist-picture-v1";
const PICTURE_TTL = 14 * 24 * 60 * 60 * 1000;
const pictureCache = readPictureCache();
const pendingPictures = new Map();

function readPictureCache() {
  try {
    const stored = JSON.parse(localStorage.getItem(PICTURE_KEY) || "{}");
    return new Map(Object.entries(stored).filter(([, item]) => item?.expires > Date.now()));
  } catch {
    return new Map();
  }
}

function persistPictureCache() {
  try {
    const entries = [...pictureCache.entries()].slice(-800);
    localStorage.setItem(PICTURE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Sem cache persistente, as fotos são buscadas novamente na próxima visita.
  }
}

/** Catalog lists some bands as "Beatles (The)"; Deezer knows them as "The Beatles". */
export function artistSearchName(name) {
  const clean = cleanArtist(name);
  const article = clean.match(/^(.*)\s+\((the|a|os|as|o)\)$/i);
  return article ? `${article[2]} ${article[1]}` : clean;
}

/** Artist photo from Deezer; null when not found. Catalog names may be truncated. */
export async function fetchArtistPicture(artistName) {
  const query = artistSearchName(artistName);
  const key = normalizeText(query);
  if (!key) return null;
  const cached = pictureCache.get(key);
  if (cached?.expires > Date.now()) return cached.url;
  if (pendingPictures.has(key)) return pendingPictures.get(key);
  const promise = limited(async () => {
    try {
      const search = await request("/search/artist", { q: query, limit: "5" });
      const results = Array.isArray(search?.data) ? search.data : [];
      const artist = results.find((item) => normalizeText(item.name) === key)
        || results.find((item) => normalizeText(item.name).startsWith(key) || key.startsWith(normalizeText(item.name)))
        || results[0];
      const picture = artist?.picture_medium || artist?.picture_big || null;
      const url = picture && !picture.includes("/artist//") ? picture : null;
      pictureCache.set(key, { url, expires: Date.now() + (url ? PICTURE_TTL : EMPTY_TTL) });
      persistPictureCache();
      return url;
    } catch {
      return null;
    }
  });
  pendingPictures.set(key, promise);
  try {
    return await promise;
  } finally {
    pendingPictures.delete(key);
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
