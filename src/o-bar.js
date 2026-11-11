import { applyFeatureChrome, initializeAccountMenu, initializeIsland, initializeTheme, hideExpiredEventNav, setFooterYear } from "./site.js";
import { initAnalytics } from "./integrations/analytics.js";
import { loadSiteFeatures } from "./integrations/features.js";

async function boot() {
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
