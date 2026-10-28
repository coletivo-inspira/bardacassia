import { hideExpiredEventNav, initializeAccountMenu, initializeTheme, isBeforeExpiry } from "./site.js";
import { initAnalytics } from "./integrations/analytics.js";

const EVENT_EXPIRES = "2026-11-01";

if (!isBeforeExpiry(EVENT_EXPIRES)) {
  location.replace(new URL("index.html", location.href).href);
} else {
  initializeTheme();
  initAnalytics();
  hideExpiredEventNav();
  void initializeAccountMenu();
}
