import "./styles.css";
import { authConfigured, displayName, getCurrentUser, onAuthChange, signOut } from "./integrations/auth.js";
import { getMyProfile } from "./integrations/profile.js";
import { hasStoredAuthSession } from "./integrations/supabase.js";
import { providerAvatarUrl } from "./lib/profile.js";
import { initializeTheme } from "./lib/theme.js";

export { applyTheme, initializeTheme, toggleTheme } from "./lib/theme.js";

const THEME_ICON_SUN = `<svg class="theme-icon-sun" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;
const THEME_ICON_MOON = `<svg class="theme-icon-moon" aria-hidden="true" viewBox="0 0 24 24"><path d="M20.2 15.1A8.4 8.4 0 0 1 8.9 3.8 8.5 8.5 0 1 0 20.2 15.1Z"/></svg>`;
const USER_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.2c1.3-3.6 4.2-5.4 7.5-5.4s6.2 1.8 7.5 5.4"/></svg>`;
const HEART_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20S4 15 4 9a4 4 0 0 1 8-2 4 4 0 0 1 8 2c0 6-8 11-8 11Z"/></svg>`;
const EXIT_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 4H4v16h5m5-12 4 4-4 4M8 12h10"/></svg>`;
const ENTER_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15 4h5v16h-5M9 8l4 4-4 4M4 12h9"/></svg>`;
const THEME_MENU_ITEM = `
      <button role="menuitem" type="button" data-action="theme" data-theme-toggle>
        ${THEME_ICON_SUN}${THEME_ICON_MOON}
        <span class="theme-toggle-label"></span>
      </button>`;

function currentPagePath() {
  const page = location.pathname.split("/").pop() || "index.html";
  return page === "login.html" ? "index.html" : `${page}${location.hash}`;
}

function loginHref() {
  return `login.html?next=${encodeURIComponent(currentPagePath())}`;
}

function islandAccountSlot() {
  return document.querySelector(".glass-island [data-island-account]");
}

function setAccountAvatar(button, url) {
  const src = String(url || "").trim();
  if (!button || !src) return;
  const fallback = button.querySelector("[data-avatar-fallback]") || button.querySelector("svg");
  const className = button.dataset.avatarClass || "header-account-avatar";
  let img = button.querySelector(`.${className}`);
  if (img?.dataset.src === src) {
    fallback?.setAttribute("hidden", "");
    return;
  }
  if (!img) {
    img = document.createElement("img");
    img.className = className;
    img.alt = "";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    button.prepend(img);
  }
  img.dataset.src = src;
  img.src = src;
  fallback?.setAttribute("hidden", "");
  img.addEventListener("error", () => {
    img.remove();
    fallback?.removeAttribute("hidden");
  }, { once: true });
}

async function loadAccountAvatars(buttons, user) {
  const quick = providerAvatarUrl(user);
  if (quick) buttons.forEach((button) => setAccountAvatar(button, quick));
  try {
    const profile = await getMyProfile();
    const url = String(profile?.avatar_url || quick || "").trim();
    if (url) buttons.forEach((button) => setAccountAvatar(button, url));
  } catch {
    /* keep silhouette, initial or provider picture */
  }
}

let menusAbort = null;

/** Header and island share one dropdown; signed out it only offers Entrar and the theme. */
function buildMenu({ id, wrapperClass, triggerClass, trigger, label, items, signal }) {
  const wrapper = document.createElement("div");
  wrapper.className = `header-account-menu ${wrapperClass}`.trim();
  wrapper.innerHTML = `
    <button class="${triggerClass}" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="${id}">
      ${trigger}
    </button>
    <div id="${id}" role="menu" hidden>${items}
    </div>`;
  const button = wrapper.querySelector("button[aria-haspopup]");
  const menu = wrapper.querySelector("[role=menu]");
  button.setAttribute("aria-label", label);
  const setOpen = (open) => {
    menu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) {
      wrapper.closest(".glass-island")?.classList.remove("is-compact");
      menu.querySelector("[role=menuitem]")?.focus();
    }
  };
  button.addEventListener("click", () => setOpen(menu.hidden));
  wrapper.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) { setOpen(false); button.focus(); }
  });
  document.addEventListener("click", (event) => { if (!wrapper.contains(event.target)) setOpen(false); }, { signal });
  return { wrapper, button };
}

const SIGNED_OUT_ITEMS = `
      <a role="menuitem" class="account-menu-login" href="login.html" data-action="login">${ENTER_ICON}<span>Entrar</span></a>${THEME_MENU_ITEM}`;

const SIGNED_IN_ITEMS = `
      <div class="header-account-email"></div>
      <a role="menuitem" href="favoritos.html">${HEART_ICON}<span>Meus favoritos</span></a>
      <a role="menuitem" href="login.html#conta">${USER_ICON}<span>Minha conta</span></a>${THEME_MENU_ITEM}
      <button role="menuitem" type="button" data-action="signout">${EXIT_ICON}<span>Sair</span></button>`;

function renderAccountMenus(user) {
  menusAbort?.abort();
  menusAbort = new AbortController();
  const { signal } = menusAbort;
  const name = user ? displayName(user) : "";
  const items = user ? SIGNED_IN_ITEMS : SIGNED_OUT_ITEMS;
  const label = user ? `Conta de ${name}` : "Entrar ou trocar o tema";
  const menus = [];

  const headerSlot = document.querySelector("#header-account");
  if (headerSlot) {
    const header = buildMenu({
      id: "header-account-list",
      wrapperClass: "",
      triggerClass: "theme-toggle header-account",
      trigger: `${USER_ICON}<span class="theme-toggle-label"></span>`,
      label,
      items,
      signal,
    });
    header.button.querySelector(".theme-toggle-label").textContent = user ? name.split(/\s+/)[0] : "Entrar";
    headerSlot.replaceChildren(header.wrapper);
    menus.push(header);
  }

  const islandSlot = islandAccountSlot();
  if (islandSlot) {
    const island = buildMenu({
      id: "island-account-list",
      wrapperClass: "island-account-menu",
      triggerClass: "mobile-tab island-account-trigger",
      trigger: user ? `<span class="island-account-initial" data-avatar-fallback aria-hidden="true"></span>` : USER_ICON,
      label,
      items,
      signal,
    });
    if (user) {
      island.button.querySelector(".island-account-initial").textContent = Array.from(name)[0]?.toLocaleUpperCase("pt-BR") || "";
      island.button.dataset.avatarClass = "island-account-avatar";
    }
    islandSlot.replaceChildren(island.wrapper);
    menus.push(island);
  }

  for (const { wrapper } of menus) {
    const email = wrapper.querySelector(".header-account-email");
    if (email) email.textContent = user.email || name;
    const login = wrapper.querySelector("[data-action=login]");
    if (login) {
      login.href = loginHref();
      // Hash routes change after load, so refresh ?next= right before leaving for login.
      login.addEventListener("click", () => { login.href = loginHref(); });
    }
    wrapper.querySelector("[data-action=signout]")?.addEventListener("click", async () => {
      await signOut();
      renderAccountMenus(null);
    });
  }

  if (user) void loadAccountAvatars(menus.map((menu) => menu.button), user);
  // Theme items are [data-theme-toggle]; initializeTheme gives each its only click listener.
  initializeTheme();
}

export async function initializeAccountMenu() {
  if (!document.querySelector("#header-account")) return;
  // Signed-out menu first; login.html explains when Auth is off.
  renderAccountMenus(null);
  if (!authConfigured) return;
  if (!hasStoredAuthSession()) return;
  try {
    const user = await getCurrentUser();
    if (user) renderAccountMenus(user);
    await onAuthChange(async (event) => {
      if (event === "SIGNED_OUT") renderAccountMenus(null);
      else if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        renderAccountMenus(await getCurrentUser());
      }
    });
  } catch {
    /* the signed-out menu keeps Entrar working when Supabase is unreachable */
  }
}

const ISLAND_PAGE_TABS = { "o-bar": "o-bar", evento: "inicio", favoritos: "conta" };
const ISLAND_SCROLL_THRESHOLD = 12;
const ISLAND_IDLE_MS = 650;
const ISLAND_TAP_HOLD_MS = 1000;

function pageSlug() {
  return (location.pathname.split("/").pop() || "index.html").replace(/\.html$/, "") || "index";
}

/**
 * Marks the island tab and slides the glass capsule behind it. `current: false`
 * highlights a tab without claiming aria-current (e.g. Início while on evento).
 */
export function setIslandTab(name, { current = true } = {}) {
  const island = document.querySelector(".glass-island");
  if (!island) return;
  const slots = [...island.querySelectorAll(":scope > [data-mobile-tab]")];
  const index = slots.findIndex((slot) => slot.dataset.mobileTab === name);
  slots.forEach((slot, i) => {
    const on = i === index;
    slot.classList.toggle("is-active", on);
    if (on && current) slot.setAttribute("aria-current", "page");
    else slot.removeAttribute("aria-current");
  });
  island.style.setProperty("--island-active", String(Math.max(index, 0)));
  island.classList.toggle("has-active", index >= 0);
}

function watchIslandCompact(island) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let lastY = Math.max(0, window.scrollY);
  let idle = 0;
  let holdUntil = 0;
  const expand = () => island.classList.remove("is-compact");
  // A tab tap smooth-scrolls to its section; that scroll should not shrink the island under the finger.
  island.addEventListener("click", () => {
    holdUntil = performance.now() + ISLAND_TAP_HOLD_MS;
    expand();
  });
  window.addEventListener("scroll", () => {
    clearTimeout(idle);
    idle = setTimeout(expand, ISLAND_IDLE_MS);
    const y = Math.max(0, window.scrollY);
    if (performance.now() < holdUntil) {
      lastY = y;
      return;
    }
    const delta = y - lastY;
    if (Math.abs(delta) < ISLAND_SCROLL_THRESHOLD) return;
    lastY = y;
    const menuOpen = Boolean(island.querySelector('[aria-expanded="true"]'));
    island.classList.toggle("is-compact", delta > 0 && y > 48 && !menuOpen && !reducedMotion.matches);
  }, { passive: true });
}

/** Floating tab island on phones and tablets: page-based active tab and compact-on-scroll. */
export function initializeIsland() {
  const island = document.querySelector(".glass-island");
  if (!island) return;
  const slug = pageSlug();
  const tab = ISLAND_PAGE_TABS[slug];
  if (tab) setIslandTab(tab, { current: tab === slug });
  watchIslandCompact(island);
  // Enable the capsule slide only after the first position is painted.
  requestAnimationFrame(() => requestAnimationFrame(() => island.classList.add("is-ready")));
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
