import { displayName } from "./integrations/auth.js";
import { getMyProfile } from "./integrations/profile.js";
import { getFeatures } from "./lib/feature-state.js";
import {
  PANEL_RETURN_KEY, PANEL_SURFACE_KEY, firstName, panelLinksForRole, panelRoleLabel, resolvePanelReturn, returnPageName,
} from "./lib/panel-nav.js";
import { profileInitials, providerAvatarUrl } from "./lib/profile.js";

const ICONS = {
  user: `<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.2c1.3-3.6 4.2-5.4 7.5-5.4s6.2 1.8 7.5 5.4"/></svg>`,
  back: `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>`,
  admin: `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>`,
  gerente: `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>`,
  garcom: `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M8 12h8"/></svg>`,
  exit: `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H10M14 8l4 4-4 4M18 12H9"/></svg>`,
  moon: `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>`,
  sun: `<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>`,
  chevron: `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>`,
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function readStoredReturn() {
  try { return sessionStorage.getItem(PANEL_RETURN_KEY) || ""; } catch { return ""; }
}

function storeReturn(href) {
  try { sessionStorage.setItem(PANEL_RETURN_KEY, href); } catch { /* the link still falls back to the catalog */ }
}

function rememberReturn() {
  const href = resolvePanelReturn({ referrer: document.referrer, origin: location.origin, stored: readStoredReturn() });
  storeReturn(href);
  return href;
}

function avatarNode(initials, size) {
  const avatar = el("span", `panel-avatar panel-avatar--${size}`);
  avatar.append(el("span", "panel-avatar-initials", initials));
  avatar.firstChild.setAttribute("aria-hidden", "true");
  return avatar;
}

function setAvatarImage(avatars, url) {
  const src = String(url || "").trim();
  if (!src) return;
  for (const avatar of avatars) {
    let img = avatar.querySelector("img");
    if (img?.dataset.src === src) continue;
    img?.remove();
    img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.dataset.src = src;
    img.addEventListener("error", () => {
      img.remove();
      avatar.classList.remove("has-image");
    }, { once: true });
    img.src = src;
    avatar.prepend(img);
    avatar.classList.add("has-image");
  }
}

async function loadAvatar(avatars, user) {
  setAvatarImage(avatars, providerAvatarUrl(user));
  try {
    const profile = await getMyProfile();
    setAvatarImage(avatars, profile?.avatar_url);
  } catch {
    /* initials stay */
  }
}

const SURFACE_COLORS = { dark: "#09191f", light: "#eef7f6" };

function currentSurface() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function setSurface(theme) {
  const next = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(PANEL_SURFACE_KEY, next); } catch { /* vale só nesta aba */ }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = SURFACE_COLORS[next];
}

function paintSurfaceItem(item) {
  const dark = currentSurface() === "dark";
  item.setAttribute("aria-pressed", String(dark));
  item.innerHTML = dark ? ICONS.sun : ICONS.moon;
  const copy = el("span", "panel-menu-copy");
  copy.append(
    el("strong", "", dark ? "Modo claro" : "Modo noturno"),
    el("small", "", dark ? "Volta ao vidro claro do console" : "Tela escura para o salão à noite"),
  );
  item.append(copy);
}

function menuLink({ href, icon, title, detail, current = false }) {
  const link = el("a", "panel-menu-item");
  link.href = href;
  if (current) link.setAttribute("aria-current", "page");
  link.innerHTML = ICONS[icon] || "";
  const copy = el("span", "panel-menu-copy");
  copy.append(el("strong", "", title));
  if (detail) copy.append(el("small", "", detail));
  link.append(copy);
  return link;
}

/**
 * Cabeçalho comum dos painéis: "Voltar ao site" para onde a pessoa estava,
 * e a conta conectada com o menu para Conta, os outros painéis e Sair.
 */
export function initPanelHeader({ panel, onSignOut, surfaceToggle = false }) {
  const header = document.querySelector("[data-panel-header]");
  if (!header) return { setIdentity() {}, clearIdentity() {} };
  const slot = header.querySelector("[data-panel-account]");
  const returnHref = rememberReturn();
  const returnTitle = `Voltar para ${returnPageName(returnHref)}`;
  for (const back of header.querySelectorAll("[data-panel-back]")) {
    back.href = returnHref;
    back.title = `${returnTitle} e sair da gestão`;
  }

  const crumbs = header.querySelector(".panel-crumbs");
  if (crumbs) {
    const syncCrumbs = () => crumbs.classList.toggle("is-at-start", crumbs.scrollLeft <= 1);
    crumbs.addEventListener("scroll", syncCrumbs, { passive: true });
    requestAnimationFrame(() => {
      crumbs.scrollLeft = crumbs.scrollWidth;
      syncCrumbs();
    });
  }

  let closeMenu = () => {};

  function clearIdentity() {
    closeMenu();
    slot.replaceChildren();
    slot.hidden = true;
  }

  function setIdentity({ user, name = "", role = "" } = {}) {
    if (!user) {
      clearIdentity();
      return;
    }
    closeMenu();
    const fullName = String(name || "").trim() || displayName(user);
    const email = String(user.email || "").trim();
    const roleLabel = panelRoleLabel(role);
    const initials = profileInitials(fullName, email);

    const trigger = el("button", "panel-account-trigger");
    trigger.type = "button";
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", "panel-account-menu");
    trigger.setAttribute("aria-label", `Conta de ${fullName}${roleLabel ? `, ${roleLabel}` : ""}. Abrir menu`);
    const smallAvatar = avatarNode(initials, "sm");
    const copy = el("span", "panel-account-copy");
    copy.append(el("strong", "panel-account-name", fullName), el("small", "panel-account-role", roleLabel || "Conectado"));
    copy.querySelector("strong").dataset.short = firstName(fullName);
    const chevron = el("span", "panel-account-chevron");
    chevron.innerHTML = ICONS.chevron;
    trigger.append(smallAvatar, copy, chevron);

    const menu = el("div", "panel-account-menu glass-card");
    menu.id = "panel-account-menu";
    menu.hidden = true;
    const head = el("div", "panel-account-head");
    const largeAvatar = avatarNode(initials, "lg");
    const headCopy = el("div", "panel-account-head-copy");
    headCopy.append(el("strong", "", fullName));
    if (email) headCopy.append(el("small", "", email));
    if (roleLabel) headCopy.append(el("span", "badge", roleLabel));
    head.append(largeAvatar, headCopy);

    const nav = el("nav", "panel-menu-list");
    nav.setAttribute("aria-label", "Conta e painéis");
    nav.append(
      menuLink({ href: "conta.html", icon: "user", title: "Minha conta", detail: "Perfil, dados e privacidade" }),
      menuLink({ href: returnHref, icon: "back", title: "Voltar ao site", detail: `Sai da gestão e volta para ${returnPageName(returnHref)}` }),
    );
    const panels = panelLinksForRole(role, { current: panel, features: getFeatures() });
    if (panels.length > 1) {
      nav.append(el("p", "panel-menu-label", "Painéis"));
      for (const item of panels) nav.append(menuLink({ ...item, icon: item.id }));
    }
    if (surfaceToggle) {
      const surface = el("button", "panel-menu-item");
      surface.type = "button";
      paintSurfaceItem(surface);
      surface.addEventListener("click", () => {
        setSurface(currentSurface() === "dark" ? "light" : "dark");
        paintSurfaceItem(surface);
      });
      nav.append(surface);
    }
    const signOut = el("button", "panel-menu-item is-danger");
    signOut.type = "button";
    signOut.innerHTML = ICONS.exit;
    const signOutCopy = el("span", "panel-menu-copy");
    signOutCopy.append(el("strong", "", "Sair"), el("small", "", "Desconectar deste aparelho"));
    signOut.append(signOutCopy);
    nav.append(signOut);
    menu.append(head, nav);

    const onDocumentClick = (event) => {
      if (!slot.contains(event.target)) closeMenu();
    };
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      closeMenu();
      trigger.focus();
    };
    const openMenu = () => {
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      document.addEventListener("click", onDocumentClick);
      document.addEventListener("keydown", onKey);
    };
    closeMenu = () => {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", onDocumentClick);
      document.removeEventListener("keydown", onKey);
    };
    trigger.addEventListener("click", () => (menu.hidden ? openMenu() : closeMenu()));
    signOut.addEventListener("click", () => {
      closeMenu();
      void onSignOut?.();
    });

    slot.replaceChildren(trigger, menu);
    slot.hidden = false;
    void loadAvatar([smallAvatar, largeAvatar], user);
  }

  clearIdentity();
  return { setIdentity, clearIdentity };
}
