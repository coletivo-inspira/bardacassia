import { parseAuthProviders } from "./auth-validation.js";

/** Interruptores do painel. Busca e código ao DJ não entram: ficam sempre ligados. */
export const FEATURE_SWITCHES = [
  { id: "discovery", label: "Descoberta", group: "Catálogo" },
  { id: "favorites", label: "Favoritas", group: "Catálogo" },
  { id: "favorites_sync", label: "Sincronizar favoritas na conta", group: "Catálogo" },
  { id: "popularity", label: "Ranking mais populares", group: "Catálogo" },
  { id: "spotify", label: "Spotify: mais ouvidas", group: "Catálogo" },
  { id: "deezer", label: "Capas e trechos (Deezer)", group: "Catálogo" },
  { id: "auth_public", label: "Login para o público", group: "Conta" },
  { id: "requests", label: "Pedidos de música", group: "Pedidos" },
  { id: "staff_panel", label: "Painel do garçom", group: "Pedidos" },
  { id: "page_evento", label: "Página Evento", group: "Páginas" },
  { id: "page_o_bar", label: "Página O bar", group: "Páginas" },
  { id: "page_cartaz", label: "Página Cartaz", group: "Páginas" },
  { id: "theme", label: "Tema claro/escuro", group: "Aparência" },
  { id: "analytics", label: "Estatísticas de acesso", group: "Aparência" },
];

export const FEATURE_IDS = FEATURE_SWITCHES.map((item) => item.id);

const PAGE_SWITCH = {
  "evento.html": "page_evento",
  "o-bar.html": "page_o_bar",
  "cartaz.html": "page_cartaz",
  "favoritos.html": "favorites",
};

/** Vite expõe import.meta.env; no Node de teste ele não existe. */
export function readViteEnv() {
  try {
    const env = import.meta.env;
    if (env && typeof env === "object") return env;
  } catch {
    /* testes Node importam o merge sem o Vite */
  }
  return {};
}

export function envFlag(value, fallback = true) {
  if (value == null || value === "") return fallback;
  return String(value) !== "false";
}

/** Padrão do build. O que não tem variável VITE_* nasce ligado. */
export function defaultFeatures(env = readViteEnv()) {
  const source = env && typeof env === "object" ? env : {};
  return {
    discovery: envFlag(source.VITE_ENABLE_DISCOVERY),
    favorites: true,
    favorites_sync: true,
    popularity: envFlag(source.VITE_ENABLE_POPULARITY),
    spotify: envFlag(source.VITE_ENABLE_SPOTIFY),
    deezer: true,
    auth_public: envFlag(source.VITE_ENABLE_AUTH),
    requests: envFlag(source.VITE_ENABLE_REQUESTS),
    staff_panel: true,
    page_evento: true,
    page_o_bar: true,
    page_cartaz: true,
    theme: true,
    analytics: true,
    request_mode: String(source.VITE_REQUEST_MODE || "qr") === "remoto" ? "remoto" : "qr",
    auth_providers: String(source.VITE_AUTH_PROVIDERS || ""),
  };
}

export function mergeFeatures(defaults, remote) {
  const base = { ...defaults };
  if (!remote || typeof remote !== "object" || Array.isArray(remote)) return base;
  for (const id of FEATURE_IDS) {
    if (typeof remote[id] === "boolean") base[id] = remote[id];
  }
  if (remote.request_mode === "qr" || remote.request_mode === "remoto") {
    base.request_mode = remote.request_mode;
  }
  if (typeof remote.auth_providers === "string") base.auth_providers = remote.auth_providers;
  return base;
}

export function isFeatureOn(features, id) {
  return Boolean(features?.[id]);
}

export function showDiscovery(features) { return isFeatureOn(features, "discovery"); }
export function showFavorites(features) { return isFeatureOn(features, "favorites"); }
export function showFavoritesSync(features) {
  return showFavorites(features) && isFeatureOn(features, "favorites_sync");
}
export function showPopularity(features) { return isFeatureOn(features, "popularity"); }
export function showSpotify(features, clientId = "") {
  return isFeatureOn(features, "spotify") && String(clientId || "").trim() !== "";
}
export function showDeezer(features) { return isFeatureOn(features, "deezer"); }
export function showPublicAuth(features) { return isFeatureOn(features, "auth_public"); }
export function showRequests(features) { return isFeatureOn(features, "requests"); }
export function showStaffPanel(features) { return isFeatureOn(features, "staff_panel"); }
export function showThemeToggle(features) { return isFeatureOn(features, "theme"); }
export function showAnalytics(features) { return isFeatureOn(features, "analytics"); }
export function shouldLoadAnalytics(features, analyticsId) {
  return showAnalytics(features) && String(analyticsId || "").trim() !== "";
}
export function showSearch() { return true; }
export function showDjCode() { return true; }

export function requestModeOf(features) {
  return features?.request_mode === "remoto" ? "remoto" : "qr";
}

export function pageFileFromHref(href) {
  const path = String(href || "").split("#")[0].split("?")[0].replace(/^\.\//, "");
  return path.split("/").pop() || "";
}

export function showNavHref(features, href) {
  const id = PAGE_SWITCH[pageFileFromHref(href)];
  if (!id) return true;
  return isFeatureOn(features, id);
}

export function showPageFile(features, file) {
  return showNavHref(features, file);
}

/** Vazio no banco = usar o que o build permite. "-" = nenhum botão. */
export function effectiveAuthProviders(features, buildProviders) {
  const build = Array.isArray(buildProviders) ? buildProviders : [];
  const raw = String(features?.auth_providers ?? "").trim();
  if (!raw) return [...build];
  const allowed = new Set(build);
  return parseAuthProviders(raw).filter((name) => allowed.has(name));
}

export function storedAuthProviders(checked, buildProviders) {
  const build = Array.isArray(buildProviders) ? [...buildProviders] : [];
  const selected = (Array.isArray(checked) ? checked : []).filter((name) => build.includes(name));
  if (!build.length || selected.length === build.length) return "";
  if (!selected.length) return "-";
  return selected.join(",");
}
