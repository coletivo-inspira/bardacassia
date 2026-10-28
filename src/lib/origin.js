/** Lê `?origem=mesa` (cartaz) ou `?origem=instagram`; aceita só um rótulo curto e seguro. */
export function readOrigin(search) {
  const value = new URLSearchParams(String(search || "")).get("origem") || "";
  const clean = value.trim().toLowerCase();
  return /^[a-z0-9_-]{1,30}$/.test(clean) ? clean : "";
}
