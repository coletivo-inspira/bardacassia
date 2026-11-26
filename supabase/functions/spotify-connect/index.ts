import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, isAllowedOrigin, json } from "../_shared/cors.ts";

const METHODS = "POST, OPTIONS";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Same public Client ID as VITE_SPOTIFY_CLIENT_ID. The browser starts PKCE, so
// the token endpoint needs the code_verifier, not a client secret.
const CLIENT_ID = (Deno.env.get("SPOTIFY_CLIENT_ID") ?? "").trim();
const SYNC_COOLDOWN_MS = 10 * 60_000;
const TIME_RANGES = ["short_term", "medium_term", "long_term"] as const;
const API = "https://api.spotify.com/v1";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

class SpotifyError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

type Token = { access_token: string; refresh_token?: string; scope?: string };
type SpotifyArtist = { id?: string; name?: string; genres?: string[]; images?: { url: string; width?: number }[] };
type SpotifyTrack = { id?: string; name?: string; artists?: SpotifyArtist[] };

async function tokenRequest(params: Record<string, string>): Promise<Token> {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...params }),
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 400 || response.status === 401) throw new SpotifyError("spotify_revoked", 409);
  if (!response.ok) throw new SpotifyError("spotify_unavailable", 502);
  const token = await response.json();
  if (!token?.access_token) throw new SpotifyError("spotify_unavailable", 502);
  return token;
}

async function spotifyGet(path: string, accessToken: string) {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 401) throw new SpotifyError("spotify_revoked", 409);
  if (response.status === 403) throw new SpotifyError("spotify_forbidden", 403);
  if (response.status === 429) throw new SpotifyError("spotify_rate_limited", 429);
  if (!response.ok) throw new SpotifyError("spotify_unavailable", 502);
  return response.json();
}

const clip = (value: unknown, max = 200) => String(value ?? "").slice(0, max);

function slimArtist(artist: SpotifyArtist, withDetails = false) {
  const base = { id: clip(artist.id, 64), name: clip(artist.name) };
  if (!withDetails) return base;
  const images = [...(artist.images ?? [])].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  const image = images.find((img) => (img.width ?? 0) >= 120) ?? images.at(-1);
  return {
    ...base,
    genres: (artist.genres ?? []).slice(0, 8).map((genre) => clip(genre, 60)),
    image: image ? clip(image.url, 300) : "",
  };
}

function slimTrack(track: SpotifyTrack) {
  return {
    id: clip(track.id, 64),
    name: clip(track.name),
    artists: (track.artists ?? []).slice(0, 4).map((artist) => slimArtist(artist)),
  };
}

async function fetchListening(accessToken: string) {
  const [me, recent, ...ranges] = await Promise.all([
    spotifyGet("/me", accessToken),
    spotifyGet("/me/player/recently-played?limit=50", accessToken).catch(() => ({ items: [] })),
    ...TIME_RANGES.map((range) => spotifyGet(`/me/top/tracks?limit=50&time_range=${range}`, accessToken)),
    ...TIME_RANGES.map((range) => spotifyGet(`/me/top/artists?limit=50&time_range=${range}`, accessToken)),
  ]);
  const topTracks: Record<string, unknown[]> = {};
  const topArtists: Record<string, unknown[]> = {};
  TIME_RANGES.forEach((range, index) => {
    topTracks[range] = (ranges[index]?.items ?? []).map(slimTrack);
    topArtists[range] = (ranges[index + TIME_RANGES.length]?.items ?? []).map((artist: SpotifyArtist) => slimArtist(artist, true));
  });
  const recentTracks = (recent?.items ?? [])
    .map((item: { track?: SpotifyTrack }) => item.track)
    .filter(Boolean)
    .map(slimTrack);
  return {
    spotifyUserId: clip(me?.id, 128),
    displayName: clip(me?.display_name || me?.id, 120),
    topTracks,
    topArtists,
    recentTracks,
  };
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(name, args);
  if (error) {
    console.error(`spotify-connect ${name} failed`, error.message);
    throw new SpotifyError("storage_failed", 500);
  }
  return data as T;
}

async function syncWith(userId: string, accessToken: string) {
  const listening = await fetchListening(accessToken);
  const syncedAt = await rpc<string>("spotify_save_profile", {
    p_user: userId,
    p_display_name: listening.displayName,
    p_top_tracks: listening.topTracks,
    p_top_artists: listening.topArtists,
    p_recent_tracks: listening.recentTracks,
  });
  return {
    source: "spotify",
    source_display_name: listening.displayName,
    top_tracks: listening.topTracks,
    top_artists: listening.topArtists,
    recent_tracks: listening.recentTracks,
    synced_at: syncedAt,
  };
}

function validRedirect(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    const url = new URL(value);
    const origins = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((o) => o.trim()).filter(Boolean);
    return origins.includes(url.origin) && !url.search && !url.hash;
  } catch {
    return false;
  }
}

async function exchange(userId: string, body: Record<string, unknown>) {
  const code = typeof body.code === "string" ? body.code.slice(0, 1000) : "";
  const verifier = typeof body.codeVerifier === "string" ? body.codeVerifier.slice(0, 200) : "";
  if (!code || verifier.length < 43 || !validRedirect(body.redirectUri)) throw new SpotifyError("invalid_request", 400);
  const token = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: body.redirectUri,
    code_verifier: verifier,
  }).catch((error) => {
    throw error instanceof SpotifyError && error.code === "spotify_revoked" ? new SpotifyError("exchange_failed", 400) : error;
  });
  if (!token.refresh_token) throw new SpotifyError("spotify_unavailable", 502);
  const me = await spotifyGet("/me", token.access_token);
  await rpc("spotify_save_connection", {
    p_user: userId,
    p_spotify_user_id: clip(me?.id, 128),
    p_refresh_token: token.refresh_token,
    p_scopes: clip(token.scope, 500),
  });
  return syncWith(userId, token.access_token);
}

async function sync(userId: string) {
  const rows = await rpc<{ refresh_token: string; last_synced_at: string | null }[]>("spotify_get_connection", { p_user: userId });
  const connection = rows?.[0];
  if (!connection?.refresh_token) throw new SpotifyError("not_connected", 404);
  const last = connection.last_synced_at ? Date.parse(connection.last_synced_at) : 0;
  if (Date.now() - last < SYNC_COOLDOWN_MS) {
    const retryAfter = Math.ceil((SYNC_COOLDOWN_MS - (Date.now() - last)) / 1000);
    throw Object.assign(new SpotifyError("sync_cooldown", 429), { retryAfter });
  }
  let token: Token;
  try {
    token = await tokenRequest({ grant_type: "refresh_token", refresh_token: connection.refresh_token });
  } catch (error) {
    if (error instanceof SpotifyError && error.code === "spotify_revoked") {
      await rpc("spotify_disconnect", { p_user: userId });
    }
    throw error;
  }
  if (token.refresh_token && token.refresh_token !== connection.refresh_token) {
    await rpc("spotify_rotate_token", { p_user: userId, p_refresh_token: token.refresh_token });
  }
  return syncWith(userId, token.access_token);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, METHODS) });
  if (!isAllowedOrigin(request)) return json(request, { error: "origin_not_allowed" }, 403, {}, METHODS);
  if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405, { Allow: METHODS }, METHODS);
  if (!CLIENT_ID) return json(request, { error: "spotify_not_configured" }, 503, {}, METHODS);

  const jwt = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!jwt) return json(request, { error: "unauthorized" }, 401, {}, METHODS);
  const { data, error } = await admin.auth.getUser(jwt);
  const user = data?.user;
  if (error || !user) return json(request, { error: "unauthorized" }, 401, {}, METHODS);
  if (user.is_anonymous) return json(request, { error: "account_required" }, 403, {}, METHODS);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(request, { error: "invalid_request" }, 400, {}, METHODS);
  }

  try {
    if (body.action === "exchange") return json(request, { profile: await exchange(user.id, body) }, 200, {}, METHODS);
    if (body.action === "sync") return json(request, { profile: await sync(user.id) }, 200, {}, METHODS);
    if (body.action === "disconnect") {
      await rpc("spotify_disconnect", { p_user: user.id });
      return json(request, { disconnected: true }, 200, {}, METHODS);
    }
    return json(request, { error: "invalid_request" }, 400, {}, METHODS);
  } catch (err) {
    if (err instanceof SpotifyError) {
      const retryAfter = (err as SpotifyError & { retryAfter?: number }).retryAfter;
      const extra: Record<string, string> = retryAfter ? { "Retry-After": String(retryAfter) } : {};
      return json(request, { error: err.code, retryAfter }, err.status, extra, METHODS);
    }
    console.error("spotify-connect unexpected", err);
    return json(request, { error: "unexpected" }, 500, {}, METHODS);
  }
});
