import { ensureSession, isAnonymous } from "./auth.js";
import { getSupabase, supabaseConfigured } from "./supabase.js";
import { authErrorMessage } from "../lib/auth-validation.js";

const REQUESTS_ENABLED = String(import.meta.env.VITE_ENABLE_REQUESTS || "true") !== "false";

export const requestsConfigured = supabaseConfigured && REQUESTS_ENABLED;

export class RequestError extends Error {
  constructor(message, { status = 0, code = "", hint = "" } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.hint = hint;
  }
}

async function call(name, params = {}) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new RequestError(error.message, { code: error.code || "", hint: error.hint || "" });
  return data;
}

/** Signed-in customers request with their account; visitors get an anonymous session. */
async function customerRpc(name, params) {
  await ensureSession();
  return call(name, params);
}

export function createSongRequest({ code, name, phone }) {
  return customerRpc("create_song_request", { p_code: String(code), p_name: name, p_phone: phone });
}

export async function fetchMyRequests() {
  return (await customerRpc("get_my_requests")) || [];
}

export function fetchPublicQueue() {
  return customerRpc("get_public_queue");
}

/** Staff use a permanent account; an anonymous visitor session does not count. */
export async function getStaffSession() {
  if (!supabaseConfigured) return null;
  const supabase = await getSupabase();
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  return session && !isAnonymous(session.user) ? session : null;
}

export async function staffSignIn(email, password) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email: String(email).trim().toLowerCase(), password });
  if (error) throw new RequestError(authErrorMessage(error), { status: error.status || 400 });
  return data.session;
}

export async function staffSignOut() {
  if (!supabaseConfigured) return;
  try {
    const supabase = await getSupabase();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // The stored session is already gone or unreachable; the login screen is shown anyway.
  }
}

async function staffRpc(name, params) {
  if (!await getStaffSession()) throw new RequestError("Sessão expirada. Entre novamente.", { status: 401 });
  return call(name, params);
}

export async function staffListRequests(search = "") {
  return (await staffRpc("staff_list_requests", { p_search: search })) || [];
}

export const staffGetSettings = () => staffRpc("staff_get_settings", {});
export const staffMarkPaid = (id) => staffRpc("staff_mark_paid", { p_id: id });
export const staffMarkPlayed = (id) => staffRpc("staff_mark_played", { p_id: id });
export const staffCancel = (id) => staffRpc("staff_cancel", { p_id: id });

export function staffUpdateSettings({ queueOpen, roundLimit, nextRoundAt, message, newRound = false }) {
  return staffRpc("staff_update_settings", {
    p_queue_open: queueOpen,
    p_round_limit: roundLimit,
    p_next_round_at: nextRoundAt || null,
    p_message: message || "",
    p_new_round: newRound,
  });
}
