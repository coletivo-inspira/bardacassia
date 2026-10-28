import "./styles.css";
import { authConfigured, displayName, getCurrentUser, onAuthChange, signOut } from "./integrations/auth.js";
import { hasStoredAuthSession } from "./integrations/supabase.js";

const THEME_KEY = "bdc-theme-v1";

export function applyTheme(theme, save = false) {
  const toggle = document.querySelector("#theme-toggle");
  document.documentElement.dataset.theme = theme;
  if (toggle) {
    const nextLabel = theme === "dark" ? "Modo claro" : "Modo noturno";
    const nextAction = theme === "dark" ? "Ativar tema claro" : "Ativar modo noturno";
    const label = toggle.querySelector(".theme-toggle-label");
    if (label) label.textContent = nextLabel;
    toggle.setAttribute("aria-label", nextAction);
  }
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

export function initializeTheme() {
  const toggle = document.querySelector("#theme-toggle");
  let saved = null;
  try {
    saved = localStorage.getItem(THEME_KEY);
  } catch {
    /* usa a preferência do aparelho */
  }
  let manualThemeChoice = saved === "light" || saved === "dark";
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const systemTheme = media.matches ? "dark" : "light";
  applyTheme(manualThemeChoice ? saved : document.documentElement.dataset.theme || systemTheme);

  const followSystem = (event) => {
    if (!manualThemeChoice) applyTheme(event.matches ? "dark" : "light");
  };
  if (media.addEventListener) media.addEventListener("change", followSystem);
  else media.addListener(followSystem);

  toggle?.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    manualThemeChoice = true;
    applyTheme(next, true);
  });
}

function currentPagePath() {
  const page = location.pathname.split("/").pop() || "index.html";
  return page === "login.html" ? "index.html" : `${page}${location.hash}`;
}

function renderSignedOut(link) {
  link.hidden = false;
  link.href = `login.html?next=${encodeURIComponent(currentPagePath())}`;
  link.setAttribute("aria-label", "Entrar na sua conta");
  link.closest(".header-actions")?.querySelector(".header-account-menu")?.remove();
}

function renderSignedIn(link, user) {
  link.hidden = true;
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
      <a role="menuitem" href="login.html#conta">Minha conta</a>
      <button role="menuitem" type="button" data-action="signout">Sair</button>
    </div>`;
  const button = wrapper.querySelector("button");
  const menu = wrapper.querySelector("[role=menu]");
  button.querySelector(".theme-toggle-label").textContent = name.split(/\s+/)[0];
  button.setAttribute("aria-label", `Conta de ${name}`);
  wrapper.querySelector(".header-account-email").textContent = user.email || name;
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
  wrapper.querySelector("[data-action=signout]").addEventListener("click", async () => {
    await signOut();
    renderSignedOut(link);
  });
  link.after(wrapper);
}

export async function initializeAccountMenu() {
  const link = document.querySelector("#header-account");
  if (!link || !authConfigured) return;
  renderSignedOut(link);
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
