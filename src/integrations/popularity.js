import { ensureSession } from "./auth.js";
import { getSupabase, supabaseConfigured } from "./supabase.js";

const RANKING_ENABLED = String(import.meta.env.VITE_ENABLE_POPULARITY || "true") !== "false";
const QUEUE_KEY = "bdc-popularity-queue-v1";
const CACHE_KEY = "bdc-popularity-cache-v1";
const CACHE_TTL = 5 * 60 * 1000;
const MAX_QUEUE = 500;

export const popularityConfigured = supabaseConfigured && RANKING_ENABLED;
let retryPromise;
let stalePopularity = false;
let favoriteSyncActive = false;

/** Signed-in accounts keep syncing favorites even when the public ranking is disabled. */
export function setFavoriteSyncActive(active) {
  favoriteSyncActive = Boolean(active) && supabaseConfigured;
  if (favoriteSyncActive) void flushQueue();
}

function writesEnabled(kind) {
  return popularityConfigured || (kind === "favorite" && favoriteSyncActive);
}

export function popularityNeedsUpdate() { return stalePopularity; }

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; }
  catch { return fallback; }
}

/** Signed-in users rank with their own account; visitors get an anonymous session. */
async function rpc(name, params = {}) {
  if (!supabaseConfigured) throw new Error("Supabase não configurado.");
  await ensureSession();
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new Error(`Falha no ranking (${error.code || error.message}).`);
  return data;
}

function enqueue(kind, code, active = null) {
  if (!writesEnabled(kind)) return;
  try {
    const queue = readJson(QUEUE_KEY, []);
    const key = `${kind}:${code}`;
    const existing = queue.findIndex((item) => `${item.kind}:${item.code}` === key);
    const item = { kind, code: String(code), active, at: `${Date.now()}-${Math.random()}` };
    if (existing >= 0) queue[existing] = item;
    else queue.push(item);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
  } catch {
    // Local interactions must remain usable when storage is blocked or full.
  }
  void flushQueue();
}

export function recordSongOpen(code) { enqueue("open", code); }
export function setSongFavorite(code, active) { enqueue("favorite", code, Boolean(active)); }

export async function fetchPopularSongs() {
  if (!RANKING_ENABLED) return [];
  const cache = readJson(CACHE_KEY, null);
  if (cache?.expires > Date.now()) { stalePopularity = false; return cache.items; }
  if (!popularityConfigured) { stalePopularity = Boolean(cache?.items?.length); return cache?.items || []; }
  try {
    const items = await rpc("get_popular_songs", { p_limit: 40 });
    stalePopularity = false;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ items, expires: Date.now() + CACHE_TTL })); } catch { /* cache is optional */ }
    return items;
  } catch {
    stalePopularity = Boolean(cache?.items?.length);
    return cache?.items || [];
  }
}

export async function flushQueue() {
  if (!(popularityConfigured || favoriteSyncActive) || retryPromise) return retryPromise;
  retryPromise = (async () => {
    let queue = readJson(QUEUE_KEY, []).filter((entry) => writesEnabled(entry.kind));
    while (queue.length) {
      const item = queue[0];
      try {
        await rpc(item.kind === "open" ? "record_song_open" : "set_song_favorite", item.kind === "open"
          ? { p_code: item.code } : { p_code: item.code, p_active: item.active });
        const stored = readJson(QUEUE_KEY, []);
        const current = stored.findIndex((entry) => entry.kind === item.kind && entry.code === item.code);
        if (current >= 0 && stored[current].at === item.at) stored.splice(current, 1);
        localStorage.setItem(QUEUE_KEY, JSON.stringify(stored));
        queue = stored.filter((entry) => writesEnabled(entry.kind));
      } catch { break; }
    }
  })().finally(() => { retryPromise = null; });
  return retryPromise;
}

if (typeof window !== "undefined") window.addEventListener("online", flushQueue);
