export const EVENT_EXPIRES = "2026-11-01";

/** @returns {boolean} true if the page/section is still active */
export function isBeforeExpiry(expires, now = new Date()) {
  if (!expires) return true;
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return todayKey < expires;
}

export function eventActive(now = new Date()) {
  return isBeforeExpiry(EVENT_EXPIRES, now);
}
