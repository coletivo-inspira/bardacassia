import { cleanArtist, displayTitle, normalizeText } from "./catalog.js";

export const CUSTOMER_KEY = "bdc-customer-v1";

export function normalizePhone(raw) {
  return String(raw || "").replace(/\D/g, "");
}

export function normalizeName(raw) {
  return String(raw || "").replace(/\s+/g, " ").trim();
}

export function validateCustomer({ name, phone } = {}) {
  const value = { name: normalizeName(name), phone: normalizePhone(phone) };
  const errors = {};
  if (value.name.length < 2) errors.name = "Informe seu nome.";
  else if (value.name.length > 60) errors.name = "Use até 60 caracteres.";
  if (!/^\d{10,13}$/.test(value.phone)) errors.phone = "Informe o telefone com DDD.";
  return { ok: Object.keys(errors).length === 0, value, errors };
}

export function formatPhone(raw) {
  const digits = normalizePhone(raw);
  const local = digits.length > 11 && digits.startsWith("55") ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return digits;
}

export function firstName(name) {
  return normalizeName(name).split(" ")[0] || "";
}

export function songLabel(song) {
  return `${displayTitle(song?.title)} — ${cleanArtist(song?.artist)}`;
}

export function aheadLabel(ahead) {
  if (ahead === null || ahead === undefined || ahead === "") return "";
  const count = Number(ahead);
  if (!Number.isFinite(count) || count < 0) return "";
  if (count === 0) return "A sua é a próxima!";
  if (count === 1) return "Falta 1 música antes da sua.";
  return `Faltam ${count} músicas antes da sua.`;
}

export function requestStatusLabel(request) {
  switch (request?.status) {
    case "aguardando_pagamento": return "Vá ao bar para pagar e entrar na fila.";
    case "na_fila": return `Pago, na fila. ${aheadLabel(request.ahead)}`.trim();
    case "tocou": return "Já tocou.";
    case "cancelado": return "Cancelado pelo bar.";
    default: return "";
  }
}

export function formatClock(value, { timeZone } = {}) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone }).format(date);
}

export function roundSlotsLeft(state) {
  const limit = Number(state?.round_limit) || 0;
  if (limit <= 0) return null;
  return Math.max(limit - (Number(state?.round_used) || 0), 0);
}

export function roundSummary(state, options = {}) {
  if (!state) return "";
  if (!state.queue_open) {
    const time = formatClock(state.next_round_at, options);
    return time ? `Fila fechada · próxima rodada às ${time}` : "Fila fechada";
  }
  const left = roundSlotsLeft(state);
  if (left === null) return "Fila aberta";
  return `Fila aberta · ${left === 1 ? "falta 1 vaga" : `faltam ${left} vagas`} nesta rodada`;
}

// Converte "HH:MM" no próximo instante com esse horário (02:00 digitado às 23h é amanhã).
export function nextOccurrence(time, now = new Date()) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time || "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const date = new Date(now);
  date.setHours(hours, minutes, 0, 0);
  if (date <= now) date.setDate(date.getDate() + 1);
  return date;
}

const byTime = (key) => (a, b) => String(a[key] || "").localeCompare(String(b[key] || "")) || Number(a.id) - Number(b.id);

export function splitStaffRequests(requests = []) {
  return {
    queue: requests.filter((request) => request.status === "na_fila").sort(byTime("paid_at")),
    pending: requests.filter((request) => request.status === "aguardando_pagamento").sort(byTime("created_at")),
  };
}

export function filterStaffRequests(requests, query) {
  const needle = normalizeText(query);
  const digits = normalizePhone(query);
  if (!needle) return requests;
  return requests.filter((request) => normalizeText(request.customer_name).includes(needle)
    || normalizeText(`${request.title} ${request.artist}`).includes(needle)
    || (digits && (String(request.customer_phone).includes(digits) || String(request.code).startsWith(digits))));
}

const ERROR_MESSAGES = {
  fila_fechada: "A fila está fechada no momento. Aguarde a próxima rodada.",
  codigo_invalido: "Essa música não está mais no catálogo.",
  nome_invalido: "Informe seu nome.",
  telefone_invalido: "Informe o telefone com DDD.",
  muitos_pendentes: "Você já tem 3 pedidos aguardando pagamento. Pague no bar antes de pedir mais.",
  pedido_nao_pendente: "Esse pedido já foi confirmado ou cancelado.",
  pedido_fora_da_fila: "Esse pedido não está mais na fila.",
  pedido_inativo: "Esse pedido já foi finalizado.",
};

export function requestErrorMessage(error) {
  if (error?.hint && ERROR_MESSAGES[error.hint]) return ERROR_MESSAGES[error.hint];
  if (error?.status === 401 || error?.code === "42501") return "Sem permissão. Entre novamente.";
  if (/write limit/i.test(error?.message || "")) return "Muitas tentativas. Aguarde um minuto.";
  return "Não foi possível concluir agora. Verifique a conexão e tente de novo.";
}

export function readCustomer(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(CUSTOMER_KEY) || "null");
    return { name: normalizeName(saved?.name), phone: normalizePhone(saved?.phone) };
  } catch {
    return { name: "", phone: "" };
  }
}

export function saveCustomer(customer, storage = globalThis.localStorage) {
  try {
    storage?.setItem(CUSTOMER_KEY, JSON.stringify({
      name: normalizeName(customer?.name), phone: normalizePhone(customer?.phone),
    }));
  } catch {
    // O pedido continua funcionando sem lembrar os dados.
  }
}
