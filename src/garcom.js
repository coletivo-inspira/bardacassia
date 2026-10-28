import "./garcom.css";
import {
  getStaffSession, requestsConfigured, staffCancel, staffGetSettings, staffListRequests, staffMarkPaid,
  staffMarkPlayed, staffSignIn, staffSignOut, staffUpdateSettings,
} from "./integrations/requests.js";
import {
  filterStaffRequests, formatClock, formatPhone, nextOccurrence, requestErrorMessage, roundSummary, splitStaffRequests,
} from "./lib/requests.js";

const REFRESH_MS = 10000;

const $ = (selector) => document.querySelector(selector);
const els = {
  unconfigured: $("#staff-unconfigured"),
  logout: $("#staff-logout"),
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
};

let requests = [];
let settings = null;
let timer = null;
let busy = false;
let roundFormDirty = false;

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

function songLine(request) {
  return `${request.title} — ${request.artist}`;
}

function customerLine(request) {
  return `${request.customer_name} · ${formatPhone(request.customer_phone)}`;
}

function setStatus(message) {
  els.status.textContent = message || "";
}

function showLogin(message = "") {
  clearInterval(timer);
  timer = null;
  els.panel.hidden = true;
  els.logout.hidden = true;
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
    els.nextSong.textContent = songLine(next);
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
      el("span", "staff-item-song", songLine(request)),
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
      el("span", "staff-item-song", `${request.code} · ${songLine(request)}`),
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

function render() {
  const { queue, pending } = splitStaffRequests(requests);
  renderRound();
  renderQueue(queue);
  renderPending(pending);
}

async function refresh() {
  try {
    const [list, state] = await Promise.all([staffListRequests(""), staffGetSettings()]);
    requests = list;
    settings = state;
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
  return act(() => staffMarkPlayed(id), `“${request.title}” saiu da fila.`);
}

function cancel(request) {
  if (!window.confirm(`Cancelar o pedido de ${request.customer_name} (${request.title})?`)) return;
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
}

async function startPanel() {
  els.loginView.hidden = true;
  els.panel.hidden = false;
  els.logout.hidden = false;
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
  els.logout.addEventListener("click", () => { staffSignOut(); showLogin(); });
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

  getStaffSession()
    .then((session) => (session ? startPanel() : showLogin()))
    .catch(() => showLogin());
}

init();
