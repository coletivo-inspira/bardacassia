export const MAX_SYNCED_FAVORITES = 1000;

/** Union of local and account favorites, restricted to codes in the current catalog. */
export function mergeFavoriteCodes(localCodes, remoteCodes, isValidCode = () => true) {
  const merged = new Set();
  for (const code of [...(localCodes || []), ...(remoteCodes || [])]) {
    const key = String(code ?? "").trim();
    if (key && isValidCode(key)) merged.add(key);
  }
  return merged;
}

export function codesToUpload(localCodes) {
  return [...new Set([...(localCodes || [])].map(String).filter(Boolean))].slice(0, MAX_SYNCED_FAVORITES);
}
