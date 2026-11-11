import "./styles.css";
import { authBackendReady, displayName, getCurrentUser, onAuthChange, publicAuthEnabled, signOut } from "./integrations/auth.js";
import { loadSiteFeatures } from "./integrations/features.js";
import { getMyProfile, getMyRole } from "./integrations/profile.js";
import { hasStoredAuthSession } from "./integrations/supabase.js";
import { providerAvatarUrl } from "./lib/profile.js";
import { getFeatures } from "./lib/feature-state.js";
import { showFavorites, showNavHref, showPageFile, showThemeToggle } from "./lib/features.js";
import { initializeTheme } from "./lib/theme.js";

export { applyTheme, initializeTheme, toggleTheme } from "./lib/theme.js";

const THEME_ICON_SUN = `<svg class="theme-icon-sun" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;
const THEME_ICON_MOON = `<svg class="theme-icon-moon" aria-hidden="true" viewBox="0 0 24 24"><path d="M20.2 15.1A8.4 8.4 0 0 1 8.9 3.8 8.5 8.5 0 1 0 20.2 15.1Z"/></svg>`;
const USER_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.2c1.3-3.6 4.2-5.4 7.5-5.4s6.2 1.8 7.5 5.4"/></svg>`;
const HEART_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20S4 15 4 9a4 4 0 0 1 8-2 4 4 0 0 1 8 2c0 6-8 11-8 11Z"/></svg>`;
const EXIT_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 4H4v16h5m5-12 4 4-4 4M8 12h10"/></svg>`;
const ENTER_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15 4h5v16h-5M9 8l4 4-4 4M4 12h9"/></svg>`;
const BAR_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4.5 4.5h15L12 12.8z"/><path d="M12 12.8v6.7M8 19.5h8M15.5 8.6l2.3-4.1"/></svg>`;
const ADMIN_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10"/></svg>`;
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

/** Desktop header keeps a compact dropdown; the island Conta tab opens conta.html. */
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
    if (open) menu.querySelector("[role=menuitem]")?.focus();
  };
  button.addEventListener("click", () => setOpen(menu.hidden));
  wrapper.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) { setOpen(false); button.focus(); }
  });
  document.addEventListener("click", (event) => { if (!wrapper.contains(event.target)) setOpen(false); }, { signal });
  return { wrapper, button };
}

const SIGNED_OUT_ITEMS = `
      <a role="menuitem" class="account-menu-login" href="login.html" data-action="login">${ENTER_ICON}<span>Entrar</span></a>
      <a role="menuitem" href="conta.html">${USER_ICON}<span>Conta</span></a>
      <a role="menuitem" href="o-bar.html">${BAR_ICON}<span>O bar</span></a>${THEME_MENU_ITEM}`;

const SIGNED_IN_ITEMS = `
      <div class="header-account-email"></div>
      <a role="menuitem" href="conta.html">${USER_ICON}<span>Conta</span></a>
      <a role="menuitem" href="favoritos.html">${HEART_ICON}<span>Meus favoritos</span></a>
      <a role="menuitem" href="login.html#conta">${USER_ICON}<span>Minha conta</span></a>
      <a role="menuitem" href="o-bar.html">${BAR_ICON}<span>O bar</span></a>${THEME_MENU_ITEM}
      <button role="menuitem" type="button" data-action="signout">${EXIT_ICON}<span>Sair</span></button>`;

function accountMenuItems(user, { admin = false } = {}) {
  const features = getFeatures();
  const theme = showThemeToggle(features) ? THEME_MENU_ITEM : "";
  const adminLink = admin
    ? `\n      <a role="menuitem" href="admin.html">${ADMIN_ICON}<span>Painel admin</span></a>`
    : "";
  const conta = `\n      <a role="menuitem" href="conta.html">${USER_ICON}<span>Conta</span></a>`;
  const oBar = `\n      <a role="menuitem" href="o-bar.html">${BAR_ICON}<span>O bar</span></a>`;
  if (!user) {
    if (publicAuthEnabled() && showThemeToggle(features)) {
      return { items: SIGNED_OUT_ITEMS, label: "Entrar ou trocar o tema" };
    }
    const login = publicAuthEnabled()
      ? `\n      <a role="menuitem" class="account-menu-login" href="login.html" data-action="login">${ENTER_ICON}<span>Entrar</span></a>`
      : "";
    return { items: `${login}${conta}${oBar}${theme}`, label: publicAuthEnabled() ? "Entrar ou trocar o tema" : "Conta" };
  }
  if (showFavorites(features) && publicAuthEnabled() && showThemeToggle(features)) {
    const signout = `\n      <button role="menuitem" type="button" data-action="signout">`;
    return {
      items: SIGNED_IN_ITEMS.replace(signout, `${adminLink}${signout}`),
      label: `Conta de ${displayName(user)}`,
    };
  }
  const favorites = showFavorites(features)
    ? `\n      <a role="menuitem" href="favoritos.html">${HEART_ICON}<span>Meus favoritos</span></a>`
    : "";
  const account = publicAuthEnabled()
    ? `\n      <a role="menuitem" href="login.html#conta">${USER_ICON}<span>Minha conta</span></a>`
    : "";
  return {
    items: `
      <div class="header-account-email"></div>${conta}${favorites}${account}${oBar}${adminLink}${theme}
      <button role="menuitem" type="button" data-action="signout">${EXIT_ICON}<span>Sair</span></button>`,
    label: `Conta de ${displayName(user)}`,
  };
}

function renderIslandAccountLink(user) {
  const islandSlot = islandAccountSlot();
  if (!islandSlot) return null;
  const name = user ? displayName(user) : "";
  const label = user ? `Conta de ${name}` : "Conta";
  const onAccountPage = pageSlug() === "conta";
  const trigger = user
    ? `<span class="island-account-initial" data-avatar-fallback aria-hidden="true"></span>`
    : USER_ICON;
  islandSlot.innerHTML = `
    <a class="mobile-tab island-account-trigger" href="conta.html" aria-label="${label}"${onAccountPage ? ' aria-current="page"' : ""}>
      ${trigger}
      <span class="mobile-tab-label">Conta</span>
    </a>`;
  const link = islandSlot.querySelector(".island-account-trigger");
  if (user) {
    link.querySelector(".island-account-initial").textContent = Array.from(name)[0]?.toLocaleUpperCase("pt-BR") || "";
    link.dataset.avatarClass = "island-account-avatar";
  }
  return link;
}

function renderAccountMenus(user, { admin = false } = {}) {
  menusAbort?.abort();
  menusAbort = new AbortController();
  const { signal } = menusAbort;
  const name = user ? displayName(user) : "";
  const built = accountMenuItems(user, { admin });
  if (!user && !built.items.trim()) {
    document.querySelector("#header-account")?.replaceChildren();
    islandAccountSlot()?.replaceChildren();
    return;
  }
  const { items, label } = built;
  const avatarButtons = [];

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
    header.button.querySelector(".theme-toggle-label").textContent = user
      ? name.split(/\s+/)[0]
      : (publicAuthEnabled() ? "Entrar" : "Tema");
    headerSlot.replaceChildren(header.wrapper);
    const email = header.wrapper.querySelector(".header-account-email");
    if (email) email.textContent = user?.email || name;
    const login = header.wrapper.querySelector("[data-action=login]");
    if (login) {
      login.href = loginHref();
      // Hash routes change after load, so refresh ?next= right before leaving for login.
      login.addEventListener("click", () => { login.href = loginHref(); });
    }
    header.wrapper.querySelector("[data-action=signout]")?.addEventListener("click", async () => {
      await signOut();
      renderAccountMenus(null, { admin: false });
    });
    avatarButtons.push(header.button);
  }

  const islandLink = renderIslandAccountLink(user);
  if (islandLink) avatarButtons.push(islandLink);
  // Re-measure the Conta pill after the island trigger is swapped in.
  const island = document.querySelector(".glass-island");
  if (island?.classList.contains("has-active")) {
    const active = island.querySelector(":scope > [data-mobile-tab].is-active");
    syncIslandCapsule(island, active);
  }

  if (user) void loadAccountAvatars(avatarButtons, user);
  // Theme items are [data-theme-toggle]; initializeTheme gives each its only click listener.
  initializeTheme();
}

const BLOCKED_PAGES = {
  "evento.html": "page_evento",
  "o-bar.html": "page_o_bar",
  "cartaz.html": "page_cartaz",
  "favoritos.html": "favorites",
};

function currentPageFile() {
  return (location.pathname.split("/").pop() || "index.html") || "index.html";
}

/** Esconde links, o tema e a página atual quando o interruptor correspondente está desligado. */
export function applyFeatureChrome() {
  const features = getFeatures();
  document.querySelectorAll("a[href]").forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (!showNavHref(features, href)) link.hidden = true;
  });
  if (!showThemeToggle(features)) {
    document.querySelectorAll("[data-theme-toggle], #theme-toggle").forEach((el) => { el.hidden = true; });
  }
  const island = document.querySelector(".glass-island");
  if (island) {
    const active = [...island.querySelectorAll(":scope > [data-mobile-tab]")]
      .find((slot) => !slot.hidden && slot.classList.contains("is-active"));
    requestAnimationFrame(() => syncIslandCapsule(island, active || null));
  }
  const page = currentPageFile();
  const blocked = BLOCKED_PAGES[page] && !showPageFile(features, page);
  if (!blocked) return true;
  document.querySelector("#poster-controls")?.setAttribute("hidden", "");
  const main = document.querySelector("main");
  if (main && !main.dataset.featureBlocked) {
    main.dataset.featureBlocked = "1";
    main.replaceChildren();
    const note = document.createElement("p");
    note.textContent = "Esta página está desligada no momento.";
    const back = document.createElement("p");
    const link = document.createElement("a");
    link.href = "index.html";
    link.textContent = "Voltar ao catálogo";
    back.append(link);
    main.append(note, back);
  }
  return false;
}

export async function initializeAccountMenu() {
  if (!document.querySelector("#header-account") && !islandAccountSlot()) return;
  await loadSiteFeatures();
  applyFeatureChrome();
  let user = null;
  let admin = false;
  if (authBackendReady && hasStoredAuthSession()) {
    try {
      user = await getCurrentUser();
      if (user) admin = (await getMyRole()) === "admin";
    } catch {
      user = null;
    }
  }
  renderAccountMenus(user, { admin });
  if (!authBackendReady || !user) return;
  try {
    await onAuthChange(async (event) => {
      if (event === "SIGNED_OUT") renderAccountMenus(null, { admin: false });
      else if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        const next = await getCurrentUser();
        const role = next ? await getMyRole() : null;
        renderAccountMenus(next, { admin: role === "admin" });
      }
    });
  } catch {
    /* the signed-out menu keeps Entrar working when Supabase is unreachable */
  }
}

const ISLAND_PAGE_TABS = { "o-bar": "conta", evento: "inicio", favoritos: "conta", conta: "conta" };
const ISLAND_SCROLL_THRESHOLD = 12;
const ISLAND_IDLE_MS = 650;
const ISLAND_TAP_HOLD_MS = 1000;

function pageSlug() {
  return (location.pathname.split("/").pop() || "index.html").replace(/\.html$/, "") || "index";
}

function syncIslandCapsule(island, activeSlot) {
  if (!island) return;
  if (!activeSlot) {
    island.classList.remove("has-active");
    return;
  }
  const pad = Number.parseFloat(getComputedStyle(island).getPropertyValue("--island-pad")) || 6;
  const islandRect = island.getBoundingClientRect();
  const slotRect = activeSlot.getBoundingClientRect();
  const x = Math.max(0, slotRect.left - islandRect.left - pad);
  const width = Math.max(0, slotRect.width);
  island.style.setProperty("--island-capsule-x", `${x}px`);
  island.style.setProperty("--island-capsule-w", `${width}px`);
  island.classList.add("has-active");
}

/**
 * Marks the island tab and slides the glass capsule behind it. `current: false`
 * highlights a tab without claiming aria-current (e.g. Início while on evento).
 */
export function setIslandTab(name, { current = true } = {}) {
  const island = document.querySelector(".glass-island");
  if (!island) return;
  const slots = [...island.querySelectorAll(":scope > [data-mobile-tab]")].filter((slot) => !slot.hidden);
  const index = slots.findIndex((slot) => slot.dataset.mobileTab === name);
  slots.forEach((slot, i) => {
    const on = i === index;
    slot.classList.toggle("is-active", on);
    if (on && current) slot.setAttribute("aria-current", "page");
    else slot.removeAttribute("aria-current");
  });
  const active = index >= 0 ? slots[index] : null;
  // Wait a frame so flex-grow / label reveal settle before measuring the pill.
  requestAnimationFrame(() => syncIslandCapsule(island, active));
}

function watchIslandCompact(island) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let lastY = Math.max(0, window.scrollY);
  let idle = 0;
  let holdUntil = 0;
  const remasure = () => {
    const active = island.querySelector(":scope > [data-mobile-tab].is-active");
    syncIslandCapsule(island, active);
  };
  const expand = () => {
    island.classList.remove("is-compact");
    requestAnimationFrame(remasure);
  };
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
    const nextCompact = delta > 0 && y > 48 && !reducedMotion.matches;
    if (island.classList.contains("is-compact") === nextCompact) return;
    island.classList.toggle("is-compact", nextCompact);
    requestAnimationFrame(remasure);
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
  window.addEventListener("resize", () => {
    const active = island.querySelector(":scope > [data-mobile-tab].is-active");
    syncIslandCapsule(island, active);
  }, { passive: true });
  // Enable the capsule slide only after the first position is painted.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    island.classList.add("is-ready");
    const active = island.querySelector(":scope > [data-mobile-tab].is-active");
    syncIslandCapsule(island, active);
  }));
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
