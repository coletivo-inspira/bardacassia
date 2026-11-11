import test from "node:test";
import assert from "node:assert/strict";
import {
  FEATURE_IDS,
  FEATURE_SWITCHES,
  clampRuntimeInt,
  defaultFeatures,
  defaultThemeOf,
  effectiveAuthProviders,
  isFeatureOn,
  maxPendingPerUserOf,
  maxPendingTotalOf,
  mergeFeatures,
  normalizeDefaultTheme,
  normalizeSiteNotice,
  pendingExpireMinutesOf,
  popularLimitOf,
  requestModeOf,
  showAnalytics,
  showDeezer,
  showDiscovery,
  showDjCode,
  showFavorites,
  showFavoritesSync,
  showManagerPanel,
  showNavHref,
  showPageFile,
  showPopularity,
  showPublicAuth,
  showRequests,
  showSearch,
  showSpotify,
  showStaffPanel,
  showThemeToggle,
  shouldLoadAnalytics,
  siteNoticeOf,
  storedAuthProviders,
  validateRuntimeParams,
  writeLimitPerMinuteOf,
} from "../src/lib/features.js";

const ALL_ON = defaultFeatures({});

test("defaultFeatures reads the build flags and keeps the rest on", () => {
  const features = defaultFeatures({
    VITE_ENABLE_DISCOVERY: "false",
    VITE_ENABLE_POPULARITY: "false",
    VITE_ENABLE_SPOTIFY: "false",
    VITE_ENABLE_AUTH: "false",
    VITE_ENABLE_REQUESTS: "false",
    VITE_REQUEST_MODE: "remoto",
    VITE_AUTH_PROVIDERS: "google,facebook",
  });
  assert.equal(features.discovery, false);
  assert.equal(features.popularity, false);
  assert.equal(features.spotify, false);
  assert.equal(features.auth_public, false);
  assert.equal(features.requests, false);
  assert.equal(features.favorites, true);
  assert.equal(features.favorites_sync, true);
  assert.equal(features.deezer, true);
  assert.equal(features.staff_panel, true);
  assert.equal(features.manager_panel, true);
  assert.equal(features.theme, true);
  assert.equal(features.analytics, true);
  assert.equal(features.request_mode, "remoto");
  assert.equal(features.auth_providers, "google,facebook");
  assert.equal(features.default_theme, "auto");
  assert.equal(features.site_notice, "");
  assert.equal(features.popular_limit, 40);
  assert.equal(features.pending_expire_minutes, 30);
  assert.equal(features.max_pending_per_user, 3);
  assert.equal(features.max_pending_total, 40);
  assert.equal(features.write_limit_per_minute, 120);
  assert.equal(defaultFeatures({}).request_mode, "qr");
  assert.equal(defaultFeatures().favorites, true);
});

test("merge prefers remote booleans and runtime params while clamping invalid values", () => {
  const remote = {
    discovery: false,
    manager_panel: false,
    request_mode: "remoto",
    auth_providers: "google",
    default_theme: "light",
    site_notice: "  Noite de sertanejo às 21h!  ",
    popular_limit: 75,
    pending_expire_minutes: 45,
    max_pending_per_user: 5,
    max_pending_total: 80,
    write_limit_per_minute: 240,
  };
  const merged = mergeFeatures(ALL_ON, remote);
  assert.equal(merged.discovery, false);
  assert.equal(merged.manager_panel, false);
  assert.equal(merged.favorites, true);
  assert.equal(merged.request_mode, "remoto");
  assert.equal(merged.auth_providers, "google");
  assert.equal(defaultThemeOf(merged), "light");
  assert.equal(siteNoticeOf(merged), "Noite de sertanejo às 21h!");
  assert.equal(popularLimitOf(merged), 75);
  assert.equal(pendingExpireMinutesOf(merged), 45);
  assert.equal(maxPendingPerUserOf(merged), 5);
  assert.equal(maxPendingTotalOf(merged), 80);
  assert.equal(writeLimitPerMinuteOf(merged), 240);

  assert.deepEqual(mergeFeatures(ALL_ON, null), ALL_ON);
  assert.equal(mergeFeatures(ALL_ON, { request_mode: "nope" }).request_mode, "qr");
  assert.equal(mergeFeatures(ALL_ON, { default_theme: "neon" }).default_theme, "auto");
  assert.equal(mergeFeatures(ALL_ON, { popularity: "false" }).popularity, true);
  assert.equal(mergeFeatures(ALL_ON, { popular_limit: 999 }).popular_limit, 100);
  assert.equal(mergeFeatures(ALL_ON, { popular_limit: 1 }).popular_limit, 5);
});

test("runtime parameter clamping and validation enforce SQL bounds", () => {
  assert.equal(normalizeDefaultTheme("DARK"), "dark");
  assert.equal(normalizeDefaultTheme("invalid"), "auto");
  assert.equal(normalizeSiteNotice("x".repeat(300)).length, 240);
  assert.equal(clampRuntimeInt("write_limit_per_minute", 5), 20);
  assert.equal(clampRuntimeInt("write_limit_per_minute", 5000), 1000);
  assert.equal(clampRuntimeInt("write_limit_per_minute", ""), 120);

  const valid = validateRuntimeParams({
    default_theme: "light",
    site_notice: "Palco livre hoje",
    popular_limit: "60",
    pending_expire_minutes: "40",
    max_pending_per_user: "4",
    max_pending_total: "90",
    write_limit_per_minute: "180",
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.value.popular_limit, 60);

  const invalid = validateRuntimeParams({
    default_theme: "azul",
    site_notice: "a".repeat(241),
    popular_limit: "105",
    pending_expire_minutes: "2",
  });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.default_theme);
  assert.ok(invalid.errors.site_notice);
  assert.ok(invalid.errors.popular_limit);
  assert.ok(invalid.errors.pending_expire_minutes);
});

test("search and the DJ code stay on and are not switches", () => {
  assert.equal(showSearch(), true);
  assert.equal(showDjCode(), true);
  assert.equal(FEATURE_SWITCHES.some((item) => item.id === "search" || item.id === "dj"), false);
  for (const item of FEATURE_SWITCHES) {
    assert.equal(typeof item.label, "string");
    assert.ok(item.label.length > 0);
    assert.ok(item.group);
  }
});

test("each switch off hides the matching behavior", () => {
  const cases = [
    ["discovery", showDiscovery, (features) => showNavHref(features, "index.html")],
    ["favorites", showFavorites],
    ["favorites_sync", (features) => showFavoritesSync(features), (features) => showFavorites(features)],
    ["popularity", showPopularity],
    ["deezer", showDeezer],
    ["auth_public", showPublicAuth],
    ["requests", showRequests],
    ["staff_panel", showStaffPanel],
    ["manager_panel", showManagerPanel],
    ["page_evento", (features) => showNavHref(features, "evento.html")],
    ["page_o_bar", (features) => showNavHref(features, "./o-bar.html")],
    ["page_cartaz", (features) => showPageFile(features, "cartaz.html")],
    ["theme", showThemeToggle],
    ["analytics", showAnalytics],
  ];
  for (const [id, predicate, stillOn] of cases) {
    const off = { ...ALL_ON, [id]: false };
    assert.equal(isFeatureOn(off, id), false, id);
    assert.equal(predicate(off), false, id);
    if (stillOn) assert.equal(stillOn(off), true, id);
    assert.equal(predicate(ALL_ON), true, id);
  }
  assert.equal(showPageFile({ ...ALL_ON, favorites: false }, "favoritos.html"), false);
  assert.equal(showNavHref(ALL_ON, "index.html#buscar"), true);
  assert.equal(showFavoritesSync({ ...ALL_ON, favorites: false, favorites_sync: true }), false);
  assert.equal(showSpotify({ ...ALL_ON, spotify: false }, "client"), false);
  assert.equal(showSpotify({ ...ALL_ON, spotify: true }, ""), false);
  assert.equal(showSpotify(ALL_ON, "client"), true);
  assert.equal(shouldLoadAnalytics({ ...ALL_ON, analytics: false }, "G-1"), false);
  assert.equal(shouldLoadAnalytics(ALL_ON, ""), false);
  assert.equal(shouldLoadAnalytics(ALL_ON, "G-1"), true);
  assert.equal(requestModeOf({ ...ALL_ON, request_mode: "remoto" }), "remoto");
  assert.equal(requestModeOf({ ...ALL_ON, request_mode: "qr" }), "qr");
  assert.equal(FEATURE_IDS.length, FEATURE_SWITCHES.length);
});

test("empty auth providers follow the build and a dash stores none", () => {
  const build = ["google", "facebook"];
  assert.deepEqual(effectiveAuthProviders({ auth_providers: "" }, build), build);
  assert.deepEqual(effectiveAuthProviders({ auth_providers: "google,apple" }, build), ["google"]);
  assert.deepEqual(effectiveAuthProviders({ auth_providers: "-" }, build), []);
  assert.equal(storedAuthProviders(["google", "facebook"], build), "");
  assert.equal(storedAuthProviders(["google"], build), "google");
  assert.equal(storedAuthProviders([], build), "-");
});
