const URL = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "");
const ANON_SESSION_KEY = "bdc-supabase-session-v1";
const STAFF_SESSION_KEY = "bdc-staff-session-v1";

export const supabaseConfigured = Boolean(URL && KEY);

export class SupabaseError extends Error {
  constructor(message, { status = 0, code = "", hint = "" } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.hint = hint;
  }
}

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); }
  catch { return null; }
}

function saveSession(storageKey, session) {
  if (!session?.access_token) throw new SupabaseError("Supabase não retornou uma sessão válida.");
  const value = { ...session, expires_at: Date.now() + Number(session.expires_in || 3600) * 1000 };
  localStorage.setItem(storageKey, JSON.stringify(value));
  return value;
}

async function authRequest(path, body) {
  return fetch(`${URL}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function refreshStored(storageKey) {
  const cached = readJson(storageKey);
  if (cached?.access_token && cached.expires_at > Date.now() + 60000) return cached;
  if (!cached?.refresh_token) return null;
  const refreshed = await authRequest("token?grant_type=refresh_token", { refresh_token: cached.refresh_token });
  if (refreshed.ok) return saveSession(storageKey, await refreshed.json());
  localStorage.removeItem(storageKey);
  return null;
}

export async function getAnonSession() {
  if (!supabaseConfigured) throw new SupabaseError("Supabase não configurado.");
  const stored = await refreshStored(ANON_SESSION_KEY);
  if (stored) return stored;
  const response = await authRequest("signup", { data: {} });
  if (!response.ok) throw new SupabaseError("Não foi possível iniciar uma sessão anônima.", { status: response.status });
  const result = await response.json();
  return saveSession(ANON_SESSION_KEY, result.session || result);
}

export async function getStaffSession() {
  if (!supabaseConfigured) return null;
  return refreshStored(STAFF_SESSION_KEY);
}

export async function staffSignIn(email, password) {
  if (!supabaseConfigured) throw new SupabaseError("Supabase não configurado.");
  const response = await authRequest("token?grant_type=password", { email, password });
  if (!response.ok) throw new SupabaseError("E-mail ou senha incorretos.", { status: response.status });
  return saveSession(STAFF_SESSION_KEY, await response.json());
}

export function staffSignOut() {
  localStorage.removeItem(STAFF_SESSION_KEY);
}

export async function rpc(name, params = {}, session) {
  const active = session || await getAnonSession();
  const response = await fetch(`${URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${active.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    let detail = {};
    try { detail = await response.json(); } catch { /* corpo vazio */ }
    throw new SupabaseError(detail.message || `Falha no Supabase (${response.status}).`, {
      status: response.status, code: detail.code || "", hint: detail.hint || "",
    });
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
