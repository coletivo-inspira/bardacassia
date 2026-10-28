/** Lê `?origem=mesa` (cartaz) ou `?origem=instagram`; aceita só um rótulo curto e seguro. */
export function readOrigin(search) {
  const value = new URLSearchParams(String(search || "")).get("origem") || "";
  const clean = value.trim().toLowerCase();
  return /^[a-z0-9_-]{1,30}$/.test(clean) ? clean : "";
}

/** Endereço do catálogo para o cartaz, marcado com a origem (mesa, balcão…) para as estatísticas. */
export function posterUrl(siteUrl, origin) {
  const url = new URL(siteUrl);
  url.hash = "";
  url.search = "";
  if (/\/index\.html$/.test(url.pathname)) url.pathname = url.pathname.replace(/index\.html$/, "");
  const clean = readOrigin(`?origem=${encodeURIComponent(String(origin || ""))}`);
  if (clean) url.searchParams.set("origem", clean);
  return url.toString();
}
