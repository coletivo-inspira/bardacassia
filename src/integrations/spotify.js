/**
 * Spotify Authorization Code + PKCE, sem client secret.
 * Com conta: o código vai para a Edge Function `spotify-connect`, que liga o
 * Spotify à conta e salva o resumo em music_profiles. Sem conta: troca no
 * navegador, lê as mais ouvidas e não guarda nada.
 */
import { getFeatures } from "../lib/feature-state.js";
import { showSpotify } from "../lib/features.js";
import { canLinkMusicAccount, linkSpotify, MusicProfileError, UNAVAILABLE_CODES } from "./music-profile.js";

const CLIENT_ID = String(import.meta.env.VITE_SPOTIFY_CLIENT_ID || "").trim();
const PKCE_KEY = "bdc-spotify-pkce";
const SCOPE = "user-top-read user-read-recently-played";

export function spotifyConfigured() {
  return showSpotify(getFeatures(), CLIENT_ID);
}

function redirectUri() {
  return `${location.origin}${location.pathname}`;
}

function base64url(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function readSaved() {
  try {
    return JSON.parse(sessionStorage.getItem(PKCE_KEY) || "null");
  } catch {
    return null;
  }
}

/**
 * Supabase Auth also returns `?code=`; only a callback whose state matches the
 * PKCE entry saved here belongs to Spotify. The URL is cleaned at import time,
 * before supabase-js can look at it.
 */
function captureCallback() {
  if (typeof location === "undefined") return null;
  const params = new URLSearchParams(location.search);
  if (!params.has("state") || (!params.has("code") && !params.has("error"))) return null;
  const saved = readSaved();
  if (!saved || saved.state !== params.get("state")) return null;
  const callback = { code: params.get("code"), state: params.get("state"), error: params.get("error"), saved };
  params.delete("code");
  params.delete("state");
  params.delete("error");
  const query = params.toString();
  history.replaceState(null, "", location.pathname + (query ? `?${query}` : "") + location.hash);
  sessionStorage.removeItem(PKCE_KEY);
  return callback;
}

let pendingCallback = captureCallback();

export async function connectSpotify() {
  if (!spotifyConfigured()) throw new Error("Spotify não configurado neste site.");
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

async function browserTopTracks(code, auth) {
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

/**
 * Sem callback: null. Com conta: `{ kind: "linked", profile }` (resumo salvo).
 * Sem conta, ou sem a função publicada: `{ kind: "tracks", tracks }`, sem persistir tokens.
 */
export async function completeSpotifyConnection() {
  const callback = pendingCallback;
  pendingCallback = null;
  if (!callback) return null;
  const { code, error, saved } = callback;
  if (error) throw new Error("A conexão com o Spotify foi cancelada ou recusada.");
  if (!code || !saved?.verifier) throw new Error("Sessão Spotify expirada. Conecte novamente.");
  if (redirectUri() !== saved.redirectUri) {
    throw new Error("A validação de segurança do Spotify falhou. Conecte novamente.");
  }

  if (await canLinkMusicAccount()) {
    try {
      const profile = await linkSpotify({ code, codeVerifier: saved.verifier, redirectUri: saved.redirectUri });
      return { kind: "linked", profile };
    } catch (err) {
      if (!(err instanceof MusicProfileError) || !UNAVAILABLE_CODES.has(err.code)) throw err;
    }
  }
  return { kind: "tracks", tracks: await browserTopTracks(code, saved) };
}
