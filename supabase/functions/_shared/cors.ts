// ALLOWED_ORIGINS: comma-separated list, e.g.
// "https://coletivo-inspira.github.io,http://localhost:5173"
const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export function corsHeaders(request: Request, methods = "GET, OPTIONS"): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (allowed.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  return origin === null || allowed.includes(origin);
}

export function json(request: Request, body: unknown, status = 200, extra: Record<string, string> = {}, methods?: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request, methods), "Content-Type": "application/json; charset=utf-8", ...extra },
  });
}
