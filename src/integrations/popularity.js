const URL = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "");
const RANKING_ENABLED = String(import.meta.env.VITE_ENABLE_POPULARITY || "true") !== "false";
const SESSION_KEY = "bdc-supabase-session-v1";
const QUEUE_KEY = "bdc-popularity-queue-v1";
const CACHE_KEY = "bdc-popularity-cache-v1";
const CACHE_TTL = 5 * 60 * 1000;
const MAX_QUEUE = 500;

export const popularityConfigured = Boolean(URL && KEY) && RANKING_ENABLED;
let sessionPromise;
let retryPromise;
let stalePopularity = false;

export function popularityNeedsUpdate() { return stalePopularity; }

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; }
  catch { return fallback; }
}

async function getSession() {
  if (!popularityConfigured) throw new Error("Ranking não configurado.");
  const cached = readJson(SESSION_KEY, null);
  if (cached?.access_token && cached.expires_at > Date.now() + 60000) return cached;
  if (cached?.refresh_token) {
    const refreshed = await fetch(`${URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: cached.refresh_token }),
    });
    if (refreshed.ok) return saveSession(await refreshed.json());
  }
  const response = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ data: {} }),
  });
  if (!response.ok) throw new Error("Não foi possível iniciar uma sessão anônima para o ranking.");
  const result = await response.json();
  return saveSession(result.session || result);
}

function saveSession(session) {
  if (!session?.access_token) throw new Error("Supabase não retornou uma sessão válida.");
  const value = { ...session, expires_at: Date.now() + Number(session.expires_in || 3600) * 1000 };
  localStorage.setItem(SESSION_KEY, JSON.stringify(value));
  return value;
}

async function rpc(name, params = {}) {
  const session = await getSession();
  const response = await fetch(`${URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error(`Falha no ranking (${response.status}).`);
  return response.json();
}

function enqueue(kind, code, active = null) {
  if (!popularityConfigured) return;
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
  if (!popularityConfigured || retryPromise) return retryPromise;
  retryPromise = (async () => {
    let queue = readJson(QUEUE_KEY, []);
    while (queue.length) {
      const item = queue[0];
      try {
        await rpc(item.kind === "open" ? "record_song_open" : "set_song_favorite", item.kind === "open"
          ? { p_code: item.code } : { p_code: item.code, p_active: item.active });
        queue = readJson(QUEUE_KEY, []);
        const current = queue.findIndex((entry) => entry.kind === item.kind && entry.code === item.code);
        if (current >= 0 && queue[current].at === item.at) queue.splice(current, 1);
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      } catch { break; }
    }
  })().finally(() => { retryPromise = null; });
  return retryPromise;
}

if (typeof window !== "undefined") window.addEventListener("online", flushQueue);
