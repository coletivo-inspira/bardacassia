import { isHexColor, LOGO_PALETTE } from "./palette.js";
import { getFeatures } from "./feature-state.js";
import { defaultThemeOf, normalizeDefaultTheme } from "./features.js";

export const THEME_KEY = "bdc-theme-v1";

const TOGGLE_SELECTOR = "#theme-toggle, [data-theme-toggle]";

function themeColor(theme) {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    if (isHexColor(value)) return value;
  } catch {
    /* o teste sem getComputedStyle cai na cor da logo */
  }
  return theme === "light" ? LOGO_PALETTE.light.bg : LOGO_PALETTE.dark.bg;
}

function themeControls() {
  return document.querySelectorAll(TOGGLE_SELECTOR);
}

function readSavedTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : null;
  } catch {
    return null;
  }
}

export function applyTheme(theme, save = false) {
  document.documentElement.dataset.theme = theme;
  const nextLabel = theme === "dark" ? "Modo claro" : "Modo noturno";
  const nextAction = theme === "dark" ? "Ativar tema claro" : "Ativar modo noturno";
  themeControls().forEach((toggle) => {
    const label = toggle.querySelector(".theme-toggle-label");
    if (label) label.textContent = nextLabel;
    toggle.setAttribute("aria-label", nextAction);
    if (toggle.matches("[data-theme-toggle]")) {
      toggle.setAttribute("aria-pressed", String(theme === "dark"));
    }
  });
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = themeColor(theme);
  if (save) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* funciona enquanto a página estiver aberta */
    }
  }
}

export function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next, true);
  return next;
}

let themeInitialized = false;
let manualThemeChoice = false;
let configuredDefaultTheme = "auto";
// A WeakSet (not a data attribute) so markup copied from a bound toggle still gets its own listener.
const boundToggles = new WeakSet();

function onToggleClick() {
  manualThemeChoice = true;
  toggleTheme();
}

/**
 * Aplica o tema inicial configurado remotamente (`light` ou `dark`) somente
 * quando o visitante ainda não gravou escolha manual em `bdc-theme-v1`.
 */
export function applyDefaultTheme(defaultTheme) {
  configuredDefaultTheme = normalizeDefaultTheme(defaultTheme);
  if (typeof document === "undefined" || !document?.documentElement) return configuredDefaultTheme;
  if (manualThemeChoice || readSavedTheme()) return configuredDefaultTheme;
  if (configuredDefaultTheme === "light" || configuredDefaultTheme === "dark") {
    applyTheme(configuredDefaultTheme, false);
  }
  return configuredDefaultTheme;
}

/**
 * Safe to call repeatedly (e.g. after rendering the account menu): every
 * toggle on the page gets exactly one click listener, so one tap flips once.
 */
export function initializeTheme() {
  const saved = readSavedTheme();
  const remoteDefault = configuredDefaultTheme !== "auto"
    ? configuredDefaultTheme
    : defaultThemeOf(getFeatures());

  if (!themeInitialized) {
    manualThemeChoice = saved !== null;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const systemTheme = media.matches ? "dark" : "light";
    const initial = manualThemeChoice
      ? saved
      : (remoteDefault === "light" || remoteDefault === "dark"
        ? remoteDefault
        : (document.documentElement.dataset.theme || systemTheme));
    applyTheme(initial);
    const followSystem = (event) => {
      const currentDefault = configuredDefaultTheme !== "auto"
        ? configuredDefaultTheme
        : defaultThemeOf(getFeatures());
      if (!manualThemeChoice && currentDefault === "auto") {
        applyTheme(event.matches ? "dark" : "light");
      }
    };
    if (media.addEventListener) media.addEventListener("change", followSystem);
    else media.addListener(followSystem);
    themeInitialized = true;
  } else {
    const fallback = saved
      || (remoteDefault === "light" || remoteDefault === "dark" ? remoteDefault : null)
      || document.documentElement.dataset.theme
      || "dark";
    applyTheme(document.documentElement.dataset.theme || fallback);
  }

  themeControls().forEach((toggle) => {
    if (boundToggles.has(toggle)) return;
    boundToggles.add(toggle);
    toggle.addEventListener("click", onToggleClick);
  });
}
