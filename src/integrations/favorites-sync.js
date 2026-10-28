import { getCurrentUser } from "./auth.js";
import { setFavoriteSyncActive } from "./popularity.js";
import { getSupabase, hasStoredAuthSession } from "./supabase.js";
import { codesToUpload } from "../lib/favorites.js";

/**
 * Uploads local favorites and returns the account's full list, or null when
 * the visitor is not signed in or the server is unreachable.
 */
export async function syncAccountFavorites(localCodes) {
  if (!hasStoredAuthSession()) return null;
  try {
    const user = await getCurrentUser();
    if (!user) return null;
    setFavoriteSyncActive(true);
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc("sync_my_favorites", { p_codes: codesToUpload(localCodes) });
    if (error) throw error;
    return (data || []).map((row) => String(typeof row === "object" && row ? Object.values(row)[0] : row));
  } catch {
    return null;
  }
}
