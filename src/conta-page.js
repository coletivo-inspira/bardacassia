import { authBackendReady, displayName, getCurrentUser, onAuthChange, publicAuthEnabled, signOut } from "./integrations/auth.js";
import { loadSiteFeatures } from "./integrations/features.js";
import { getMyProfile } from "./integrations/profile.js";
import { hasStoredAuthSession } from "./integrations/supabase.js";
import { getFeatures } from "./lib/feature-state.js";
import { showFavorites, showThemeToggle } from "./lib/features.js";
import { providerAvatarUrl } from "./lib/profile.js";
import {
  hideExpiredEventNav,
  initializeAccountMenu,
  initializeIsland,
  initializeTheme,
  setFooterYear,
} from "./site.js";

const THEME_ICON_SUN = `<svg class="theme-icon-sun" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;
const THEME_ICON_MOON = `<svg class="theme-icon-moon" aria-hidden="true" viewBox="0 0 24 24"><path d="M20.2 15.1A8.4 8.4 0 0 1 8.9 3.8 8.5 8.5 0 1 0 20.2 15.1Z"/></svg>`;
const HEART_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20S4 15 4 9a4 4 0 0 1 8-2 4 4 0 0 1 8 2c0 6-8 11-8 11Z"/></svg>`;
const USER_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.2c1.3-3.6 4.2-5.4 7.5-5.4s6.2 1.8 7.5 5.4"/></svg>`;
const EXIT_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 4H4v16h5m5-12 4 4-4 4M8 12h10"/></svg>`;
const ENTER_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15 4h5v16h-5M9 8l4 4-4 4M4 12h9"/></svg>`;

function loginHref() {
  return `login.html?next=${encodeURIComponent("conta.html")}`;
}

function setHeroAvatar(url, fallbackText) {
  const wrap = document.querySelector("[data-account-avatar]");
  if (!wrap) return;
  const fallback = wrap.querySelector("[data-avatar-fallback]");
  const src = String(url || "").trim();
  let img = wrap.querySelector(".account-avatar-image");
  if (!src) {
    img?.remove();
    if (fallback) {
      fallback.removeAttribute("hidden");
      if (fallbackText) {
        fallback.textContent = fallbackText;
        fallback.classList.add("is-initial");
      }
    }
    return;
  }
  if (!img) {
    img = document.createElement("img");
    img.className = "account-avatar-image";
    img.alt = "";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    wrap.prepend(img);
  }
  img.src = src;
  fallback?.setAttribute("hidden", "");
  img.addEventListener("error", () => {
    img.remove();
    fallback?.removeAttribute("hidden");
  }, { once: true });
}

function menuRow({ href, action, icon, title, detail, danger = false }) {
  const chevron = `<span class="account-menu-chevron" aria-hidden="true"></span>`;
  const body = `
    <span class="account-menu-icon" aria-hidden="true">${icon}</span>
    <span class="account-menu-text">
      <strong>${title}</strong>
      <span>${detail}</span>
    </span>
    ${chevron}`;
  if (href) {
    return `<li><a class="account-menu-row${danger ? " is-danger" : ""}" href="${href}">${body}</a></li>`;
  }
  return `<li><button class="account-menu-row${danger ? " is-danger" : ""}" type="button" data-action="${action}">${body}</button></li>`;
}

function themeRow() {
  return `<li>
    <button class="account-menu-row" type="button" data-theme-toggle>
      <span class="account-menu-icon" aria-hidden="true">${THEME_ICON_SUN}${THEME_ICON_MOON}</span>
      <span class="account-menu-text">
        <strong class="theme-toggle-label">Modo noturno</strong>
        <span>Claro ou escuro na tela</span>
      </span>
      <span class="account-menu-chevron" aria-hidden="true"></span>
    </button>
  </li>`;
}

function renderAccountPage(user) {
  const title = document.querySelector("#account-title");
  const subtitle = document.querySelector("[data-account-subtitle]");
  const list = document.querySelector("[data-account-menu]");
  if (!list) return;

  const features = getFeatures();
  if (user) {
    const name = displayName(user);
    if (title) title.textContent = name;
    if (subtitle) subtitle.textContent = user.email || "Conta conectada neste aparelho.";
    const initial = Array.from(name)[0]?.toLocaleUpperCase("pt-BR") || "";
    setHeroAvatar("", initial);
    const rows = [];
    if (showFavorites(features)) {
      rows.push(menuRow({ href: "favoritos.html", icon: HEART_ICON, title: "Meus favoritos", detail: "Músicas salvas neste aparelho" }));
    }
    if (publicAuthEnabled()) {
      rows.push(menuRow({ href: "login.html#conta", icon: USER_ICON, title: "Minha conta", detail: "Perfil, dados e privacidade" }));
    }
    if (showThemeToggle(features)) rows.push(themeRow());
    rows.push(menuRow({ action: "signout", icon: EXIT_ICON, title: "Sair", detail: "Desconectar deste aparelho", danger: true }));
    list.innerHTML = rows.join("");
    list.querySelector('[data-action="signout"]')?.addEventListener("click", async () => {
      await signOut();
      renderAccountPage(null);
    });
    const quick = providerAvatarUrl(user);
    if (quick) setHeroAvatar(quick, initial);
    void getMyProfile()
      .then((profile) => {
        const url = String(profile?.avatar_url || quick || "").trim();
        if (url) setHeroAvatar(url, initial);
      })
      .catch(() => {});
  } else {
    if (title) title.textContent = "Conta";
    if (subtitle) subtitle.textContent = "Entre para sincronizar favoritos e perfil entre aparelhos.";
    setHeroAvatar("", "");
    const fallback = document.querySelector("[data-account-avatar] [data-avatar-fallback]");
    if (fallback) {
      fallback.classList.remove("is-initial");
      fallback.innerHTML = USER_ICON;
      fallback.removeAttribute("hidden");
    }
    const rows = [];
    if (publicAuthEnabled()) {
      rows.push(menuRow({ href: loginHref(), icon: ENTER_ICON, title: "Entrar", detail: "Acesse sua conta no bar" }));
    }
    if (showThemeToggle(features)) rows.push(themeRow());
    list.innerHTML = rows.join("");
    const login = list.querySelector('a[href^="login.html"]');
    login?.addEventListener("click", () => { login.href = loginHref(); });
  }

  initializeTheme();
}

async function bootAccountPage() {
  await loadSiteFeatures();
  renderAccountPage(null);
  if (!authBackendReady || !hasStoredAuthSession()) return;
  try {
    const user = await getCurrentUser();
    if (user) renderAccountPage(user);
    await onAuthChange(async (event) => {
      if (event === "SIGNED_OUT") renderAccountPage(null);
      else if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        renderAccountPage(await getCurrentUser());
      }
    });
  } catch {
    /* signed-out menu stays usable when auth is unreachable */
  }
}

initializeTheme();
hideExpiredEventNav();
setFooterYear();
initializeIsland();
void initializeAccountMenu();
void bootAccountPage();
