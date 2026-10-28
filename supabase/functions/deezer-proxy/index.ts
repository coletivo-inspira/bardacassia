import { corsHeaders, isAllowedOrigin, json } from "../_shared/cors.ts";

const ALLOWED_PATHS = [/^\/search$/, /^\/search\/artist$/, /^\/artist\/\d{1,12}\/related$/];
const ALLOWED_PARAMS = ["q", "limit"];
const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;

// Best-effort per-isolate limiter; Supabase may run several isolates.
const hits = new Map<string, { count: number; reset: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.reset <= now) {
    hits.set(key, { count: 1, reset: now + RATE_WINDOW_MS });
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (!isAllowedOrigin(request)) return json(request, { error: "origin_not_allowed" }, 403);
  if (request.method !== "GET") return json(request, { error: "method_not_allowed" }, 405, { Allow: "GET, OPTIONS" });

  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(client)) return json(request, { error: "rate_limited" }, 429, { "Retry-After": "60" });

  const url = new URL(request.url);
  const path = url.searchParams.get("path") ?? "";
  if (!ALLOWED_PATHS.some((pattern) => pattern.test(path))) return json(request, { error: "path_not_allowed" }, 400);

  const upstream = new URL(`https://api.deezer.com${path}`);
  for (const name of ALLOWED_PARAMS) {
    const value = url.searchParams.get(name);
    if (value) upstream.searchParams.set(name, value.slice(0, 200));
  }

  try {
    const response = await fetch(upstream, { signal: AbortSignal.timeout(7000) });
    if (!response.ok) return json(request, { error: "upstream_error" }, 502);
    const body = await response.json();
    return json(request, body, 200, { "Cache-Control": "public, max-age=86400, s-maxage=86400" });
  } catch {
    return json(request, { error: "upstream_unavailable" }, 504);
  }
});
