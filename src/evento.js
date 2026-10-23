import "./styles.css";

const THEME_KEY = "bdc-theme-v1";
const EVENT_EXPIRES = "2026-11-01";

const themeToggle = document.querySelector("#theme-toggle");
let manualThemeChoice = false;

function todayKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function eventExpired() {
  return todayKey() >= EVENT_EXPIRES;
}

function applyTheme(theme, save = false) {
  document.documentElement.dataset.theme = theme;
  const nextLabel = theme === "dark" ? "Modo claro" : "Modo noturno";
  const nextAction = theme === "dark" ? "Ativar tema claro" : "Ativar modo noturno";
  if (themeToggle) {
    themeToggle.querySelector(".theme-toggle-label").textContent = nextLabel;
    themeToggle.setAttribute("aria-label", nextAction);
  }
  document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#141414" : "#f7f3e9";
  if (save) {
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* funciona enquanto a página estiver aberta */ }
  }
}

function initializeTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch { /* usa a preferência do aparelho */ }
  manualThemeChoice = saved === "light" || saved === "dark";
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const systemTheme = media.matches ? "dark" : "light";
  applyTheme(manualThemeChoice ? saved : (document.documentElement.dataset.theme || systemTheme));
  const followSystem = (event) => {
    if (!manualThemeChoice) applyTheme(event.matches ? "dark" : "light");
  };
  if (media.addEventListener) media.addEventListener("change", followSystem);
  else media.addListener(followSystem);
}

if (eventExpired()) {
  location.replace(new URL("index.html", location.href).href);
} else {
  initializeTheme();
  themeToggle?.addEventListener("click", () => {
    manualThemeChoice = true;
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true);
  });
}
