import { formatCount, formatMinutes, metricsRange } from "./metrics.js";
import { saoPauloISODate } from "./manager-board.js";
import { DATA_CONSENT_VERSION } from "./profile.js";

const HOUR_MS = 60 * 60 * 1000;

export const ADMIN_TABS = [
  { id: "visao", hash: "#visao", label: "Visão Geral", shortLabel: "Visão" },
  { id: "config", hash: "#config", label: "Configurações", shortLabel: "Config" },
  { id: "aparencia", hash: "#aparencia", label: "Aparência", shortLabel: "Aparência" },
  { id: "acessos", hash: "#acessos", label: "Acessos", shortLabel: "Acessos" },
  { id: "banco-logs", hash: "#banco-logs", label: "Banco e Logs", shortLabel: "Logs" },
];

export const ADMIN_TAB_IDS = ADMIN_TABS.map((tab) => tab.id);

export const DATA_SUBTABS = [
  { id: "requests", label: "Pedidos" },
  { id: "tabelas", label: "Tabelas do Banco" },
  { id: "logs", label: "Logs de Monitoramento" },
];

export const ADMIN_RANGES = [
  { id: "hoje", label: "Noite atual" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "90d", label: "90 dias" },
];

export const ROLE_OPTIONS = [
  ["cliente", "Cliente"],
  ["garcom", "Garçom"],
  ["dono", "Dono"],
  ["admin", "Administrador"],
];

export const ROLE_LABELS = {
  cliente: "Cliente",
  garcom: "Garçom",
  dono: "Dono",
  admin: "Administrador",
};

export const ADMIN_ROLE_FILTERS = [
  { id: "", key: "all", label: "Todos" },
  { id: "admin", key: "admin", label: "Admin" },
  { id: "dono", key: "dono", label: "Dono" },
  { id: "garcom", key: "garcom", label: "Garçom" },
  { id: "cliente", key: "cliente", label: "Cliente" },
];

export const INSPECTABLE_TABLES = [
  { id: "song_requests", label: "song_requests · Pedidos", description: "Pedidos de música (telefone mascarado)" },
  { id: "song_interactions", label: "song_interactions · Interações", description: "Aberturas e favoritos por música" },
  { id: "profiles", label: "profiles · Perfis", description: "Perfis de contas cadastradas e LGPD" },
  { id: "staff", label: "staff · Equipe", description: "Vínculo de garçons e donos na fila" },
  { id: "catalog_codes", label: "catalog_codes · Catálogo", description: "Espelho sincronizado de músicas ativas" },
  { id: "bar_settings", label: "bar_settings · Operação", description: "Estado atual da fila, rodada e código da noite" },
  { id: "site_features", label: "site_features · Parâmetros", description: "Interruptores e limites ativos sem deploy" },
  { id: "write_limits", label: "write_limits · Rate-limit", description: "Janelas de gravações por minuto por sessão" },
  { id: "admin_audit_logs", label: "admin_audit_logs · Auditoria", description: "Trilha cronológica de ações administrativas" },
];

export const INSPECTABLE_TABLE_IDS = INSPECTABLE_TABLES.map((item) => item.id);

export const AUDIT_CATEGORIES = [
  { id: "", label: "Todos" },
  { id: "config", label: "Configuração" },
  { id: "aparencia", label: "Aparência" },
  { id: "acesso", label: "Acessos" },
  { id: "fila", label: "Fila e Rodada" },
  { id: "pedido", label: "Pedidos" },
  { id: "sistema", label: "Sistema" },
];

export const REQUEST_STATUS_FILTERS = [
  { id: "", label: "Todos os status" },
  { id: "aguardando_pagamento", label: "Aguardando pagamento" },
  { id: "na_fila", label: "Na fila" },
  { id: "tocou", label: "Tocou" },
  { id: "cancelado", label: "Cancelado" },
];

export const REQUEST_ORIGIN_FILTERS = [
  { id: "", label: "Todas as origens" },
  { id: "qr", label: "QR (garçom)" },
  { id: "remoto", label: "Remoto (código)" },
];

export function resolveAdminTab(hash) {
  const clean = String(hash || "")
    .split("?")[0]
    .replace(/^#/, "")
    .trim()
    .toLowerCase();
  return ADMIN_TAB_IDS.includes(clean) ? clean : "visao";
}

export function adminTabHash(tabId) {
  return `#${resolveAdminTab(tabId)}`;
}

export function resolveDataSubtab(id) {
  const clean = String(id || "").trim().toLowerCase();
  return DATA_SUBTABS.some((item) => item.id === clean) ? clean : "requests";
}

/**
 * Em `hoje`, a noite do bar começa às 18:00 em America/Sao_Paulo (-03:00),
 * alinhado com `private.night_of(p_at)` no banco.
 */
export function adminMetricsRange(rangeId, now = new Date()) {
  if (rangeId === "hoje") {
    const shifted = new Date(now.getTime() - 18 * HOUR_MS);
    const nightIso = saoPauloISODate(shifted);
    const from = new Date(`${nightIso}T18:00:00-03:00`);
    return { from, to: now };
  }
  return metricsRange(rangeId, now);
}

export function adminKpiCards(metrics = {}, dbOverview = null) {
  const m = metrics && typeof metrics === "object" ? metrics : {};
  const queueNow = dbOverview?.song_requests?.na_fila;
  return [
    { id: "requests", label: "Pedidos pagos", value: formatCount(m.requests), tone: "teal" },
    { id: "queue-now", label: "Na fila agora", value: queueNow == null ? "—" : formatCount(queueNow), tone: "sky" },
    { id: "played", label: "Tocados", value: formatCount(m.played), tone: "teal" },
    { id: "cancelled", label: "Cancelados", value: formatCount(m.cancelled), tone: "coral" },
    { id: "wait", label: "Espera média", value: formatMinutes(m.avg_wait_minutes), tone: "amber" },
    { id: "customers", label: "Clientes na noite", value: formatCount(m.customers), tone: "sky" },
    { id: "visitors", label: "Visitantes únicos", value: formatCount(m.visitors), tone: "teal" },
    { id: "song-opens", label: "Aberturas de músicas", value: formatCount(m.song_opens), tone: "sky" },
    {
      id: "accounts-new",
      label: "Contas criadas",
      value: `${formatCount(m.accounts_new)} (${formatCount(m.accounts_total)} total)`,
      tone: "amber",
    },
  ];
}

export function adminDbHealthItems(dbOverview = null) {
  if (!dbOverview || typeof dbOverview !== "object") return [];
  const catalog = dbOverview.catalog_codes || {};
  const interactions = dbOverview.song_interactions || {};
  const profiles = dbOverview.profiles || {};
  const limits = dbOverview.write_limits || {};
  const logs = dbOverview.admin_audit_logs || {};
  return [
    {
      id: "catalog",
      label: "Músicas ativas no banco",
      value: formatCount(catalog.active),
      detail: `${formatCount(catalog.total)} códigos sincronizados`,
    },
    {
      id: "interactions",
      label: "Interações registradas",
      value: formatCount(interactions.total),
      detail: `${formatCount(interactions.opens)} aberturas · ${formatCount(interactions.favorites)} favoritas`,
    },
    {
      id: "accounts",
      label: "Contas e equipe",
      value: formatCount(profiles.total),
      detail: `${formatCount(profiles.admin)} admin · ${formatCount(profiles.dono)} dono · ${formatCount(profiles.garcom)} garçom`,
    },
    {
      id: "rate-limit",
      label: "Rate-limit ativo (10 min)",
      value: formatCount(limits.active_10m),
      detail: `${formatCount(limits.writes_10m)} gravações · ${formatCount(logs.last_24h)} logs (24h)`,
    },
  ];
}

export function maskPhone(raw) {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  if (digits.length >= 11) return `(${digits.slice(0, 2)}) *****-${digits.slice(-4)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ****-${digits.slice(-4)}`;
  if (digits.length > 4) return `****-${digits.slice(-4)}`;
  return "****";
}

export function formatSaoPauloDateTime(value) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatSaoPauloDate(value) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function shortUuid(value) {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  return raw.slice(0, 8);
}

export function isStaffCapableRole(role) {
  return role === "garcom" || role === "dono" || role === "admin";
}

export function defaultStaffNameForUser(user = {}) {
  const explicit = String(user?.staff_name || "").trim();
  if (explicit) return explicit;
  const display = String(user?.display_name || "").trim();
  if (display) return display;
  const email = String(user?.email || "").trim();
  if (email.includes("@")) return email.split("@")[0];
  return "";
}

export function consentBadgeInfo(user = {}) {
  if (!user?.data_consent_at) {
    return { ok: false, label: "LGPD pendente" };
  }
  const version = String(user.data_consent_version || "").trim();
  const current = version === DATA_CONSENT_VERSION;
  return {
    ok: true,
    current,
    label: version ? `LGPD ${version}` : "LGPD aceita",
  };
}

export function isInspectableTable(name) {
  return INSPECTABLE_TABLE_IDS.includes(String(name || "").trim().toLowerCase());
}

export function tableLabelOf(name) {
  const clean = String(name || "").trim().toLowerCase();
  return INSPECTABLE_TABLES.find((item) => item.id === clean)?.label || clean;
}

const TIMESTAMP_COLS = new Set([
  "created_at",
  "updated_at",
  "paid_at",
  "played_at",
  "cancelled_at",
  "first_open_at",
  "data_consent_at",
  "round_started_at",
  "next_round_at",
  "window_start",
  "last_sign_in_at",
]);

export function formatTableCell(column, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (column === "customer_phone") {
    return String(value).includes("*") ? String(value) : (maskPhone(value) || "—");
  }
  if (TIMESTAMP_COLS.has(column)) {
    return formatSaoPauloDateTime(value);
  }
  if (column === "id" || column === "user_id" || column === "actor_id") {
    const str = String(value);
    return str.length === 36 && str.includes("-") ? `${str.slice(0, 8)}…` : str;
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

const CATEGORY_LABELS = {
  config: "Configuração",
  aparencia: "Aparência",
  acesso: "Acessos",
  fila: "Fila e Rodada",
  pedido: "Pedidos",
  sistema: "Sistema",
};

export function auditCategoryLabel(category) {
  const key = String(category || "").trim().toLowerCase();
  return CATEGORY_LABELS[key] || key || "Sistema";
}

const ACTION_SUMMARIES = {
  salvar_funcionalidades: "Atualizou interruptores e modo do site",
  salvar_parametros: "Salvou limites operacionais e aviso do catálogo",
  alterar_tema_padrao: "Alterou o tema inicial padrão do site",
  salvar_paleta: "Atualizou a paleta de cores",
  atualizar_acesso: "Atualizou papel e acesso na equipe",
  atualizar_rodada: "Atualizou configurações da rodada",
  nova_rodada: "Iniciou uma nova rodada na fila",
  configurar_codigo_noite: "Atualizou exigência/código da noite",
  adicionar_pedido_qr: "Registrou pedido presencial via QR",
  confirmar_pagamento: "Confirmou pagamento de pedido",
  marcar_tocou: "Marcou música como tocada",
  cancelar_pedido: "Cancelou pedido da fila",
};

export function auditActionSummary(row = {}) {
  const action = String(row?.action || "").trim();
  const base = ACTION_SUMMARIES[action] || action.replaceAll("_", " ") || "Evento registrado";
  const target = String(row?.target || "").trim();
  return target ? `${base} · ${target}` : base;
}

export function formatAuditDetails(details) {
  if (!details || typeof details !== "object") return "{}";
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return "{}";
  }
}

export function requestStatusBadge(status) {
  switch (status) {
    case "aguardando_pagamento":
      return { label: "Aguardando pagamento", tone: "amber" };
    case "na_fila":
      return { label: "Na fila", tone: "teal" };
    case "tocou":
      return { label: "Tocou", tone: "sky" };
    case "cancelado":
      return { label: "Cancelado", tone: "coral" };
    default:
      return { label: String(status || "—"), tone: "muted" };
  }
}

export function adminErrorMessage(error) {
  if (error?.hint === "ultimo_admin" || /last admin/i.test(error?.message || "")) {
    return "Não é permitido remover o último administrador do sistema.";
  }
  if (error?.hint === "codigo_noite_vazio" || /night code required/i.test(error?.message || "")) {
    return "Informe um código da noite antes de ativar a exigência.";
  }
  if (error?.hint === "pedido_nao_pendente") {
    return "Este pedido já foi pago ou cancelado.";
  }
  if (error?.hint === "pedido_fora_da_fila") {
    return "Este pedido não está mais na fila.";
  }
  if (error?.hint === "pedido_inativo") {
    return "Este pedido já foi encerrado.";
  }
  if (error?.status === 401 || error?.code === "PGRST301") {
    return "Sessão expirada. Entre novamente.";
  }
  if (error?.code === "42501" || /admin only/i.test(error?.message || "")) {
    return "Apenas contas com papel de administrador podem executar esta ação.";
  }
  if (error?.code === "PGRST202" || /could not find the function/i.test(error?.message || "")) {
    return "Função administrativa ainda não publicada no banco (aplique a migração 012).";
  }
  return error?.message || "Não foi possível concluir a operação.";
}
