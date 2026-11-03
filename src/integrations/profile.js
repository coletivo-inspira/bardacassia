import { authConfigured, getCurrentUser } from "./auth.js";
import { getSupabase } from "./supabase.js";
import { compressAvatarFile, DATA_CONSENT_VERSION, providerAvatarUrl } from "../lib/profile.js";

async function client() {
  if (!authConfigured) throw new Error("Login não configurado.");
  return getSupabase();
}

/** @returns {Promise<{ display_name: string, birth_date: string|null, avatar_url: string|null, data_consent_at: string|null, data_consent_version: string|null }|null>} */
export async function getMyProfile() {
  if (!authConfigured) return null;
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

export async function uploadMyAvatar(file) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Entre na sua conta para enviar a foto.");
  const supabase = await client();
  const blob = await compressAvatarFile(file);
  const path = `${user.id}/avatar.jpg`;
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, blob, { upsert: true, contentType: "image/jpeg", cacheControl: "3600" });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const url = `${data.publicUrl}?v=${Date.now()}`;
  return updateMyProfile({ avatarUrl: url });
}

export function hasCurrentConsent(profile) {
  return Boolean(profile?.data_consent_at) && profile?.data_consent_version === DATA_CONSENT_VERSION;
}
