export const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
export const SUPABASE_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "");
export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

const AUTH_STORAGE_KEY = "bdc-auth-v1";
const PERSIST_KEY = "bdc-auth-persist-v1";
const LEGACY_SESSION_KEY = "bdc-supabase-session-v1";

function safeStorage(kind) {
  try {
    const storage = window[kind];
    const probe = "__bdc_probe__";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

const memory = new Map();

/** "Manter conectado" off keeps the session only in this tab (sessionStorage). */
export function setPersistSession(persist) {
  const local = safeStorage("localStorage");
  try { local?.setItem(PERSIST_KEY, persist ? "1" : "0"); } catch { /* preference falls back to persistent */ }
}

export function getPersistSession() {
  try { return safeStorage("localStorage")?.getItem(PERSIST_KEY) !== "0"; } catch { return true; }
}

const authStorage = {
  getItem(key) {
    const session = safeStorage("sessionStorage")?.getItem(key);
    if (session != null) return session;
    const local = safeStorage("localStorage")?.getItem(key);
    if (local != null) return local;
    return memory.get(key) ?? null;
  },
  setItem(key, value) {
    const local = safeStorage("localStorage");
    const session = safeStorage("sessionStorage");
    const target = getPersistSession() ? local : session;
    const other = target === local ? session : local;
    if (target) target.setItem(key, value);
    else memory.set(key, value);
    other?.removeItem(key);
  },
  removeItem(key) {
    safeStorage("localStorage")?.removeItem(key);
    safeStorage("sessionStorage")?.removeItem(key);
    memory.delete(key);
  },
};

/** Cheap check that avoids downloading supabase-js for visitors who never signed in. */
export function hasStoredAuthSession() {
  try {
    return authStorage.getItem(AUTH_STORAGE_KEY) != null;
  } catch {
    return false;
  }
}

let clientPromise;

/** Lazily loads supabase-js so pages without auth interactions stay light. */
export function getSupabase() {
  if (!supabaseConfigured) return Promise.reject(new Error("Supabase não configurado."));
  clientPromise ??= import("@supabase/supabase-js").then(async ({ createClient }) => {
    const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        flowType: "pkce",
        storageKey: AUTH_STORAGE_KEY,
        storage: authStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    await adoptLegacySession(client);
    return client;
  });
  return clientPromise;
}

/** Keeps the anonymous identity created by the previous hand-rolled ranking client. */
async function adoptLegacySession(client) {
  const local = safeStorage("localStorage");
  const raw = local?.getItem(LEGACY_SESSION_KEY);
  if (!raw) return;
  local.removeItem(LEGACY_SESSION_KEY);
  try {
    const { data } = await client.auth.getSession();
    if (data.session) return;
    const legacy = JSON.parse(raw);
    if (legacy?.access_token && legacy?.refresh_token) {
      await client.auth.setSession({ access_token: legacy.access_token, refresh_token: legacy.refresh_token });
    }
  } catch {
    /* a fresh anonymous session is created on demand */
  }
}
