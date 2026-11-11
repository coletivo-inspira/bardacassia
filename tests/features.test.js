import test from "node:test";
import assert from "node:assert/strict";
import {
  FEATURE_IDS,
  FEATURE_SWITCHES,
  defaultFeatures,
  effectiveAuthProviders,
  isFeatureOn,
  mergeFeatures,
  requestModeOf,
  showAnalytics,
  showDeezer,
  showDiscovery,
  showDjCode,
  showFavorites,
  showFavoritesSync,
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
  storedAuthProviders,
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
  assert.equal(features.theme, true);
  assert.equal(features.analytics, true);
  assert.equal(features.request_mode, "remoto");
  assert.equal(features.auth_providers, "google,facebook");
  assert.equal(defaultFeatures({}).request_mode, "qr");
  assert.equal(defaultFeatures().favorites, true);
});

test("merge prefers remote booleans and keeps defaults when the remote is missing", () => {
  const remote = { discovery: false, request_mode: "remoto", auth_providers: "google" };
  const merged = mergeFeatures(ALL_ON, remote);
  assert.equal(merged.discovery, false);
  assert.equal(merged.favorites, true);
  assert.equal(merged.request_mode, "remoto");
  assert.equal(merged.auth_providers, "google");
  assert.deepEqual(mergeFeatures(ALL_ON, null), ALL_ON);
  assert.equal(mergeFeatures(ALL_ON, { request_mode: "nope" }).request_mode, "qr");
  assert.equal(mergeFeatures(ALL_ON, { popularity: "false" }).popularity, true);
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
