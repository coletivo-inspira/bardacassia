import { fetchTicketStatus } from "./integrations/requests.js";
import { trackEvent } from "./integrations/analytics.js";
import { readCustomer, saveCustomer } from "./lib/requests.js";
import { buildTicketUrl, rememberTicketStatus, ticketForSong, ticketName, ticketStatusLabel } from "./lib/qr-ticket.js";

const STATUS_REFRESH_MS = 8000;

const $ = (selector) => document.querySelector(selector);
const els = {
  panel: $("#qr-panel"),
  start: $("#qr-start"),
  name: $("#qr-name"),
  show: $("#qr-show"),
  ticket: $("#qr-ticket"),
  image: $("#qr-image"),
  code: $("#qr-code"),
  ticketName: $("#qr-ticket-name"),
  status: $("#qr-status"),
};

let currentSong = null;
let currentTicket = "";
let statusTimer = null;
let qrLib = null;

function stopPolling() {
  clearInterval(statusTimer);
  statusTimer = null;
}

async function refreshStatus(song, ticket) {
  try {
    const state = await fetchTicketStatus(ticket);
    if (currentSong !== song || currentTicket !== ticket) return;
    els.status.textContent = ticketStatusLabel(state);
    if (state?.status) rememberTicketStatus(song.code, ticket, state.status);
    if (state?.status === "tocou" || state?.status === "cancelado") stopPolling();
  } catch {
    // Sem conexão, o QR continua valendo; o garçom lê do mesmo jeito.
  }
}

async function showTicket() {
  const song = currentSong;
  if (!song) return;
  const name = ticketName(els.name.value);
  const saved = readCustomer();
  if (name !== ticketName(saved.name)) saveCustomer({ name, phone: saved.phone });
  const ticket = ticketForSong(song.code);
  currentTicket = ticket;
  els.show.disabled = true;
  try {
    qrLib ??= (await import("qrcode")).default;
    const url = buildTicketUrl(window.location.href, { code: song.code, name, ticket });
    const dataUrl = await qrLib.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: 520 });
    if (currentSong !== song) return;
    els.image.src = dataUrl;
    els.image.alt = `QR do pedido da música ${song.code} para o garçom`;
    els.code.textContent = song.code;
    els.ticketName.textContent = name;
    els.status.textContent = ticketStatusLabel(null);
    els.start.hidden = true;
    els.ticket.hidden = false;
    trackEvent("mostrar_qr", { code: song.code });
    stopPolling();
    void refreshStatus(song, ticket);
    statusTimer = setInterval(() => { if (!document.hidden) void refreshStatus(song, ticket); }, STATUS_REFRESH_MS);
  } catch {
    els.status.textContent = `Não foi possível gerar o QR. Mostre o código ${song.code} ao garçom.`;
  } finally {
    els.show.disabled = false;
  }
}

export function prepareQrRequest(song) {
  stopPolling();
  currentSong = song;
  currentTicket = "";
  els.panel.hidden = false;
  els.start.hidden = false;
  els.ticket.hidden = true;
  els.status.textContent = "";
  if (!els.name.value) els.name.value = ticketName(readCustomer().name);
}

export function clearQrRequest() {
  stopPolling();
  currentSong = null;
  currentTicket = "";
}

export function initQrRequests() {
  els.show.addEventListener("click", showTicket);
  els.name.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    // Enter dentro do <form method="dialog"> fecharia a janela.
    event.preventDefault();
    void showTicket();
  });
}
