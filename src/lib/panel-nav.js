import { showManagerPanel, showStaffPanel } from "./features.js";

export const PANEL_RETURN_KEY = "bdc-panel-return-v1";
/** Claro ou noturno, o mesmo nos três painéis (o console já guardava aqui). */
export const PANEL_SURFACE_KEY = "bdc-admin-surface-v1";

/** Painéis de gestão, na ordem do menu da conta. */
export const PANELS = [
  { id: "admin", href: "admin.html", title: "Console do administrador", detail: "Interruptores, aparência e acessos" },
  { id: "gerente", href: "gerente.html", title: "Painel do gerente", detail: "Fila da noite e movimento do período" },
  { id: "garcom", href: "garcom.html", title: "Painel do garçom", detail: "Ler QR, fila, pagamento e rodada" },
];

export const PANEL_ROLE_LABELS = {
  cliente: "Cliente",
  garcom: "Garçom",
  dono: "Dono",
  admin: "Administrador",
};

/** Nome de cada página do site no "Voltar para …". */
const SITE_PAGES = {
  "index.html": "o catálogo",
  "conta.html": "a Conta",
  "favoritos.html": "as Favoritas",
  "o-bar.html": "O bar",
  "evento.html": "o Evento",
  "cartaz.html": "o Cartaz",
};

/** Nunca viram destino do "Voltar ao site": são gestão ou o próprio login. */
const NON_RETURN_FILES = new Set(["admin.html", "gerente.html", "garcom.html", "login.html"]);

export function panelRoleLabel(role) {
  return PANEL_ROLE_LABELS[role] || "";
}

function canOpen(panelId, role, features) {
  const isAdmin = role === "admin";
  const isDono = isAdmin || role === "dono";
  const isGarcom = isDono || role === "garcom";
  if (panelId === "admin") return isAdmin;
  if (panelId === "gerente") return isDono && showManagerPanel(features);
  if (panelId === "garcom") return isGarcom && showStaffPanel(features);
  return false;
}

/** Painéis que o papel abre; o atual entra sempre, marcado com `current`. */
export function panelLinksForRole(role, { current = "", features = {} } = {}) {
  return PANELS
    .filter((panel) => panel.id === current || canOpen(panel.id, role, features))
    .map((panel) => ({ ...panel, current: panel.id === current }));
}

function siteFile(value) {
  const match = /^([a-z0-9-]+\.html)([?#][^\s]*)?$/i.exec(String(value || ""));
  if (!match) return "";
  const file = match[1].toLowerCase();
  if (NON_RETURN_FILES.has(file) || !SITE_PAGES[file]) return "";
  return `${file}${match[2] || ""}`;
}

/** Página do site (mesma origem) de onde a pessoa veio, como link relativo; "" se não servir. */
export function returnTargetFromReferrer(referrer, origin) {
  let url;
  try {
    url = new URL(String(referrer || ""));
  } catch {
    return "";
  }
  if (!origin || url.origin !== origin) return "";
  const file = url.pathname.split("/").pop() || "index.html";
  return siteFile(`${file}${url.search}${url.hash}`);
}

/**
 * Para onde o "Voltar ao site" leva: a página que abriu a gestão, lembrada
 * enquanto a pessoa troca de painel; sem histórico, o catálogo.
 */
export function resolvePanelReturn({ referrer = "", origin = "", stored = "" } = {}) {
  return returnTargetFromReferrer(referrer, origin) || siteFile(stored) || "index.html";
}

export function returnPageName(href) {
  const file = String(href || "").split(/[?#]/)[0].toLowerCase() || "index.html";
  return SITE_PAGES[file] || SITE_PAGES["index.html"];
}

export function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}
