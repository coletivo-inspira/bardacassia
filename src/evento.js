import { applyFeatureChrome, hideExpiredEventNav, initializeAccountMenu, initializeIsland, initializeTheme, isBeforeExpiry, setFooterYear } from "./site.js";
import { initAnalytics } from "./integrations/analytics.js";
import { loadSiteFeatures } from "./integrations/features.js";

const EVENT_EXPIRES = "2026-11-01";

async function boot() {
  if (!isBeforeExpiry(EVENT_EXPIRES)) {
    location.replace(new URL("index.html", location.href).href);
    return;
  }
  await loadSiteFeatures();
  const open = applyFeatureChrome();
  initializeTheme();
  if (open) initAnalytics();
  hideExpiredEventNav();
  setFooterYear();
  initializeIsland();
  void initializeAccountMenu();
}

void boot();
