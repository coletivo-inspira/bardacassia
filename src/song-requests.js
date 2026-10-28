import { createSongRequest, fetchMyRequests, fetchPublicQueue, requestMode, requestsConfigured } from "./integrations/requests.js";
import { clearQrRequest, initQrRequests, prepareQrRequest } from "./qr-request.js";
import { cleanArtist, displayTitle } from "./lib/catalog.js";
import {
  formatClock, readCustomer, requestErrorMessage, requestStatusLabel, roundSummary, saveCustomer, songLabel,
  validateCustomer,
} from "./lib/requests.js";

const DIALOG_REFRESH_MS = 15000;
const BANNER_REFRESH_MS = 60000;

const $ = (selector) => document.querySelector(selector);
const els = {
  panel: $("#request-panel"),
  start: $("#request-song"),
  form: $("#request-form"),
  name: $("#request-name"),
  phone: $("#request-phone"),
  nameError: $("#request-name-error"),
  phoneError: $("#request-phone-error"),
  send: $("#send-request"),
  status: $("#request-status"),
  seeQueue: $("#request-see-queue"),
  open: $("#open-requests"),
  count: $("#requests-count"),
  banner: $("#round-banner"),
  bannerText: $("#round-banner-text"),
  bannerQueue: $("#round-banner-queue"),
  dialog: $("#requests-dialog"),
  close: $("#close-requests"),
  round: $("#requests-round"),
  mine: $("#my-requests"),
  mineEmpty: $("#my-requests-empty"),
  lastPlayed: $("#queue-last-played"),
  queue: $("#public-queue"),
  queueEmpty: $("#public-queue-empty"),
  error: $("#requests-error"),
};

let currentSong = null;
let queueState = null;
let myRequests = [];
let dialogTimer = null;
let bannerTimer = null;
let sending = false;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setFieldError(node, message) {
  node.textContent = message || "";
  node.hidden = !message;
}

function renderBanner() {
  if (!queueState) { els.banner.hidden = true; return; }
  const summary = roundSummary(queueState);
  els.bannerText.textContent = queueState.message ? `${summary} · ${queueState.message}` : summary;
  els.banner.dataset.open = String(Boolean(queueState.queue_open));
  els.banner.hidden = false;
}

function renderMine() {
  const active = myRequests.filter((request) => request.status === "aguardando_pagamento" || request.status === "na_fila");
  els.count.textContent = String(active.length);
  els.mine.replaceChildren(...myRequests.map((request) => {
    const row = el("article", `night-list-item request-item request-${request.status}`);
    row.append(
      el("strong", "request-item-title", displayTitle(request.title)),
      el("span", "request-item-artist", `${cleanArtist(request.artist)} · ${request.code}`),
      el("p", "request-item-status", requestStatusLabel(request)),
    );
    return row;
  }));
  els.mineEmpty.hidden = myRequests.length > 0;
}

function renderQueue() {
  els.round.textContent = queueState ? roundSummary(queueState) : "";
  const last = queueState?.last_played;
  els.lastPlayed.hidden = !last;
  if (last) els.lastPlayed.textContent = `Tocou por último: ${songLabel(last)} (${last.first_name}, ${formatClock(last.played_at)})`;
  const mineIds = new Set(myRequests.filter((request) => request.status === "na_fila").map((request) => request.id));
  const items = queueState?.queue || [];
  els.queue.replaceChildren(...items.map((item, index) => {
    const row = el("li", `public-queue-item${mineIds.has(item.id) ? " is-mine" : ""}`);
    row.append(
      el("span", "public-queue-position", index === 0 ? "Próxima" : `${index + 1}ª`),
      el("span", "public-queue-song", songLabel(item)),
      el("span", "public-queue-name", mineIds.has(item.id) ? "Você" : item.first_name),
    );
    return row;
  }));
  els.queueEmpty.hidden = items.length > 0;
}

async function refreshQueue() {
  try {
    queueState = await fetchPublicQueue();
    renderBanner();
    if (els.dialog.open) renderQueue();
  } catch {
    // O banner some até a próxima tentativa; a busca continua funcionando.
  }
}

async function refreshAll() {
  try {
    const [mine, queue] = await Promise.all([fetchMyRequests(), fetchPublicQueue()]);
    myRequests = mine;
    queueState = queue;
    els.error.textContent = "";
  } catch (error) {
    els.error.textContent = requestErrorMessage(error);
  }
  renderBanner();
  renderMine();
  renderQueue();
}

function openRequestsDialog() {
  renderMine();
  renderQueue();
  if (!els.dialog.open) els.dialog.showModal();
  void refreshAll();
  clearInterval(dialogTimer);
  dialogTimer = setInterval(() => { if (!document.hidden) void refreshAll(); }, DIALOG_REFRESH_MS);
}

function showForm() {
  const saved = readCustomer();
  if (!els.name.value) els.name.value = saved.name;
  if (!els.phone.value) els.phone.value = saved.phone;
  els.start.hidden = true;
  els.form.hidden = false;
  (els.name.value ? els.phone.value ? els.send : els.phone : els.name).focus();
}

async function sendRequest() {
  if (sending || !currentSong) return;
  const result = validateCustomer({ name: els.name.value, phone: els.phone.value });
  setFieldError(els.nameError, result.errors.name);
  setFieldError(els.phoneError, result.errors.phone);
  if (!result.ok) {
    (result.errors.name ? els.name : els.phone).focus();
    return;
  }
  saveCustomer(result.value);
  sending = true;
  els.send.disabled = true;
  els.status.textContent = "Enviando pedido…";
  const song = currentSong;
  try {
    await createSongRequest({ code: song.code, ...result.value });
    if (currentSong !== song) return;
    els.form.hidden = true;
    els.status.textContent = "Pedido enviado! Vá ao bar para pagar e entrar na fila.";
    els.seeQueue.hidden = false;
    void refreshAll();
  } catch (error) {
    if (currentSong === song) els.status.textContent = requestErrorMessage(error);
  } finally {
    sending = false;
    els.send.disabled = false;
  }
}

export function prepareSongRequest(song) {
  if (!requestsConfigured) return;
  if (requestMode === "qr") { prepareQrRequest(song); return; }
  currentSong = song;
  els.panel.hidden = false;
  els.start.hidden = false;
  els.form.hidden = true;
  els.seeQueue.hidden = true;
  els.status.textContent = queueState && !queueState.queue_open ? roundSummary(queueState) : "";
  setFieldError(els.nameError, "");
  setFieldError(els.phoneError, "");
}

export function clearSongRequest() {
  clearQrRequest();
  currentSong = null;
}

export function initSongRequests() {
  if (!requestsConfigured) return;
  // No modo QR o aparelho do cliente não grava nada: sem sessão anônima, sem pedidos pendentes.
  if (requestMode === "qr") { initQrRequests(); return; }
  els.open.hidden = false;
  els.start.addEventListener("click", showForm);
  els.send.addEventListener("click", sendRequest);
  // Enter dentro do diálogo enviaria o <form method="dialog"> e fecharia a janela.
  for (const input of [els.name, els.phone]) {
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (input === els.name) els.phone.focus();
      else void sendRequest();
    });
  }
  els.seeQueue.addEventListener("click", () => {
    els.panel.closest("dialog")?.close();
    openRequestsDialog();
  });
  els.open.addEventListener("click", openRequestsDialog);
  els.bannerQueue.addEventListener("click", openRequestsDialog);
  els.close.addEventListener("click", () => els.dialog.close());
  els.dialog.addEventListener("click", (event) => { if (event.target === els.dialog) els.dialog.close(); });
  els.dialog.addEventListener("close", () => { clearInterval(dialogTimer); dialogTimer = null; });

  void refreshAll();
  bannerTimer = setInterval(() => { if (!document.hidden && !els.dialog.open) void refreshQueue(); }, BANNER_REFRESH_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && bannerTimer) void refreshQueue(); });
}
