import { getSupabase, supabaseConfigured } from "./supabase.js";
import { adoptRemoteFeatures, getFeatures } from "../lib/feature-state.js";
import { FEATURE_IDS, requestModeOf } from "../lib/features.js";

const LOAD_MS = 3000;

function rpcError(error) {
  const wrapped = new Error(error?.message || "Não foi possível falar com o servidor.");
  wrapped.code = error?.code || "";
  wrapped.hint = error?.hint || "";
  return wrapped;
}

/** null quando o Supabase não está configurado ou a RPC falha. O chamador fica no padrão do build. */
export async function fetchSiteFeatures() {
  if (!supabaseConfigured) return null;
  try {
    const supabase = await getSupabase();
    const rpc = supabase.rpc("get_site_features");
    const timeout = new Promise((resolve) => {
      setTimeout(() => resolve({ data: null, error: new Error("timeout") }), LOAD_MS);
    });
    const { data, error } = await Promise.race([rpc, timeout]);
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
    return data;
  } catch {
    return null;
  }
}

let loading = null;

export function loadSiteFeatures() {
  loading ??= (async () => {
    const remote = await fetchSiteFeatures();
    if (remote) adoptRemoteFeatures(remote);
    return getFeatures();
  })();
  return loading;
}

export async function saveSiteFeatures(features) {
  const supabase = await getSupabase();
  const args = {};
  for (const id of FEATURE_IDS) args[`p_${id}`] = Boolean(features?.[id]);
  args.p_request_mode = requestModeOf(features);
  args.p_auth_providers = String(features?.auth_providers ?? "");
  const { data, error } = await supabase.rpc("set_site_features", args);
  if (error) throw rpcError(error);
  if (data && typeof data === "object" && !Array.isArray(data)) adoptRemoteFeatures(data);
  return getFeatures();
}

export async function listProfiles() {
  if (!supabaseConfigured) return null;
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc("admin_list_profiles");
    if (error) return null;
    return Array.isArray(data) ? data : [];
  } catch {
    return null;
  }
}

export async function setProfileRole(userId, role) {
  const supabase = await getSupabase();
  const { error } = await supabase.rpc("admin_set_profile_role", {
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw rpcError(error);
}
