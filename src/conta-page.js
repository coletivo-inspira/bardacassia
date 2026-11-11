import { createAccountEditor } from "./account-editor.js";
import { authBackendReady, displayName, getCurrentUser, onAuthChange, publicAuthEnabled, signOut } from "./integrations/auth.js";
import { loadSiteFeatures } from "./integrations/features.js";
import { getMyRole } from "./integrations/profile.js";
import { fetchMyRequests, requestMode, requestsConfigured } from "./integrations/requests.js";
import { hasStoredAuthSession } from "./integrations/supabase.js";
import { getFeatures } from "./lib/feature-state.js";
import { allCodes, loadFavoritesState } from "./lib/favorites.js";
import { showFavorites, showManagerPanel, showPageFile, showStaffPanel, showThemeToggle } from "./lib/features.js";
import { providerAvatarUrl } from "./lib/profile.js";
import { REQUESTS_HASH, activeRequestCount } from "./lib/requests.js";
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
const BAR_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4.5 4.5h15L12 12.8z"/><path d="M12 12.8v6.7M8 19.5h8M15.5 8.6l2.3-4.1"/></svg>`;
const ADMIN_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10"/></svg>`;
const STAFF_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 19V7.5L12 4l8 3.5V19"/><path d="M9 19v-6h6v6"/><path d="M4 10.5h16"/></svg>`;
const MANAGER_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 19V5h16v14"/><path d="M8 19v-6h3v6M13 19v-9h3v9"/><path d="M4 9h16"/></svg>`;
const POSTER_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>`;
const EVENT_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M8 3.5v3M16 3.5v3M3.5 10h17"/></svg>`;
const HOME_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3.5 10.5 12 3.8l8.5 6.7v9.2a.8.8 0 0 1-.8.8H15v-6H9v6H4.3a.8.8 0 0 1-.8-.8z"/></svg>`;
const REQUESTS_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 18V5.5l11-2.2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/></svg>`;

/** Active requests, fetched once per visit; null until known. */
let requestsCount = null;

const ROLE_LABELS = {
  cliente: "Cliente",
  garcom: "Garçom",
  dono: "Dono",
  admin: "Administrador",
};

/** conta.html#perfil opens the hero editor; the login page's old Minha conta links redirect here. */
const PROFILE_HASH = "#perfil";
/** login.html#nova-senha comes back with ?senha=salva once the new senha is stored. */
const PASSWORD_SAVED_PARAM = "senha";

let editor = null;
let currentUser = null;
/** Shown in the editor once the signed-in render runs (the boot-time signed-out render clears it). */
let pendingEditorStatus = null;

function isProfileHash() {
  return location.hash.toLowerCase() === PROFILE_HASH;
}

function loginHref() {
  return `login.html?next=${encodeURIComponent(`conta.html${isProfileHash() ? PROFILE_HASH : ""}`)}`;
}

function setPageStatus(message, tone = "info") {
  const status = document.querySelector("#conta-status");
  if (!status) return;
  status.hidden = !message;
  status.textContent = message || "";
  status.dataset.tone = tone;
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

/** `count` adds the amber badge the catalog buttons used to carry; `countKey` lets it be filled in later. */
function menuRow({ href, action, icon, title, detail, danger = false, count, countKey }) {
  const chevron = `<span class="account-menu-chevron" aria-hidden="true"></span>`;
  const badge = count !== undefined
    ? `<span class="favorite-count account-menu-count"${countKey ? ` data-count="${countKey}"` : ""}${count ? "" : " hidden"}>${count ? count.toLocaleString("pt-BR") : ""}</span>`
    : "";
  const body = `
    <span class="account-menu-icon" aria-hidden="true">${icon}</span>
    <span class="account-menu-text">
      <strong>${title}</strong>
      <span>${detail}</span>
    </span>
    ${badge}${chevron}`;
  if (href) {
    return `<li><a class="account-menu-row${danger ? " is-danger" : ""}" href="${href}">${body}</a></li>`;
  }
  return `<li><button class="account-menu-row${danger ? " is-danger" : ""}" type="button" data-action="${action}">${body}</button></li>`;
}

function favoritesCount() {
  return allCodes(loadFavoritesState()).size;
}

/** The QR flow keeps nothing on the customer's phone, so only the remote mode has a Meus pedidos list. */
function showMyRequests() {
  return requestsConfigured() && requestMode() === "remoto";
}

/** Meus favoritos and Meus pedidos left the catalog for this menu; both work without logging in. */
function songListRows(features) {
  const rows = [];
  if (showFavorites(features)) {
    rows.push(menuRow({
      href: "favoritos.html",
      icon: HEART_ICON,
      title: "Meus favoritos",
      detail: "Músicas salvas neste aparelho",
      count: favoritesCount(),
    }));
  }
  if (showMyRequests()) {
    rows.push(menuRow({
      href: `index.html${REQUESTS_HASH}`,
      icon: REQUESTS_ICON,
      title: "Meus pedidos",
      detail: "Suas músicas pedidas hoje e a fila",
      count: requestsCount ?? 0,
      countKey: "requests",
    }));
  }
  return rows;
}

function paintRequestsCount() {
  document.querySelectorAll('[data-count="requests"]').forEach((badge) => {
    badge.textContent = requestsCount ? requestsCount.toLocaleString("pt-BR") : "";
    badge.hidden = !requestsCount;
  });
}

/** Without a stored session there is nothing to count, and asking would create an anonymous one. */
async function loadRequestsCount() {
  if (!showMyRequests() || !hasStoredAuthSession()) return;
  try {
    requestsCount = activeRequestCount(await fetchMyRequests());
    paintRequestsCount();
  } catch {
    /* the row still opens Meus pedidos, which shows its own error */
  }
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

/** Staff / admin routes that already exist in the product. */
function rolePanelRows(role, features) {
  const rows = [];
  const staff = showStaffPanel(features);
  const isAdmin = role === "admin";
  const isDono = role === "dono" || isAdmin;
  const isGarcom = role === "garcom" || isDono;

  if (isAdmin) {
    rows.push(menuRow({
      href: "admin.html",
      icon: ADMIN_ICON,
      title: "Painel do administrador",
      detail: "Interruptores, provedores e papéis",
    }));
  }
  if (isDono && showManagerPanel(features)) {
    rows.push(menuRow({
      href: "gerente.html",
      icon: MANAGER_ICON,
      title: "Painel do gerente",
      detail: "Fila da noite e movimento do período",
    }));
  }
  if (isGarcom && staff) {
    rows.push(menuRow({
      href: "garcom.html",
      icon: STAFF_ICON,
      title: "Painel do garçom",
      detail: "Fila, pagamento e rodada",
    }));
  }
  if ((isAdmin || isDono) && showPageFile(features, "cartaz.html")) {
    rows.push(menuRow({
      href: "cartaz.html",
      icon: POSTER_ICON,
      title: "Cartaz",
      detail: "QR do catálogo para impressão",
    }));
  }
  if (isAdmin && showPageFile(features, "evento.html")) {
    rows.push(menuRow({
      href: "evento.html",
      icon: EVENT_ICON,
      title: "Evento",
      detail: "Página especial do bar",
    }));
  }
  if (isAdmin) {
    rows.push(menuRow({
      href: "index.html",
      icon: HOME_ICON,
      title: "Catálogo",
      detail: "Busca e descoberta do site",
    }));
  }
  return rows;
}

/** Modo claro first, then the customer's own lists; staff panels render in their own section. */
function customerRows({ signedIn }) {
  const features = getFeatures();
  const rows = [];
  if (showThemeToggle(features)) rows.push(themeRow());
  if (!signedIn && publicAuthEnabled()) {
    rows.push(menuRow({ href: loginHref(), icon: ENTER_ICON, title: "Entrar", detail: "Acesse sua conta no bar" }));
  }
  rows.push(...songListRows(features));
  rows.push(menuRow({ href: "o-bar.html", icon: BAR_ICON, title: "O bar", detail: "Valores, endereço e horário" }));
  if (signedIn) {
    rows.push(menuRow({ action: "signout", icon: EXIT_ICON, title: "Sair", detail: "Desconectar deste aparelho", danger: true }));
  }
  return rows;
}

/** Management breadcrumbs link to conta.html#gestao. */
const STAFF_HASH = "#gestao";

function renderStaffPanel(role) {
  const panel = document.querySelector("[data-account-staff]");
  const list = document.querySelector("[data-account-staff-menu]");
  if (!panel || !list) return;
  const rows = role ? rolePanelRows(role, getFeatures()) : [];
  const wasHidden = panel.hidden;
  list.innerHTML = rows.join("");
  panel.hidden = rows.length === 0;
  // The panel only appears once the role loads, after the browser already tried to scroll to the hash.
  if (wasHidden && !panel.hidden && location.hash.toLowerCase() === STAFF_HASH) {
    panel.scrollIntoView({ block: "start" });
  }
}

function renderRole(role) {
  const line = document.querySelector("[data-account-role]");
  if (!line) return;
  line.hidden = !ROLE_LABELS[role];
  line.querySelector("strong").textContent = ROLE_LABELS[role] || "";
}

function setHeroExpanded(expanded, { syncHash = true } = {}) {
  const hero = document.querySelector(".account-hero");
  const toggle = document.querySelector("[data-account-hero-toggle]");
  const panel = document.querySelector("[data-account-details]");
  if (!hero || !toggle || !panel) return;
  const open = Boolean(expanded);
  hero.classList.toggle("is-expanded", open);
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Fechar perfil, dados e privacidade" : "Editar perfil, dados e privacidade");
  panel.hidden = !open;
  if (!syncHash || open === isProfileHash()) return;
  history.replaceState(history.state, "", `${location.pathname}${location.search}${open ? PROFILE_HASH : ""}`);
}

function bindHeroToggle(enabled) {
  const hero = document.querySelector(".account-hero");
  const toggle = document.querySelector("[data-account-hero-toggle]");
  const hint = document.querySelector("[data-account-hero-hint]");
  if (!hero || !toggle) return;
  toggle.disabled = !enabled;
  hero.classList.toggle("is-expandable", enabled);
  if (hint) hint.hidden = !enabled;
  if (!enabled) {
    setHeroExpanded(false, { syncHash: false });
    return;
  }
  if (toggle.dataset.bound === "1") return;
  toggle.dataset.bound = "1";
  toggle.addEventListener("click", () => {
    if (toggle.disabled) return;
    setHeroExpanded(toggle.getAttribute("aria-expanded") !== "true");
  });
}

function heroInitial(user) {
  return Array.from(displayName(user))[0]?.toLocaleUpperCase("pt-BR") || "";
}

function bindSignOut(list) {
  list.querySelector('[data-action="signout"]')?.addEventListener("click", () => {
    const run = async () => {
      await signOut();
      renderAccountPage(null);
    };
    if (editor) editor.confirmLeave(run);
    else void run();
  });
}

function renderAccountPage(user, { role = null } = {}) {
  const title = document.querySelector("#account-title");
  const subtitle = document.querySelector("[data-account-subtitle]");
  const list = document.querySelector("[data-account-menu]");
  if (!list) return;

  if (user) {
    const sameUser = currentUser?.id === user.id;
    currentUser = user;
    if (title) title.textContent = displayName(user);
    if (subtitle) subtitle.textContent = user.email || "Conta conectada neste aparelho.";
    if (!sameUser) setHeroAvatar(providerAvatarUrl(user), heroInitial(user));
    bindHeroToggle(Boolean(editor));
    // Auth events re-render the page; only a new visit or #perfil decides whether the editor is open.
    if (!sameUser) setHeroExpanded(Boolean(editor) && isProfileHash(), { syncHash: false });
    list.innerHTML = customerRows({ signedIn: true }).join("");
    bindSignOut(list);
    renderStaffPanel(role);
    renderRole(role);
    if (pendingEditorStatus) {
      editor?.setStatus(pendingEditorStatus, "success", { reveal: true });
      pendingEditorStatus = null;
    }
    void editor?.load(user);
  } else {
    currentUser = null;
    editor?.clear();
    if (title) title.textContent = "Conta";
    if (subtitle) subtitle.textContent = "Entre para sincronizar favoritos e perfil entre aparelhos.";
    setHeroAvatar("", "");
    const fallback = document.querySelector("[data-account-avatar] [data-avatar-fallback]");
    if (fallback) {
      fallback.classList.remove("is-initial");
      fallback.innerHTML = USER_ICON;
      fallback.removeAttribute("hidden");
    }
    bindHeroToggle(false);
    list.innerHTML = customerRows({ signedIn: false }).join("");
    renderStaffPanel(null);
    renderRole(null);
    const login = list.querySelector('a[href^="login.html"]');
    login?.addEventListener("click", () => { login.href = loginHref(); });
  }

  initializeTheme();
}

function setupEditor() {
  editor = createAccountEditor({
    onProfile: (profile) => {
      if (currentUser) setHeroAvatar(String(profile?.avatar_url || providerAvatarUrl(currentUser) || "").trim(), heroInitial(currentUser));
    },
    onDeleted: () => {
      renderAccountPage(null);
      setPageStatus("Sua conta foi excluída.", "success");
    },
  });
  window.addEventListener("hashchange", () => {
    if (isProfileHash() && currentUser) setHeroExpanded(true, { syncHash: false });
  });
  const params = new URLSearchParams(location.search);
  if (params.get(PASSWORD_SAVED_PARAM) === "salva") {
    pendingEditorStatus = "Senha salva com sucesso.";
    params.delete(PASSWORD_SAVED_PARAM);
    history.replaceState(history.state, "", `${location.pathname}${params.size ? `?${params}` : ""}${location.hash}`);
  }
}

async function bootAccountPage() {
  await loadSiteFeatures();
  if (authBackendReady) setupEditor();
  renderAccountPage(null);
  void loadRequestsCount();
  if (!authBackendReady || !hasStoredAuthSession()) return;
  try {
    const user = await getCurrentUser();
    if (user) {
      const role = await getMyRole().catch(() => null);
      renderAccountPage(user, { role });
    }
    await onAuthChange(async (event) => {
      if (event === "SIGNED_OUT") renderAccountPage(null);
      else if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        const next = await getCurrentUser();
        const role = next ? await getMyRole().catch(() => null) : null;
        renderAccountPage(next, { role });
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
