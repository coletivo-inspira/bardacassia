import { getSupabase, supabaseConfigured } from "./supabase.js";
import { adoptRemoteFeatures, getFeatures } from "../lib/feature-state.js";
import { FEATURE_IDS, requestModeOf } from "../lib/features.js";
import { applyPalette, clearPalette } from "../lib/palette.js";
import { applyDefaultTheme } from "../lib/theme.js";
import {
  createSiteFeaturesLoader,
  isEmptyPalette,
  shouldApplySiteDefaultTheme,
} from "../lib/site-features-load.js";

const LOAD_MS = 3000;

function rpcError(error) {
  const wrapped = new Error(error?.message || "Não foi possível falar com o servidor.");
  wrapped.code = error?.code || "";
  wrapped.hint = error?.hint || "";
  return wrapped;
}

async function requestSiteFeatures() {
  if (!supabaseConfigured) return { status: "off" };
  try {
    const supabase = await getSupabase();
    const rpc = supabase.rpc("get_site_features");
    const timeout = new Promise((resolve) => {
      setTimeout(() => resolve({ data: null, error: new Error("timeout") }), LOAD_MS);
    });
    const { data, error } = await Promise.race([rpc, timeout]);
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return { status: "error" };
    return { status: "ok", data };
  } catch {
    return { status: "error" };
  }
}

/** null quando o Supabase não está configurado ou a RPC falha. O chamador fica no padrão do build. */
export async function fetchSiteFeatures() {
  const result = await requestSiteFeatures();
  return result.status === "ok" ? result.data : null;
}

let lastPayload = null;

export function peekSitePayload() {
  return lastPayload;
}

export function updateCachedSitePayload(remote) {
  if (!remote || typeof remote !== "object" || Array.isArray(remote)) return getFeatures();
  lastPayload = remote;
  adoptRemoteFeatures(remote);
  if (Object.prototype.hasOwnProperty.call(remote, "palette")) {
    if (isEmptyPalette(remote.palette)) clearPalette();
    else applyPalette(remote.palette);
  }
  if (shouldApplySiteDefaultTheme() && Object.prototype.hasOwnProperty.call(remote, "default_theme")) {
    applyDefaultTheme(remote.default_theme);
  }
  return getFeatures();
}

export const loadSiteFeatures = createSiteFeaturesLoader({
  request: requestSiteFeatures,
  adopt: updateCachedSitePayload,
  clearPalette,
  getFeatures,
});

export async function saveSiteFeatures(features) {
  const supabase = await getSupabase();
  const args = {};
  for (const id of FEATURE_IDS) args[`p_${id}`] = Boolean(features?.[id]);
  args.p_request_mode = requestModeOf(features);
  args.p_auth_providers = String(features?.auth_providers ?? "");
  const { data, error } = await supabase.rpc("set_site_features", args);
  if (error) throw rpcError(error);
  if (data && typeof data === "object" && !Array.isArray(data)) updateCachedSitePayload(data);
  return getFeatures();
}

export async function saveSitePalette(palette) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("set_site_palette", { p_palette: palette });
  if (error) throw rpcError(error);
  if (data && typeof data === "object" && !Array.isArray(data)) {
    updateCachedSitePayload(data);
    return data.palette ?? {};
  }
  applyPalette(palette);
  return palette;
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
