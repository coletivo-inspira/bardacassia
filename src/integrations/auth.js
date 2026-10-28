import { getSupabase, setPersistSession, supabaseConfigured } from "./supabase.js";
import { normalizeEmail } from "../lib/auth-validation.js";

const KNOWN_PROVIDERS = ["google", "facebook"];

export const authConfigured = supabaseConfigured && String(import.meta.env.VITE_ENABLE_AUTH || "true") !== "false";
export const authProviders = String(import.meta.env.VITE_AUTH_PROVIDERS || "")
  .split(",")
  .map((name) => name.trim().toLowerCase())
  .filter((name, index, list) => KNOWN_PROVIDERS.includes(name) && list.indexOf(name) === index);
export const captchaSiteKey = String(import.meta.env.VITE_AUTH_CAPTCHA_SITE_KEY || "");

function loginUrl(hash = "", next = "") {
  const url = new URL("login.html", location.href);
  url.search = next ? `?next=${encodeURIComponent(next)}` : "";
  url.hash = hash;
  return url.href;
}

export function isAnonymous(user) {
  return Boolean(user?.is_anonymous);
}

export function displayName(user) {
  const meta = user?.user_metadata || {};
  return String(meta.display_name || meta.full_name || meta.name || user?.email?.split("@")[0] || "Minha conta").trim();
}

async function client() {
  if (!authConfigured) throw new Error("Login não configurado.");
  return getSupabase();
}

/** Returns the signed-in (non-anonymous) user, or null. */
export async function getCurrentUser() {
  if (!authConfigured) return null;
  const supabase = await client();
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user || null;
  return user && !isAnonymous(user) ? user : null;
}

export async function onAuthChange(callback) {
  if (!authConfigured) return () => {};
  const supabase = await client();
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    // Defer so callbacks may call other supabase methods without deadlocking the auth lock.
    setTimeout(() => callback(event, session), 0);
  });
  return () => data.subscription.unsubscribe();
}

/** Anonymous session used by the ranking; reuses any existing session. */
export async function ensureSession() {
  const supabase = await getSupabase();
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  const { data: created, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return created.session;
}

export async function signIn({ email, password, persist = true, captchaToken }) {
  const supabase = await client();
  setPersistSession(persist);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
    options: captchaToken ? { captchaToken } : undefined,
  });
  if (error) throw error;
  return data.user;
}

/**
 * Creates an account. An existing anonymous visitor is upgraded in place so
 * ranking interactions stay attached to the same user id.
 * @returns {{ needsConfirmation: boolean, needsPassword: boolean }}
 */
export async function signUp({ email, password, displayName: name, persist = true, captchaToken, next = "" }) {
  const supabase = await client();
  setPersistSession(persist);
  const normalized = normalizeEmail(email);
  const metadata = { display_name: String(name || "").trim() };
  const { data: current } = await supabase.auth.getSession();

  if (isAnonymous(current.session?.user)) {
    const redirect = { emailRedirectTo: loginUrl("nova-senha", next) };
    const full = await supabase.auth.updateUser({ email: normalized, password, data: metadata }, redirect);
    if (!full.error) return { needsConfirmation: true, needsPassword: false };
    // Some Auth versions only accept the password after the e-mail is confirmed.
    const emailOnly = await supabase.auth.updateUser({ email: normalized, data: metadata }, redirect);
    if (!emailOnly.error) return { needsConfirmation: true, needsPassword: true };
    throw emailOnly.error;
  }

  const { data, error } = await supabase.auth.signUp({
    email: normalized,
    password,
    options: { data: metadata, emailRedirectTo: loginUrl("", next), ...(captchaToken ? { captchaToken } : {}) },
  });
  if (error) throw error;
  return { needsConfirmation: !data.session, needsPassword: false };
}

export async function signInWithEmailLink({ email, persist = true, captchaToken, next = "" }) {
  const supabase = await client();
  setPersistSession(persist);
  const { error } = await supabase.auth.signInWithOtp({
    email: normalizeEmail(email),
    options: { shouldCreateUser: false, emailRedirectTo: loginUrl("", next), ...(captchaToken ? { captchaToken } : {}) },
  });
  if (error) throw error;
}

export async function signInWithProvider(provider, { persist = true, next = "" } = {}) {
  if (!authProviders.includes(provider)) throw new Error("Provedor indisponível.");
  const supabase = await client();
  setPersistSession(persist);
  const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: loginUrl("", next) } });
  if (error) throw error;
}

export async function requestPasswordReset({ email, captchaToken }) {
  const supabase = await client();
  const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
    redirectTo: loginUrl("nova-senha"),
    ...(captchaToken ? { captchaToken } : {}),
  });
  if (error) throw error;
}

export async function updatePassword(password) {
  const supabase = await client();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut() {
  if (!authConfigured) return;
  const supabase = await client();
  await supabase.auth.signOut({ scope: "local" });
}

/** Deletion runs in an Edge Function because it needs the service-role key. */
export async function deleteAccount() {
  const supabase = await client();
  const { error } = await supabase.functions.invoke("account-delete", { method: "POST" });
  if (error) throw error;
  await supabase.auth.signOut({ scope: "local" });
}
