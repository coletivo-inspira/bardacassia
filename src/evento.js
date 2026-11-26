import { applyFeatureChrome, hideExpiredEventNav, initializeAccountMenu, initializeIsland, initializeTheme, setFooterYear } from "./site.js";
import { initAnalytics } from "./integrations/analytics.js";
import { loadSiteFeatures } from "./integrations/features.js";
import { eventActive } from "./lib/event.js";

async function boot() {
  if (!eventActive()) {
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
