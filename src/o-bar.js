import { initializeAccountMenu, initializeTheme, hideExpiredEventNav, setFooterYear } from "./site.js";
import { initAnalytics } from "./integrations/analytics.js";

initializeTheme();
initAnalytics();
hideExpiredEventNav();
setFooterYear();
void initializeAccountMenu();
