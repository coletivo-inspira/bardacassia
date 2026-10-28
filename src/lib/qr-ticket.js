import { firstName } from "./requests.js";

const CODE_RE = /^\d{1,6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NAME_MAX = 30;

export function newTicketId(cryptoImpl = globalThis.crypto) {
  if (typeof cryptoImpl?.randomUUID === "function") return cryptoImpl.randomUUID();
  const bytes = cryptoImpl.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Só o primeiro nome vai no QR: o QR fica menor e não expõe o nome completo. */
export function ticketName(name) {
  return firstName(name).slice(0, NAME_MAX);
}

export function isValidTicket(ticket) {
  return Boolean(ticket) && CODE_RE.test(String(ticket.code)) && UUID_RE.test(String(ticket.ticket));
}

export function encodeTicketHash({ code, name, ticket }) {
  const params = new URLSearchParams({ add: String(code), t: String(ticket) });
  const shortName = ticketName(name);
  if (shortName) params.set("n", shortName);
  return params.toString();
}

export function buildTicketUrl(siteUrl, ticket) {
  const url = new URL("garcom.html", siteUrl);
  url.search = "";
  url.hash = encodeTicketHash(ticket);
  return url.toString();
}

/** Aceita a URL completa lida pelo scanner ou só o hash recebido em garcom.html. */
export function parseTicket(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  let hash = raw;
  try {
    if (/^https?:\/\//i.test(raw)) hash = new URL(raw).hash;
  } catch {
    return null;
  }
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const ticket = { code: params.get("add") || "", name: ticketName(params.get("n") || ""), ticket: (params.get("t") || "").toLowerCase() };
  return isValidTicket(ticket) ? ticket : null;
}

export const TICKETS_KEY = "bdc-qr-tickets-v1";
const TICKET_TTL_MS = 6 * 60 * 60 * 1000;
const FINAL_STATUSES = new Set(["tocou", "cancelado"]);

export function readTickets(storage = globalThis.localStorage, now = Date.now()) {
  try {
    const saved = JSON.parse(storage?.getItem(TICKETS_KEY) || "{}");
    return Object.fromEntries(Object.entries(saved && typeof saved === "object" ? saved : {})
      .filter(([code, entry]) => CODE_RE.test(code) && UUID_RE.test(String(entry?.ticket)) && now - Number(entry.at) < TICKET_TTL_MS));
  } catch {
    return {};
  }
}

function writeTickets(tickets, storage) {
  try {
    storage?.setItem(TICKETS_KEY, JSON.stringify(tickets));
  } catch {
    // Sem armazenamento, o mesmo QR só vale enquanto a janela estiver aberta.
  }
}

/**
 * Reaproveita o ticket da mesma música enquanto ele não tocou: o garçom pode ler o QR
 * de novo sem duplicar o pedido, e o cliente continua acompanhando a posição.
 */
export function ticketForSong(code, { storage = globalThis.localStorage, now = Date.now(), createId = newTicketId } = {}) {
  const tickets = readTickets(storage, now);
  const current = tickets[String(code)];
  if (current && !FINAL_STATUSES.has(current.status)) return current.ticket;
  const ticket = createId();
  tickets[String(code)] = { ticket, at: now, status: "" };
  writeTickets(tickets, storage);
  return ticket;
}

export function rememberTicketStatus(code, ticket, status, { storage = globalThis.localStorage, now = Date.now() } = {}) {
  const tickets = readTickets(storage, now);
  const current = tickets[String(code)];
  if (!current || current.ticket !== ticket || current.status === status) return;
  tickets[String(code)] = { ...current, status: String(status || "") };
  writeTickets(tickets, storage);
}

export function ticketStatusLabel(state) {
  switch (state?.status) {
    case "na_fila": {
      const ahead = Number(state.ahead);
      if (ahead === 0) return "Confirmado! A sua é a próxima.";
      if (ahead === 1) return "Confirmado! Falta 1 música antes da sua.";
      return Number.isFinite(ahead) ? `Confirmado! Faltam ${ahead} músicas antes da sua.` : "Confirmado! Você está na fila.";
    }
    case "tocou": return "Sua música já tocou. Quer pedir outra?";
    case "cancelado": return "O bar cancelou este pedido. Fale com o garçom.";
    default: return "Mostre este QR ao garçom. Ele confirma o pagamento e coloca sua música na fila.";
  }
}
