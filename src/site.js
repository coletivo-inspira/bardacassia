import "./styles.css";
import { authBackendReady, displayName, getCurrentUser, onAuthChange } from "./integrations/auth.js";
import { loadSiteFeatures } from "./integrations/features.js";
import { getMyProfile } from "./integrations/profile.js";
import { hasStoredAuthSession } from "./integrations/supabase.js";
import { providerAvatarUrl } from "./lib/profile.js";
import { getFeatures } from "./lib/feature-state.js";
import { showNavHref, showPageFile, showThemeToggle } from "./lib/features.js";

export { applyTheme, initializeTheme, toggleTheme } from "./lib/theme.js";

const USER_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.2c1.3-3.6 4.2-5.4 7.5-5.4s6.2 1.8 7.5 5.4"/></svg>`;

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

/** Like the island Conta tab, the desktop header button goes straight to conta.html (Entrar, tema e Sair live there). */
function renderHeaderAccountLink(user) {
  const headerSlot = document.querySelector("#header-account");
  if (!headerSlot) return null;
  const name = user ? displayName(user) : "";
  const link = document.createElement("a");
  link.className = "theme-toggle header-account";
  link.href = "conta.html";
  link.setAttribute("aria-label", user ? `Conta de ${name}` : "Conta");
  if (pageSlug() === "conta") link.setAttribute("aria-current", "page");
  link.innerHTML = `${USER_ICON}<span class="theme-toggle-label"></span>`;
  link.querySelector(".theme-toggle-label").textContent = user ? name.split(/\s+/)[0] : "Conta";
  headerSlot.replaceChildren(link);
  return link;
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

function renderAccountLinks(user) {
  const avatarButtons = [renderHeaderAccountLink(user), renderIslandAccountLink(user)].filter(Boolean);
  // Re-measure the Conta pill after the island trigger is swapped in.
  const island = document.querySelector(".glass-island");
  if (island?.classList.contains("has-active")) {
    const active = island.querySelector(":scope > [data-mobile-tab].is-active");
    syncIslandCapsule(island, active);
  }
  if (user) void loadAccountAvatars(avatarButtons, user);
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
  if (authBackendReady && hasStoredAuthSession()) {
    try {
      user = await getCurrentUser();
    } catch {
      user = null;
    }
  }
  renderAccountLinks(user);
  if (!authBackendReady || !user) return;
  try {
    await onAuthChange(async (event) => {
      if (event === "SIGNED_OUT") renderAccountLinks(null);
      else if (event === "SIGNED_IN" || event === "USER_UPDATED") renderAccountLinks(await getCurrentUser());
    });
  } catch {
    /* the signed-out Conta link keeps working when Supabase is unreachable */
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

/** The catalog top bar (logo + search) shares the island's compact state so the chrome moves as one. */
function compactCompanions() {
  const bar = document.querySelector(".header-search")?.closest(".site-header");
  return bar ? [bar] : [];
}

function watchIslandCompact(island) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const companions = compactCompanions();
  const setCompact = (compact) => {
    island.classList.toggle("is-compact", compact);
    companions.forEach((el) => el.classList.toggle("is-compact", compact));
  };
  let lastY = Math.max(0, window.scrollY);
  let idle = 0;
  let holdUntil = 0;
  const remasure = () => {
    const active = island.querySelector(":scope > [data-mobile-tab].is-active");
    syncIslandCapsule(island, active);
  };
  const expand = () => {
    setCompact(false);
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
    setCompact(nextCompact);
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
