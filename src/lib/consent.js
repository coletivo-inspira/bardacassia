import { DATA_CONSENT_VERSION } from "./profile.js";

/** user_metadata key set at e-mail sign-up so consent survives a confirmation link opened on another device. */
export const PENDING_CONSENT_METADATA_KEY = "data_consent_pending";
/** localStorage key set before an OAuth sign-up redirect (the provider cannot carry metadata). */
export const PENDING_CONSENT_STORAGE_KEY = "bdc-consent-pending-v1";
/** A stale OAuth flag must not grant consent to whoever signs in later on a shared device. */
export const PENDING_CONSENT_MAX_AGE_MS = 30 * 60 * 1000;

export function hasCurrentConsent(profile) {
  return Boolean(profile?.data_consent_at) && profile?.data_consent_version === DATA_CONSENT_VERSION;
}

export function pendingConsentRecord(now = Date.now()) {
  return JSON.stringify({ version: DATA_CONSENT_VERSION, at: now });
}

/** Whether a stored OAuth flag is for the current consent text and still fresh. */
export function storedConsentIsPending(raw, now = Date.now()) {
  if (!raw) return false;
  try {
    const { version, at } = JSON.parse(raw);
    const age = now - Number(at);
    return version === DATA_CONSENT_VERSION && age >= 0 && age <= PENDING_CONSENT_MAX_AGE_MS;
  } catch {
    return false;
  }
}

/** Consent the person gave before having a session, from sign-up metadata or the OAuth flag. */
export function hasPendingConsent({ metadata, stored, now = Date.now() } = {}) {
  return metadata?.[PENDING_CONSENT_METADATA_KEY] === DATA_CONSENT_VERSION || storedConsentIsPending(stored, now);
}

export function shouldApplyPendingConsent(profile, pending) {
  return Boolean(pending) && !hasCurrentConsent(profile);
}
