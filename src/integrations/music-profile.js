/**
 * Perfil musical ligado à conta: leitura de music_profiles (RLS, só o dono) e
 * chamadas à Edge Function `spotify-connect`, que guarda o refresh token.
 */
import { authBackendReady, getCurrentUser } from "./auth.js";
import { getSupabase } from "./supabase.js";

const FUNCTION = "spotify-connect";
const PROFILE_COLUMNS = "source, source_display_name, top_tracks, top_artists, recent_tracks, synced_at";

/** Codes that mean the function never reached Spotify, so the OAuth code is still unused. */
export const UNAVAILABLE_CODES = new Set(["function_missing", "spotify_not_configured", "network"]);

export class MusicProfileError extends Error {
  constructor(code, retryAfter = 0) {
    super(musicProfileMessage(code, retryAfter));
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export function musicProfileMessage(code, retryAfter = 0) {
  switch (code) {
    case "spotify_forbidden":
      return "Esta conta do Spotify ainda não tem acesso ao app do Bar da Cácia. Peça para liberarem o e-mail da sua conta Spotify.";
    case "spotify_rate_limited":
      return "O Spotify atingiu o limite de consultas. Tente mais tarde.";
    case "sync_cooldown": {
      const minutes = Math.max(1, Math.ceil(Number(retryAfter || 0) / 60));
      return `Você atualizou há pouco. Tente de novo em ${minutes} min.`;
    }
    case "spotify_revoked":
      return "A autorização do Spotify expirou ou foi removida. Conecte de novo.";
    case "not_connected":
      return "O Spotify não está conectado a esta conta.";
    case "exchange_failed":
    case "invalid_request":
      return "Não foi possível concluir a autorização do Spotify. Conecte novamente.";
    case "unauthorized":
    case "account_required":
      return "Entre na sua conta para conectar o Spotify.";
    case "function_missing":
    case "spotify_not_configured":
      return "A conexão do Spotify com a conta ainda não está ativa neste site.";
    default:
      return "Não foi possível falar com o Spotify agora. Tente mais tarde.";
  }
}

async function invoke(body) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.functions.invoke(FUNCTION, { method: "POST", body });
  if (!error) return data;
  const response = error.context;
  if (error.name !== "FunctionsHttpError" || typeof response?.json !== "function") throw new MusicProfileError("network");
  let code = response.status === 404 ? "function_missing" : "unexpected";
  let retryAfter = 0;
  try {
    const payload = await response.json();
    if (payload?.error && !(response.status === 404 && payload.error === "not_found")) code = String(payload.error);
    retryAfter = Number(payload?.retryAfter || 0);
  } catch {
    /* keeps the status-based code */
  }
  throw new MusicProfileError(code, retryAfter);
}

export async function canLinkMusicAccount() {
  if (!authBackendReady) return false;
  try {
    return Boolean(await getCurrentUser());
  } catch {
    return false;
  }
}

/** Saved summary for the signed-in account, or null (no account, not connected, or migration missing). */
export async function getMyMusicProfile() {
  if (!authBackendReady) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase.from("music_profiles").select(PROFILE_COLUMNS).eq("user_id", user.id).maybeSingle();
  if (error) {
    console.warn("music_profiles indisponível", error.code || error.message);
    return null;
  }
  return data || null;
}

export async function linkSpotify({ code, codeVerifier, redirectUri }) {
  const data = await invoke({ action: "exchange", code, codeVerifier, redirectUri });
  return data?.profile || null;
}

export async function syncSpotify() {
  const data = await invoke({ action: "sync" });
  return data?.profile || null;
}

export async function disconnectSpotify() {
  await invoke({ action: "disconnect" });
}
