import "./garcom.css";
import {
  getStaffSession, ownerMetrics, requestsConfigured, staffAddRequest, staffCancel, staffGetSettings, staffListPlayed,
  staffGetNightCode, staffListRequests, staffMarkPaid, staffSetNightCode, staffMarkPlayed, staffSignIn, staffSignOut, staffUpdateSettings, staffWhoami,
} from "./integrations/requests.js";
import { displayTitle } from "./lib/catalog.js";
import {
  filterStaffRequests, normalizeNightCode, randomNightCode, formatClock, formatPhone, nextOccurrence, requestErrorMessage, roundSummary, songLabel,
  splitStaffRequests,
} from "./lib/requests.js";
import { newTicketId, parseTicket, ticketName } from "./lib/qr-ticket.js";
import { barRows, metricCards, metricsRange, nightLabel, weekdayLabel } from "./lib/metrics.js";

const REFRESH_MS = 10000;
const SCAN_INTERVAL_MS = 200;
// Sobrevive ao login: o garçom pode ler o QR antes de entrar no painel.
const PENDING_TICKET_KEY = "bdc-staff-ticket-v1";

const $ = (selector) => document.querySelector(selector);
const els = {
  unconfigured: $("#staff-unconfigured"),
  logout: $("#staff-logout"),
  scan: $("#staff-scan"),
  ticketCard: $("#ticket-card"),
  ticketCode: $("#ticket-code"),
  ticketSong: $("#ticket-song"),
  ticketCustomer: $("#ticket-customer"),
  ticketConfirm: $("#ticket-confirm"),
  ticketDismiss: $("#ticket-dismiss"),
  playedTitle: $("#played-title"),
  playedList: $("#played-list"),
  scanDialog: $("#scan-dialog"),
  scanVideo: $("#scan-video"),
  scanCanvas: $("#scan-canvas"),
  scanStatus: $("#scan-status"),
  scanClose: $("#scan-close"),
  manualForm: $("#manual-form"),
  manualCode: $("#manual-code"),
  manualName: $("#manual-name"),
  loginView: $("#login-view"),
  email: $("#staff-email"),
  password: $("#staff-password"),
  loginButton: $("#staff-login"),
  loginStatus: $("#login-status"),
  panel: $("#panel-view"),
  round: $("#staff-round"),
  status: $("#staff-status"),
  tabs: [...document.querySelectorAll(".staff-tab")],
  queueCount: $("#queue-count"),
  pendingCount: $("#pending-count"),
  nextCard: $("#next-card"),
  nextCode: $("#next-code"),
  nextSong: $("#next-song"),
  nextCustomer: $("#next-customer"),
  nextPlayed: $("#next-played"),
  nextCancel: $("#next-cancel"),
  queueEmpty: $("#queue-empty"),
  queueRestTitle: $("#queue-rest-title"),
  queueRest: $("#queue-rest"),
  search: $("#pending-search"),
  pendingList: $("#pending-list"),
  pendingEmpty: $("#pending-empty"),
  roundForm: $("#round-form"),
  roundOpen: $("#round-open"),
  roundLimit: $("#round-limit"),
  roundNext: $("#round-next"),
  roundMessage: $("#round-message"),
  roundNew: $("#round-new"),
  tabResults: $("#tab-results"),
  nightForm: $("#night-form"),
  nightRequired: $("#night-required"),
  nightCode: $("#night-code"),
  nightGenerate: $("#night-generate"),
  resultsRanges: [...document.querySelectorAll(".results-range")],
  resultsStatus: $("#results-status"),
  resultsCards: $("#results-cards"),
  resultsNights: $("#results-nights"),
  resultsWeekdays: $("#results-weekdays"),
  resultsTop: $("#results-top"),
  resultsStaff: $("#results-staff"),
};

let requests = [];
let settings = null;
let timer = null;
let busy = false;
let roundFormDirty = false;
let played = [];
let pendingTicket = null;
let catalogPromise = null;
let scanStream = null;
let scanTimer = null;
let detector = null;
let jsQR = null;
let resultsRange = "30d";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, className, onClick) {
  const node = el("button", `staff-button ${className}`, label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

function customerLine(request) {
  const phone = formatPhone(request.customer_phone);
  return phone ? `${request.customer_name} · ${phone}` : request.customer_name;
}

function setStatus(message) {
  els.status.textContent = message || "";
}

function showLogin(message = "") {
  clearInterval(timer);
  timer = null;
  els.panel.hidden = true;
  els.logout.hidden = true;
  els.scan.hidden = true;
  els.loginView.hidden = false;
  els.loginStatus.textContent = message;
}

function handleError(error) {
  if (error?.status === 401 || error?.code === "PGRST301") {
    staffSignOut();
    showLogin("Sessão expirada. Entre novamente.");
    return;
  }
  if (error?.code === "42501") {
    staffSignOut();
    showLogin("Esta conta não tem acesso ao painel. Peça para cadastrarem você como garçom.");
    return;
  }
  setStatus(requestErrorMessage(error));
}

function renderRound() {
  els.round.textContent = settings ? roundSummary(settings) : "";
  els.round.dataset.open = String(Boolean(settings?.queue_open));
  if (!settings || roundFormDirty) return;
  els.roundOpen.checked = Boolean(settings.queue_open);
  els.roundLimit.value = String(settings.round_limit ?? 0);
  els.roundNext.value = settings.next_round_at ? formatClock(settings.next_round_at) : "";
  els.roundMessage.value = settings.message || "";
}

function renderQueue(queue) {
  const [next, ...rest] = queue;
  els.queueCount.textContent = String(queue.length);
  els.nextCard.hidden = !next;
  els.queueEmpty.hidden = Boolean(next);
  if (next) {
    els.nextCode.textContent = next.code;
    els.nextSong.textContent = songLabel(next);
    els.nextCustomer.textContent = customerLine(next);
    els.nextPlayed.dataset.id = String(next.id);
    els.nextCancel.dataset.id = String(next.id);
  }
  els.queueRestTitle.hidden = rest.length === 0;
  els.queueRest.replaceChildren(...rest.map((request, index) => {
    const row = el("li", "staff-item");
    const info = el("div", "staff-item-info");
    info.append(
      el("span", "staff-item-position", `${index + 2}ª`),
      el("strong", "staff-item-code", request.code),
      el("span", "staff-item-song", songLabel(request)),
      el("span", "staff-item-customer", customerLine(request)),
    );
    row.append(info, button("Cancelar", "staff-ghost staff-small", () => cancel(request)));
    return row;
  }));
}

function renderPending(pending) {
  els.pendingCount.textContent = String(pending.length);
  const visible = filterStaffRequests(pending, els.search.value);
  els.pendingList.replaceChildren(...visible.map((request) => {
    const row = el("li", "staff-item");
    const info = el("div", "staff-item-info");
    info.append(
      el("strong", "staff-item-name", request.customer_name),
      el("span", "staff-item-customer", formatPhone(request.customer_phone)),
      el("span", "staff-item-song", `${request.code} · ${songLabel(request)}`),
      el("span", "staff-item-time", `Pedido às ${formatClock(request.created_at)}`),
    );
    const actions = el("div", "staff-item-actions");
    actions.append(
      button("Pago ✓", "staff-primary staff-small", () => markPaid(request)),
      button("Cancelar", "staff-ghost staff-small", () => cancel(request)),
    );
    row.append(info, actions);
    return row;
  }));
  els.pendingEmpty.hidden = visible.length > 0;
  els.pendingEmpty.textContent = pending.length && els.search.value.trim()
    ? "Nenhum pedido encontrado com essa busca."
    : "Nenhum pedido aguardando pagamento.";
}

function renderPlayed() {
  els.playedTitle.hidden = played.length === 0;
  els.playedList.replaceChildren(...played.map((request) => {
    const row = el("li", "staff-item");
    const info = el("div", "staff-item-info");
    info.append(
      el("span", "staff-item-time", `Tocou às ${formatClock(request.played_at)}`),
      el("span", "staff-item-song", `${request.code} · ${songLabel(request)}`),
      el("span", "staff-item-customer", request.customer_name),
    );
    row.append(info);
    return row;
  }));
}

function render() {
  const { queue, pending } = splitStaffRequests(requests);
  renderRound();
  renderQueue(queue);
  renderPending(pending);
  renderPlayed();
}

async function refresh() {
  try {
    const [list, state, history] = await Promise.all([
      staffListRequests(""), staffGetSettings(), staffListPlayed().catch(() => played),
    ]);
    requests = list;
    settings = state;
    played = history;
    render();
    if (!busy) setStatus("");
  } catch (error) {
    handleError(error);
  }
}

async function act(action, success) {
  if (busy) return;
  busy = true;
  setStatus("Salvando…");
  try {
    const result = await action();
    setStatus(success);
    await refresh();
    return result;
  } catch (error) {
    handleError(error);
  } finally {
    busy = false;
  }
}

async function markPaid(request) {
  const wasOpen = settings?.queue_open;
  const state = await act(() => staffMarkPaid(request.id), `${request.customer_name} entrou na fila.`);
  if (state && wasOpen && !state.queue_open) setStatus(`${request.customer_name} entrou na fila. Rodada completa: a fila foi fechada.`);
}

function markPlayed(id) {
  const request = requests.find((item) => item.id === id);
  if (!request) return;
  return act(() => staffMarkPlayed(id), `“${displayTitle(request.title)}” saiu da fila.`);
}

function cancel(request) {
  if (!window.confirm(`Cancelar o pedido de ${request.customer_name} (${displayTitle(request.title)})?`)) return;
  return act(() => staffCancel(request.id), "Pedido cancelado.");
}

function roundPayload(extra = {}) {
  const next = nextOccurrence(els.roundNext.value);
  return {
    queueOpen: els.roundOpen.checked,
    roundLimit: Number(els.roundLimit.value) || 0,
    nextRoundAt: next ? next.toISOString() : null,
    message: els.roundMessage.value.trim(),
    ...extra,
  };
}

function selectTab(tab) {
  for (const item of els.tabs) {
    const selected = item === tab;
    item.setAttribute("aria-selected", String(selected));
    document.getElementById(item.getAttribute("aria-controls")).hidden = !selected;
  }
  if (tab.id === "tab-pending") els.search.focus();
  if (tab.id === "tab-results") void loadResults();
  if (tab.id === "tab-round") void loadNightCode();
}

function loadCatalog() {
  catalogPromise ??= fetch(`${import.meta.env.BASE_URL}data/songs.json`)
    .then((response) => (response.ok ? response.json() : []))
    .then((data) => new Map((Array.isArray(data) ? data : data?.songs || []).map((song) => [String(song.code), song])))
    .catch(() => new Map());
  return catalogPromise;
}

function savePendingTicket(ticket) {
  try {
    if (ticket) sessionStorage.setItem(PENDING_TICKET_KEY, JSON.stringify(ticket));
    else sessionStorage.removeItem(PENDING_TICKET_KEY);
  } catch {
    // O cartão continua na tela; só não sobrevive a recarregar a página.
  }
}

function readPendingTicket() {
  try {
    return parseTicketObject(JSON.parse(sessionStorage.getItem(PENDING_TICKET_KEY) || "null"));
  } catch {
    return null;
  }
}

function parseTicketObject(value) {
  if (!value) return null;
  const params = new URLSearchParams({ add: String(value.code || ""), n: String(value.name || ""), t: String(value.ticket || "") });
  return parseTicket(`#${params}`);
}

/** Lê o pedido do link aberto pela câmera do celular (garcom.html#add=…) e limpa o endereço. */
function takeTicketFromUrl() {
  const ticket = parseTicket(window.location.hash);
  if (!window.location.hash) return null;
  history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  return ticket;
}

async function showTicket(ticket) {
  pendingTicket = ticket;
  savePendingTicket(ticket);
  if (els.panel.hidden) return;
  els.ticketCode.textContent = ticket.code;
  els.ticketSong.textContent = "Buscando a música…";
  els.ticketCustomer.textContent = ticket.name || "Cliente sem nome";
  els.ticketConfirm.disabled = false;
  els.ticketCard.hidden = false;
  els.ticketCard.scrollIntoView({ block: "start", behavior: "smooth" });
  els.ticketConfirm.focus({ preventScroll: true });
  const song = (await loadCatalog()).get(ticket.code);
  if (pendingTicket !== ticket) return;
  els.ticketSong.textContent = song ? songLabel(song) : "Código fora do catálogo. Confira com o cliente.";
}

function dismissTicket() {
  pendingTicket = null;
  savePendingTicket(null);
  els.ticketCard.hidden = true;
}

async function confirmTicket() {
  const ticket = pendingTicket;
  if (!ticket) return;
  els.ticketConfirm.disabled = true;
  const wasOpen = settings?.queue_open;
  const label = ticket.name || "O cliente";
  const state = await act(() => staffAddRequest(ticket), `${label} entrou na fila.`);
  els.ticketConfirm.disabled = false;
  if (!state || pendingTicket !== ticket) return;
  dismissTicket();
  if (state.duplicate) setStatus("Esse QR já tinha sido lido: o pedido já está registrado. Não cobre de novo.");
  else if (wasOpen && !state.queue_open) setStatus(`${label} entrou na fila. Rodada completa: a fila foi fechada.`);
}

function stopScanner() {
  clearTimeout(scanTimer);
  scanTimer = null;
  scanStream?.getTracks().forEach((track) => track.stop());
  scanStream = null;
  els.scanVideo.srcObject = null;
}

async function readFrame() {
  const video = els.scanVideo;
  if (video.readyState < 2 || !video.videoWidth) return "";
  if (detector) {
    const codes = await detector.detect(video).catch(() => []);
    return codes[0]?.rawValue || "";
  }
  const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
  const width = Math.round(video.videoWidth * scale);
  const height = Math.round(video.videoHeight * scale);
  const canvas = els.scanCanvas;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(video, 0, 0, width, height);
  const result = jsQR(context.getImageData(0, 0, width, height).data, width, height, { inversionAttempts: "dontInvert" });
  return result?.data || "";
}

async function scanLoop() {
  if (!scanStream) return;
  const text = await readFrame();
  if (!scanStream) return;
  if (text) {
    const ticket = parseTicket(text);
    if (ticket) {
      els.scanDialog.close();
      void showTicket(ticket);
      return;
    }
    els.scanStatus.textContent = "Esse QR não é de um pedido do Bar da Cácia.";
  }
  scanTimer = setTimeout(() => void scanLoop(), SCAN_INTERVAL_MS);
}

async function openScanner() {
  els.scanStatus.textContent = "";
  els.manualCode.value = "";
  els.manualName.value = "";
  if (!els.scanDialog.open) els.scanDialog.showModal();
  if (!navigator.mediaDevices?.getUserMedia) {
    els.scanStatus.textContent = "Este navegador não abre a câmera aqui. Use a câmera do celular ou digite o código.";
    return;
  }
  try {
    if (!detector && !jsQR && "BarcodeDetector" in window) {
      const formats = await window.BarcodeDetector.getSupportedFormats().catch(() => []);
      if (formats.includes("qr_code")) detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    }
    if (!detector) jsQR ??= (await import("jsqr")).default;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    if (!els.scanDialog.open) { stream.getTracks().forEach((track) => track.stop()); return; }
    scanStream = stream;
    els.scanVideo.srcObject = stream;
    await els.scanVideo.play();
    els.scanStatus.textContent = "Aponte para o QR na tela do cliente.";
    void scanLoop();
  } catch {
    stopScanner();
    els.scanStatus.textContent = "Não foi possível abrir a câmera. Permita o acesso ou digite o código abaixo.";
  }
}

function submitManual(event) {
  event.preventDefault();
  const code = els.manualCode.value.trim();
  if (!/^\d{1,6}$/.test(code)) {
    els.scanStatus.textContent = "Digite só os números do código da música.";
    els.manualCode.focus();
    return;
  }
  els.scanDialog.close();
  void showTicket({ code, name: ticketName(els.manualName.value), ticket: newTicketId() });
}

function renderBars(list, rows) {
  if (!rows.length) {
    list.replaceChildren(el("li", "results-empty", "Sem pedidos no período."));
    return;
  }
  list.replaceChildren(...rows.map((row) => {
    const item = el("li", "results-bar");
    const track = el("span", "results-bar-track");
    const fill = el("span", "results-bar-fill");
    fill.style.width = `${row.percent}%`;
    track.append(fill);
    item.append(el("span", "results-bar-label", row.label), track, el("span", "results-bar-value", String(row.value)));
    item.title = `${row.label}: ${row.value}`;
    return item;
  }));
}

async function loadResults() {
  for (const button of els.resultsRanges) button.setAttribute("aria-pressed", String(button.dataset.range === resultsRange));
  els.resultsStatus.textContent = "Carregando…";
  try {
    const metrics = await ownerMetrics(metricsRange(resultsRange));
    els.resultsStatus.textContent = "";
    els.resultsCards.replaceChildren(...metricCards(metrics).map((card) => {
      const node = el("div", "results-card");
      node.append(el("strong", "", card.value), el("span", "", card.label));
      return node;
    }));
    renderBars(els.resultsNights, barRows(metrics.by_night.slice(-14), { label: (item) => nightLabel(item.night) }));
    renderBars(els.resultsWeekdays, barRows(metrics.by_weekday, { label: (item) => weekdayLabel(item.weekday) }));
    renderBars(els.resultsTop, barRows(metrics.top_songs, { label: (item) => `${item.code} · ${songLabel(item)}` }));
    renderBars(els.resultsStaff, barRows(metrics.by_staff, { label: (item) => item.name }));
  } catch (error) {
    els.resultsStatus.textContent = requestErrorMessage(error);
  }
}

async function loadNightCode() {
  const state = await staffGetNightCode().catch(() => null);
  if (!state) return;
  els.nightRequired.checked = Boolean(state.required);
  els.nightCode.value = state.code || "";
}

async function applyRole() {
  const me = await staffWhoami().catch(() => null);
  els.tabResults.hidden = me?.role !== "dono";
}

async function startPanel() {
  els.loginView.hidden = true;
  els.panel.hidden = false;
  els.logout.hidden = false;
  els.scan.hidden = false;
  pendingTicket ??= readPendingTicket();
  if (pendingTicket) void showTicket(pendingTicket);
  void applyRole();
  await refresh();
  clearInterval(timer);
  timer = setInterval(() => { if (!document.hidden && !busy) void refresh(); }, REFRESH_MS);
}

function init() {
  if (!requestsConfigured) {
    els.unconfigured.hidden = false;
    return;
  }
  els.loginView.addEventListener("submit", async (event) => {
    event.preventDefault();
    els.loginButton.disabled = true;
    els.loginStatus.textContent = "Entrando…";
    try {
      await staffSignIn(els.email.value.trim(), els.password.value);
      els.password.value = "";
      els.loginStatus.textContent = "";
      await startPanel();
    } catch (error) {
      els.loginStatus.textContent = error.message || "Não foi possível entrar.";
    } finally {
      els.loginButton.disabled = false;
    }
  });
  els.logout.addEventListener("click", () => { dismissTicket(); staffSignOut(); showLogin(); });
  els.scan.addEventListener("click", () => void openScanner());
  els.scanClose.addEventListener("click", () => els.scanDialog.close());
  els.scanDialog.addEventListener("close", stopScanner);
  els.manualForm.addEventListener("submit", submitManual);
  els.ticketConfirm.addEventListener("click", () => void confirmTicket());
  els.ticketDismiss.addEventListener("click", dismissTicket);
  els.nightGenerate.addEventListener("click", () => { els.nightCode.value = randomNightCode(); });
  els.nightForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = normalizeNightCode(els.nightCode.value);
    const state = await act(() => staffSetNightCode({ required: els.nightRequired.checked, code }), "Código da noite salvo.");
    if (state) {
      els.nightRequired.checked = Boolean(state.required);
      els.nightCode.value = state.code || "";
    }
  });
  els.resultsRanges.forEach((button) => button.addEventListener("click", () => {
    resultsRange = button.dataset.range;
    void loadResults();
  }));
  window.addEventListener("hashchange", () => {
    const ticket = takeTicketFromUrl();
    if (ticket) void showTicket(ticket);
  });
  els.tabs.forEach((tab) => tab.addEventListener("click", () => selectTab(tab)));
  els.nextPlayed.addEventListener("click", () => markPlayed(Number(els.nextPlayed.dataset.id)));
  els.nextCancel.addEventListener("click", () => {
    const request = requests.find((item) => item.id === Number(els.nextCancel.dataset.id));
    if (request) void cancel(request);
  });
  els.search.addEventListener("input", () => renderPending(splitStaffRequests(requests).pending));
  els.roundForm.addEventListener("input", () => { roundFormDirty = true; });
  els.roundForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    roundFormDirty = false;
    await act(() => staffUpdateSettings(roundPayload()), "Rodada atualizada.");
  });
  els.roundNew.addEventListener("click", async () => {
    if (!window.confirm("Começar uma nova rodada? As vagas voltam a zero e a fila abre para pedidos.")) return;
    roundFormDirty = false;
    await act(() => staffUpdateSettings(roundPayload({ queueOpen: true, nextRoundAt: null, newRound: true })), "Nova rodada aberta.");
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && timer) void refresh(); });

  const fromUrl = takeTicketFromUrl();
  if (fromUrl) {
    pendingTicket = fromUrl;
    savePendingTicket(fromUrl);
  }
  getStaffSession()
    .then((session) => (session ? startPanel() : showLogin(pendingTicket ? "Entre para registrar o pedido lido no QR." : "")))
    .catch(() => showLogin());
}

init();
