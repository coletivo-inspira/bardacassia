import { parseAuthProviders } from "./auth-validation.js";

export const DEFAULT_THEMES = ["auto", "light", "dark"];
export const SITE_NOTICE_MAX = 240;

export const RUNTIME_PARAM_BOUNDS = {
  popular_limit: { min: 5, max: 100, fallback: 40, label: "Tamanho do ranking" },
  pending_expire_minutes: { min: 5, max: 240, fallback: 30, label: "Expiração de pendentes (min)" },
  max_pending_per_user: { min: 1, max: 20, fallback: 3, label: "Máx. pendentes por pessoa" },
  max_pending_total: { min: 5, max: 500, fallback: 40, label: "Máx. pendentes no bar" },
  write_limit_per_minute: { min: 20, max: 1000, fallback: 120, label: "Gravações/min por sessão" },
};

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
  { id: "staff_panel", label: "Painel do garçom", group: "Páginas e Painéis" },
  { id: "manager_panel", label: "Painel do gerente", group: "Páginas e Painéis" },
  { id: "page_evento", label: "Página Evento", group: "Páginas e Painéis" },
  { id: "page_o_bar", label: "Página O bar", group: "Páginas e Painéis" },
  { id: "page_cartaz", label: "Página Cartaz", group: "Páginas e Painéis" },
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

export function normalizeDefaultTheme(value) {
  const clean = String(value ?? "").trim().toLowerCase();
  return DEFAULT_THEMES.includes(clean) ? clean : "auto";
}

export function normalizeSiteNotice(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SITE_NOTICE_MAX);
}

export function clampRuntimeInt(id, value) {
  const spec = RUNTIME_PARAM_BOUNDS[id];
  if (!spec) return 0;
  if (value === null || value === undefined || value === "" || typeof value === "boolean") {
    return spec.fallback;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) return spec.fallback;
  return Math.min(spec.max, Math.max(spec.min, Math.round(num)));
}

export function validateRuntimeParams(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const errors = {};
  const value = {};

  if (source.default_theme !== undefined) {
    const theme = String(source.default_theme ?? "").trim().toLowerCase();
    if (!DEFAULT_THEMES.includes(theme)) {
      errors.default_theme = "Escolha automático, claro ou escuro.";
    } else {
      value.default_theme = theme;
    }
  }

  if (source.site_notice !== undefined) {
    const notice = String(source.site_notice ?? "").replace(/\s+/g, " ").trim();
    if (notice.length > SITE_NOTICE_MAX) {
      errors.site_notice = `O aviso pode ter no máximo ${SITE_NOTICE_MAX} caracteres.`;
    } else {
      value.site_notice = notice;
    }
  }

  for (const [key, spec] of Object.entries(RUNTIME_PARAM_BOUNDS)) {
    if (source[key] === undefined) continue;
    const raw = String(source[key] ?? "").trim();
    const num = Number(raw);
    if (!raw || !Number.isFinite(num) || !Number.isInteger(num) || num < spec.min || num > spec.max) {
      errors[key] = `${spec.label} deve ficar entre ${spec.min} e ${spec.max}.`;
    } else {
      value[key] = num;
    }
  }

  return { ok: Object.keys(errors).length === 0, value, errors };
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
    manager_panel: true,
    page_evento: true,
    page_o_bar: true,
    page_cartaz: true,
    theme: true,
    analytics: true,
    request_mode: String(source.VITE_REQUEST_MODE || "qr") === "remoto" ? "remoto" : "qr",
    auth_providers: String(source.VITE_AUTH_PROVIDERS || ""),
    default_theme: normalizeDefaultTheme(source.VITE_DEFAULT_THEME),
    site_notice: "",
    popular_limit: RUNTIME_PARAM_BOUNDS.popular_limit.fallback,
    pending_expire_minutes: RUNTIME_PARAM_BOUNDS.pending_expire_minutes.fallback,
    max_pending_per_user: RUNTIME_PARAM_BOUNDS.max_pending_per_user.fallback,
    max_pending_total: RUNTIME_PARAM_BOUNDS.max_pending_total.fallback,
    write_limit_per_minute: RUNTIME_PARAM_BOUNDS.write_limit_per_minute.fallback,
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
  if (DEFAULT_THEMES.includes(remote.default_theme)) {
    base.default_theme = remote.default_theme;
  }
  if (typeof remote.site_notice === "string") {
    base.site_notice = normalizeSiteNotice(remote.site_notice);
  }
  for (const key of Object.keys(RUNTIME_PARAM_BOUNDS)) {
    if (typeof remote[key] === "number" && Number.isFinite(remote[key])) {
      base[key] = clampRuntimeInt(key, remote[key]);
    }
  }
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
export function showManagerPanel(features) { return isFeatureOn(features, "manager_panel"); }
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

export function defaultThemeOf(features) {
  return normalizeDefaultTheme(features?.default_theme);
}

export function siteNoticeOf(features) {
  return normalizeSiteNotice(features?.site_notice);
}

export function popularLimitOf(features) {
  return clampRuntimeInt("popular_limit", features?.popular_limit);
}

export function pendingExpireMinutesOf(features) {
  return clampRuntimeInt("pending_expire_minutes", features?.pending_expire_minutes);
}

export function maxPendingPerUserOf(features) {
  return clampRuntimeInt("max_pending_per_user", features?.max_pending_per_user);
}

export function maxPendingTotalOf(features) {
  return clampRuntimeInt("max_pending_total", features?.max_pending_total);
}

export function writeLimitPerMinuteOf(features) {
  return clampRuntimeInt("write_limit_per_minute", features?.write_limit_per_minute);
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
