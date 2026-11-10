import { initializeAccountMenu, initializeIsland, initializeTheme, hideExpiredEventNav, setFooterYear } from "./site.js";
import { initAnalytics } from "./integrations/analytics.js";

initializeTheme();
initAnalytics();
hideExpiredEventNav();
setFooterYear();
initializeIsland();
void initializeAccountMenu();
