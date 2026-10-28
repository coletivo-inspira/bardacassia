import { initializeAccountMenu, initializeTheme, hideExpiredEventNav } from "./site.js";
import { initAnalytics } from "./integrations/analytics.js";

initializeTheme();
initAnalytics();
hideExpiredEventNav();
void initializeAccountMenu();
