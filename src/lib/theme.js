import { isHexColor, LOGO_PALETTE } from "./palette.js";

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
// A WeakSet (not a data attribute) so markup copied from a bound toggle still gets its own listener.
const boundToggles = new WeakSet();

function onToggleClick() {
  manualThemeChoice = true;
  toggleTheme();
}

/**
 * Safe to call repeatedly (e.g. after rendering the account menu): every
 * toggle on the page gets exactly one click listener, so one tap flips once.
 */
export function initializeTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem(THEME_KEY);
  } catch {
    /* usa a preferência do aparelho */
  }
  if (!themeInitialized) {
    manualThemeChoice = saved === "light" || saved === "dark";
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const systemTheme = media.matches ? "dark" : "light";
    applyTheme(manualThemeChoice ? saved : document.documentElement.dataset.theme || systemTheme);
    const followSystem = (event) => {
      if (!manualThemeChoice) applyTheme(event.matches ? "dark" : "light");
    };
    if (media.addEventListener) media.addEventListener("change", followSystem);
    else media.addListener(followSystem);
    themeInitialized = true;
  } else {
    applyTheme(document.documentElement.dataset.theme || (saved === "light" || saved === "dark" ? saved : "dark"));
  }

  themeControls().forEach((toggle) => {
    if (boundToggles.has(toggle)) return;
    boundToggles.add(toggle);
    toggle.addEventListener("click", onToggleClick);
  });
}
