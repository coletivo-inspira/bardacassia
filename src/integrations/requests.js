import { getStaffSession, rpc, staffSignIn, staffSignOut, supabaseConfigured } from "./supabase.js";

const REQUESTS_ENABLED = String(import.meta.env.VITE_ENABLE_REQUESTS || "true") !== "false";

export const requestsConfigured = supabaseConfigured && REQUESTS_ENABLED;

export function createSongRequest({ code, name, phone }) {
  return rpc("create_song_request", { p_code: String(code), p_name: name, p_phone: phone });
}

export async function fetchMyRequests() {
  return (await rpc("get_my_requests")) || [];
}

export function fetchPublicQueue() {
  return rpc("get_public_queue");
}

export { getStaffSession, staffSignIn, staffSignOut };

async function staffRpc(name, params) {
  const session = await getStaffSession();
  if (!session) throw Object.assign(new Error("Sessão expirada. Entre novamente."), { status: 401 });
  return rpc(name, params, session);
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
