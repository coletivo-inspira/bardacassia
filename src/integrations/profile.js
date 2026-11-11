import { authBackendReady, getCurrentUser } from "./auth.js";
import { getSupabase } from "./supabase.js";
import {
  AVATAR_MAX_OUTPUT_BYTES,
  compressAvatarFile,
  DATA_CONSENT_VERSION,
  providerAvatarUrl,
} from "../lib/profile.js";

async function client() {
  if (!authBackendReady) throw new Error("Login não configurado.");
  return getSupabase();
}

/** @returns {Promise<{ display_name: string, birth_date: string|null, avatar_url: string|null, data_consent_at: string|null, data_consent_version: string|null }|null>} */
export async function getMyProfile() {
  if (!authBackendReady) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await client();
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, birth_date, avatar_url, data_consent_at, data_consent_version")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return {
      display_name: "",
      birth_date: null,
      avatar_url: providerAvatarUrl(user) || null,
      data_consent_at: null,
      data_consent_version: null,
    };
  }
  return {
    ...data,
    avatar_url: data.avatar_url || providerAvatarUrl(user) || null,
  };
}

export async function updateMyProfile({ birthDate, avatarUrl, grantConsent = false } = {}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Entre na sua conta para salvar o perfil.");
  const supabase = await client();
  const patch = {};
  if (birthDate !== undefined) patch.birth_date = birthDate || null;
  if (avatarUrl !== undefined) patch.avatar_url = avatarUrl || null;
  if (grantConsent) {
    patch.data_consent_at = new Date().toISOString();
    patch.data_consent_version = DATA_CONSENT_VERSION;
  }
  if (!Object.keys(patch).length) return getMyProfile();
  const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (error) throw error;
  return getMyProfile();
}

/**
 * Upload a profile photo to Storage `avatars` at `{userId}/avatar.jpg`.
 * Pass `{ compressed: true }` when `file` is already a square JPEG from `compressAvatarFile`
 * (e.g. after the crop modal) so we do not re-encode.
 * @param {Blob} file
 * @param {{ compressed?: boolean, maxSize?: number, quality?: number, crop?: { sx: number, sy: number, sw: number, sh: number } }} [options]
 */
export async function uploadMyAvatar(file, { compressed = false, maxSize, quality, crop } = {}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Entre na sua conta para enviar a foto.");
  const supabase = await client();
  const blob = compressed
    ? file
    : await compressAvatarFile(file, {
        ...(maxSize != null ? { maxSize } : {}),
        ...(quality != null ? { quality } : {}),
        ...(crop ? { crop } : {}),
      });
  if (!(blob instanceof Blob) || blob.size === 0) throw new Error("Selecione uma imagem.");
  if (blob.size > AVATAR_MAX_OUTPUT_BYTES) throw new Error("A imagem ficou grande demais. Tente outra foto.");
  const path = `${user.id}/avatar.jpg`;
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, blob, { upsert: true, contentType: "image/jpeg", cacheControl: "3600" });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const url = `${data.publicUrl}?v=${Date.now()}`;
  return updateMyProfile({ avatarUrl: url });
}

/** Papel do perfil da sessão atual (`cliente`, `garcom`, `dono`, `admin`), ou null. */
export async function getMyRole() {
  if (!authBackendReady) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (error || !data?.role) return null;
  return data.role;
}

/** Phone stored encrypted in `private.profile_secrets` via the `get_my_phone` RPC; E.164 or null. */
export async function getMyPhone() {
  if (!authBackendReady) return null;
  const supabase = await client();
  const { data, error } = await supabase.rpc("get_my_phone");
  if (error) throw error;
  return typeof data === "string" && data ? data : null;
}

/** Save an E.164 phone (`+55…`) through `set_my_phone`; an empty value deletes it. */
export async function setMyPhone(e164) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Entre na sua conta para salvar o telefone.");
  const supabase = await client();
  const { error } = await supabase.rpc("set_my_phone", { p_phone: e164 || "" });
  if (error) throw error;
}

export function hasCurrentConsent(profile) {
  return Boolean(profile?.data_consent_at) && profile?.data_consent_version === DATA_CONSENT_VERSION;
}
