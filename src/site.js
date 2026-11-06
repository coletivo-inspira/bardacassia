import "./styles.css";
import { authConfigured, displayName, getCurrentUser, onAuthChange, signOut } from "./integrations/auth.js";
import { getMyProfile } from "./integrations/profile.js";
import { hasStoredAuthSession } from "./integrations/supabase.js";
import { providerAvatarUrl } from "./lib/profile.js";

const THEME_KEY = "bdc-theme-v1";
const THEME_ICON_SUN = `<svg class="theme-icon-sun" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;
const THEME_ICON_MOON = `<svg class="theme-icon-moon" aria-hidden="true" viewBox="0 0 24 24"><path d="M20.2 15.1A8.4 8.4 0 0 1 8.9 3.8 8.5 8.5 0 1 0 20.2 15.1Z"/></svg>`;

function themeControls() {
  return document.querySelectorAll("#theme-toggle, [data-theme-toggle]");
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
      toggle.setAttribute("aria-pressed", String(theme === "light"));
    }
  });
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === "dark" ? "#141414" : "#f7f3e9";
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
    if (toggle.dataset.themeBound === "1") return;
    toggle.dataset.themeBound = "1";
    toggle.addEventListener("click", () => {
      manualThemeChoice = true;
      toggleTheme();
    });
  });
}

function currentPagePath() {
  const page = location.pathname.split("/").pop() || "index.html";
  return page === "login.html" ? "index.html" : `${page}${location.hash}`;
}

function setHeaderThemeVisible(visible) {
  const toggle = document.querySelector("#theme-toggle");
  if (toggle) toggle.hidden = !visible;
}

function renderSignedOut(link) {
  link.hidden = false;
  link.href = `login.html?next=${encodeURIComponent(currentPagePath())}`;
  link.setAttribute("aria-label", "Entrar na sua conta");
  link.closest(".header-actions")?.querySelector(".header-account-menu")?.remove();
  setHeaderThemeVisible(true);
}

function setHeaderAccountAvatar(button, url) {
  const src = String(url || "").trim();
  if (!button || !src) return;
  const icon = button.querySelector("svg");
  let img = button.querySelector(".header-account-avatar");
  if (img?.dataset.src === src) {
    icon?.setAttribute("hidden", "");
    return;
  }
  if (!img) {
    img = document.createElement("img");
    img.className = "header-account-avatar";
    img.alt = "";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    button.prepend(img);
  }
  img.dataset.src = src;
  img.src = src;
  icon?.setAttribute("hidden", "");
  img.addEventListener("error", () => {
    img.remove();
    icon?.removeAttribute("hidden");
  }, { once: true });
}

async function loadHeaderAccountAvatar(button, user) {
  const quick = providerAvatarUrl(user);
  if (quick) setHeaderAccountAvatar(button, quick);
  try {
    const profile = await getMyProfile();
    const url = String(profile?.avatar_url || quick || "").trim();
    if (url) setHeaderAccountAvatar(button, url);
  } catch {
    /* keep silhouette or provider picture */
  }
}

function renderSignedIn(link, user) {
  link.hidden = true;
  setHeaderThemeVisible(false);
  const actions = link.closest(".header-actions");
  actions?.querySelector(".header-account-menu")?.remove();
  const name = displayName(user);
  const wrapper = document.createElement("div");
  wrapper.className = "header-account-menu";
  wrapper.innerHTML = `
    <button class="theme-toggle header-account" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="header-account-list">
      ${link.querySelector("svg").outerHTML}
      <span class="theme-toggle-label"></span>
    </button>
    <div id="header-account-list" role="menu" hidden>
      <div class="header-account-email"></div>
      <a role="menuitem" href="index.html#favoritas">Meus favoritos</a>
      <a role="menuitem" href="login.html#conta">Minha conta</a>
      <button role="menuitem" type="button" data-action="theme" data-theme-toggle>
        ${THEME_ICON_SUN}${THEME_ICON_MOON}
        <span class="theme-toggle-label"></span>
      </button>
      <button role="menuitem" type="button" data-action="signout">Sair</button>
    </div>`;
  const button = wrapper.querySelector("button.header-account");
  const menu = wrapper.querySelector("[role=menu]");
  button.querySelector(".theme-toggle-label").textContent = name.split(/\s+/)[0];
  button.setAttribute("aria-label", `Conta de ${name}`);
  wrapper.querySelector(".header-account-email").textContent = user.email || name;
  void loadHeaderAccountAvatar(button, user);
  const setOpen = (open) => {
    menu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) menu.querySelector("[role=menuitem]")?.focus();
  };
  button.addEventListener("click", () => setOpen(menu.hidden));
  wrapper.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) { setOpen(false); button.focus(); }
  });
  document.addEventListener("click", (event) => { if (!wrapper.contains(event.target)) setOpen(false); });
  wrapper.querySelector("[data-action=theme]").addEventListener("click", () => {
    toggleTheme();
  });
  wrapper.querySelector("[data-action=signout]").addEventListener("click", async () => {
    await signOut();
    renderSignedOut(link);
  });
  link.after(wrapper);
  applyTheme(document.documentElement.dataset.theme || "dark");
  initializeTheme();
}

export async function initializeAccountMenu() {
  const link = document.querySelector("#header-account");
  if (!link) return;
  // Always show Entrar in the main header; login.html explains when Auth is off.
  renderSignedOut(link);
  if (!authConfigured) return;
  if (!hasStoredAuthSession()) return;
  try {
    const user = await getCurrentUser();
    if (user) renderSignedIn(link, user);
    await onAuthChange(async (event) => {
      if (event === "SIGNED_OUT") renderSignedOut(link);
      else if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        const updated = await getCurrentUser();
        if (updated) renderSignedIn(link, updated);
        else renderSignedOut(link);
      }
    });
  } catch {
    /* the "Entrar" link keeps working when Supabase is unreachable */
  }
}

/** @returns {boolean} true if the page/section is still active */
export function isBeforeExpiry(expires) {
  if (!expires) return true;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return todayKey < expires;
}

export function setFooterYear() {
  const year = String(new Date().getFullYear());
  document.querySelectorAll("[data-current-year]").forEach((el) => {
    el.textContent = year;
  });
}

export function hideExpiredEventNav() {
  document.querySelectorAll("[data-expires]").forEach((el) => {
    const expires = el.getAttribute("data-expires");
    if (isBeforeExpiry(expires)) return;
    el.hidden = true;
  });
  document.querySelectorAll('a[href="evento.html"], a[href="./evento.html"]').forEach((link) => {
    const expires = link.getAttribute("data-expires") || "2026-11-01";
    if (!isBeforeExpiry(expires)) link.hidden = true;
  });
}
