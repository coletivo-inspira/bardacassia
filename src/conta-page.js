import { authBackendReady, displayName, getCurrentUser, onAuthChange, publicAuthEnabled, signOut } from "./integrations/auth.js";
import { loadSiteFeatures } from "./integrations/features.js";
import { getMyPhone, getMyProfile, getMyRole } from "./integrations/profile.js";
import { hasStoredAuthSession } from "./integrations/supabase.js";
import { getFeatures } from "./lib/feature-state.js";
import { showFavorites, showPageFile, showStaffPanel, showThemeToggle } from "./lib/features.js";
import { formatPhoneMask, providerAvatarUrl } from "./lib/profile.js";
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

const ROLE_LABELS = {
  cliente: "Cliente",
  garcom: "Garçom",
  dono: "Dono",
  admin: "Administrador",
};

function loginHref() {
  return `login.html?next=${encodeURIComponent("conta.html")}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatBirthDate(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  const date = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR");
}

function formatConsent(profile) {
  const at = profile?.data_consent_at;
  if (!at) return "";
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return "";
  const version = profile?.data_consent_version ? ` · versão ${profile.data_consent_version}` : "";
  return `Autorizado em ${when.toLocaleDateString("pt-BR")}${version}`;
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
  if (isDono) {
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

function signedInMenuRows(role) {
  const features = getFeatures();
  const rows = [];
  if (showFavorites(features)) {
    rows.push(menuRow({ href: "favoritos.html", icon: HEART_ICON, title: "Meus favoritos", detail: "Músicas salvas neste aparelho" }));
  }
  if (publicAuthEnabled()) {
    rows.push(menuRow({ href: "login.html#conta", icon: USER_ICON, title: "Minha conta", detail: "Perfil, dados e privacidade" }));
  }
  rows.push(...rolePanelRows(role, features));
  rows.push(menuRow({ href: "o-bar.html", icon: BAR_ICON, title: "O bar", detail: "Valores, endereço e horário" }));
  if (showThemeToggle(features)) rows.push(themeRow());
  rows.push(menuRow({ action: "signout", icon: EXIT_ICON, title: "Sair", detail: "Desconectar deste aparelho", danger: true }));
  return rows;
}

function detailItems({ user, profile, phone, role }) {
  const items = [];
  const email = String(user?.email || "").trim();
  if (email) items.push({ label: "E-mail", value: email });
  const birth = formatBirthDate(profile?.birth_date);
  items.push({ label: "Data de nascimento", value: birth || "Não informada" });
  const phoneText = phone ? formatPhoneMask(phone) : "";
  items.push({ label: "Telefone", value: phoneText || "Não informado" });
  if (role && ROLE_LABELS[role]) {
    items.push({ label: "Papel", value: ROLE_LABELS[role] });
  }
  const consent = formatConsent(profile);
  items.push({ label: "LGPD", value: consent || "Sem autorização registrada" });
  return items;
}

function renderHeroDetails(details) {
  const panel = document.querySelector("[data-account-details]");
  if (!panel) return;
  if (!details?.length) {
    panel.innerHTML = "";
    return;
  }
  panel.innerHTML = `<dl class="account-hero-dl">${details.map((item) => `
    <div class="account-hero-field">
      <dt>${escapeHtml(item.label)}</dt>
      <dd>${escapeHtml(item.value)}</dd>
    </div>`).join("")}</dl>`;
}

function setHeroExpanded(expanded) {
  const hero = document.querySelector(".account-hero");
  const toggle = document.querySelector("[data-account-hero-toggle]");
  const panel = document.querySelector("[data-account-details]");
  if (!hero || !toggle || !panel) return;
  const open = Boolean(expanded);
  hero.classList.toggle("is-expanded", open);
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Ocultar detalhes da conta" : "Mostrar detalhes da conta");
  panel.hidden = !open;
}

function bindHeroToggle(enabled) {
  const hero = document.querySelector(".account-hero");
  const toggle = document.querySelector("[data-account-hero-toggle]");
  const panel = document.querySelector("[data-account-details]");
  if (!hero || !toggle || !panel) return;
  toggle.disabled = !enabled;
  hero.classList.toggle("is-expandable", enabled);
  toggle.setAttribute("aria-label", enabled ? "Mostrar ou ocultar detalhes da conta" : "Conta");
  if (!enabled) {
    setHeroExpanded(false);
    renderHeroDetails([]);
    return;
  }
  if (toggle.dataset.bound === "1") return;
  toggle.dataset.bound = "1";
  toggle.addEventListener("click", () => {
    if (toggle.disabled) return;
    const next = toggle.getAttribute("aria-expanded") !== "true";
    setHeroExpanded(next);
  });
}

async function fillHeroProfile(user) {
  const role = await getMyRole().catch(() => null);
  let profile = null;
  let phone = null;
  try {
    profile = await getMyProfile();
  } catch {
    profile = null;
  }
  try {
    phone = await getMyPhone();
  } catch {
    phone = null;
  }
  const url = String(profile?.avatar_url || providerAvatarUrl(user) || "").trim();
  const name = displayName(user);
  const initial = Array.from(name)[0]?.toLocaleUpperCase("pt-BR") || "";
  if (url) setHeroAvatar(url, initial);
  renderHeroDetails(detailItems({ user, profile, phone, role }));
  return role;
}

function renderAccountPage(user, { role = null } = {}) {
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
    bindHeroToggle(true);
    setHeroExpanded(false);
    list.innerHTML = signedInMenuRows(role).join("");
    list.querySelector('[data-action="signout"]')?.addEventListener("click", async () => {
      await signOut();
      renderAccountPage(null);
    });
    const quick = providerAvatarUrl(user);
    if (quick) setHeroAvatar(quick, initial);
    void fillHeroProfile(user).then((resolvedRole) => {
      if (resolvedRole && resolvedRole !== role) {
        list.innerHTML = signedInMenuRows(resolvedRole).join("");
        list.querySelector('[data-action="signout"]')?.addEventListener("click", async () => {
          await signOut();
          renderAccountPage(null);
        });
        initializeTheme();
      }
    });
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
    bindHeroToggle(false);
    const rows = [];
    if (publicAuthEnabled()) {
      rows.push(menuRow({ href: loginHref(), icon: ENTER_ICON, title: "Entrar", detail: "Acesse sua conta no bar" }));
    }
    rows.push(menuRow({ href: "o-bar.html", icon: BAR_ICON, title: "O bar", detail: "Valores, endereço e horário" }));
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
