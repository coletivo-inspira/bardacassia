/**
 * Spotify Authorization Code + PKCE. Somente no navegador; sem client secret.
 * A conexão é opcional e requer VITE_SPOTIFY_CLIENT_ID + redirect URI cadastrada.
 */
const CLIENT_ID = String(import.meta.env.VITE_SPOTIFY_CLIENT_ID || "").trim();
const PKCE_KEY = "bdc-spotify-pkce";
const SCOPE = "user-top-read";

export const spotifyConfigured = Boolean(CLIENT_ID);

function redirectUri() {
  return `${location.origin}${location.pathname}`;
}

function base64url(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function connectSpotify() {
  if (!spotifyConfigured) throw new Error("Spotify não configurado neste site.");
  if (!crypto?.subtle || !crypto?.getRandomValues) {
    throw new Error("Conexão segura indisponível neste navegador.");
  }
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(20)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = base64url(new Uint8Array(digest));
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, redirectUri: redirectUri() }));

  const url = new URL("https://accounts.spotify.com/authorize");
  const params = {
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: SCOPE,
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
    show_dialog: "false",
  };
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  location.assign(url.href);
}

async function spotifyJson(url, accessToken) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (response.status === 429) throw new Error("Spotify atingiu o limite de consultas. Tente mais tarde.");
  if (response.status === 403) throw new Error("Esta conta não tem acesso ao aplicativo Spotify configurado.");
  if (!response.ok) throw new Error("Não foi possível ler suas músicas no Spotify.");
  return response.json();
}

/**
 * Retorna null sem callback, ou uma lista de faixas. Não persiste tokens.
 * Os códigos de karaokê são conciliados localmente em outro módulo.
 */
export async function completeSpotifyConnection() {
  const params = new URLSearchParams(location.search);
  if (!params.has("code") && !params.has("error")) return null;
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");

  // Remover parâmetros sensíveis do endereço antes de fazer requisições.
  params.delete("code");
  params.delete("state");
  params.delete("error");
  const query = params.toString();
  history.replaceState(null, "", location.pathname + (query ? `?${query}` : "") + location.hash);

  const saved = sessionStorage.getItem(PKCE_KEY);
  sessionStorage.removeItem(PKCE_KEY);
  if (error) throw new Error("A conexão com o Spotify foi cancelada ou recusada.");
  if (!saved || !code || !state) throw new Error("Sessão Spotify expirada. Conecte novamente.");

  let auth;
  try {
    auth = JSON.parse(saved);
  } catch {
    throw new Error("Sessão Spotify inválida. Conecte novamente.");
  }
  if (state !== auth.state || redirectUri() !== auth.redirectUri) {
    throw new Error("A validação de segurança do Spotify falhou. Conecte novamente.");
  }

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: auth.redirectUri,
    code_verifier: auth.verifier,
  });
  const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenResponse.ok) throw new Error("Não foi possível concluir a autorização do Spotify.");
  const token = await tokenResponse.json();
  if (!token.access_token) throw new Error("Spotify não retornou uma autorização válida.");

  const data = await spotifyJson("https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=medium_term", token.access_token);
  return (data.items || []).map((item) => ({
    name: item.name,
    artists: (item.artists || []).map(({ name }) => ({ name })),
  }));
}
