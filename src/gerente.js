import "./gerente.css";
import {
  getStaffSession, ownerMetrics, requestsConfigured, staffGetNightCode, staffGetSettings, staffListPlayed,
  staffListRequests, staffSignIn, staffSignOut, staffWhoami,
} from "./integrations/requests.js";
import { barRows, metricCards, metricsRange, nightLabel, weekdayLabel } from "./lib/metrics.js";
import { filterTopSongs, funnelRows, localManagerSnapshot, periodHasActivity } from "./lib/manager-board.js";
import { requestErrorMessage, roundSummary, songLabel, splitStaffRequests } from "./lib/requests.js";

const REFRESH_MS = 30000;
const $ = (selector) => document.querySelector(selector);

const els = {
  boot: $("#boot-status"),
  subtitle: $("#mgr-subtitle"),
  badge: $("#source-badge"),
  logout: $("#mgr-logout"),
  ranges: [...document.querySelectorAll(".range-switch .range-button")],
  loginView: $("#login-view"),
  loginForm: $("#login-form"),
  email: $("#staff-email"),
  password: $("#staff-password"),
  loginButton: $("#staff-login"),
  loginStatus: $("#login-status"),
  deniedView: $("#denied-view"),
  deniedCopy: $("#denied-copy"),
  deniedLogout: $("#denied-logout"),
  board: $("#board"),
  banner: $("#sample-banner"),
  variantCheio: $("#variant-cheio"),
  variantVazio: $("#variant-vazio"),
  status: $("#board-status"),
  kpis: $("#kpi-grid"),
  nowGrid: $("#now-grid"),
  nowMessage: $("#now-message"),
  nights: $("#nights-list"),
  weekdays: $("#weekdays-list"),
  funnel: $("#funnel-list"),
  songSearch: $("#song-search"),
  songs: $("#songs-list"),
  staff: $("#staff-list"),
  queue: $("#queue-list"),
  pending: $("#pending-list"),
  played: $("#played-list"),
};

let rangeId = "30d";
let variant = "cheio";
let songQuery = "";
let snapshot = null;
let timer = null;
let me = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function show(node, visible) {
  node.hidden = !visible;
}

function setPressed(buttons, key, attr) {
  for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset[attr] === key));
}

function emptyNote(text) {
  return el("li", "empty-note", text);
}

function renderBars(list, rows, emptyText) {
  if (!rows.length) {
    list.replaceChildren(emptyNote(emptyText));
    return;
  }
  list.replaceChildren(...rows.map((row) => {
    const item = el("li", "bar-row");
    const track = el("span", "bar-track");
    const fill = el("span", "bar-fill");
    fill.style.width = `${row.percent}%`;
    track.append(fill);
    item.append(el("span", "bar-label", row.label), track, el("span", "bar-value", String(row.value)));
    item.title = `${row.label}: ${row.value}`;
    return item;
  }));
}

function renderSongs(songs) {
  const rows = filterTopSongs(songs, songQuery);
  if (!songs?.length) {
    els.songs.replaceChildren(emptyNote("Nenhuma música pedida neste período."));
    return;
  }
  if (!rows.length) {
    els.songs.replaceChildren(emptyNote("Nenhuma música com esse filtro."));
    return;
  }
  els.songs.replaceChildren(...rows.map((song) => {
    const item = el("li", "song-row");
    const copy = el("div");
    copy.append(el("p", "song-title", songLabel(song)), el("p", "song-meta", `${song.requests} pedidos`));
    item.append(el("span", "song-code", String(song.code)), copy);
    return item;
  }));
}

function renderQueue(list, rows, emptyText) {
  if (!rows?.length) {
    list.replaceChildren(emptyNote(emptyText));
    return;
  }
  list.replaceChildren(...rows.map((row) => {
    const item = el("li", "queue-row");
    const copy = el("div");
    copy.append(el("p", "queue-title", songLabel(row)));
    if (row.customer_name) copy.append(el("p", "queue-customer", row.customer_name));
    item.append(el("span", "queue-code", String(row.code)), copy);
    return item;
  }));
}

function filaDetail(floor) {
  const summary = roundSummary(floor);
  const extra = summary.split("·").slice(1).join("·").trim();
  return extra;
}

function renderNow(floor) {
  const night = floor?.night || {};
  const code = night.code ? night.code : "Livre";
  const cards = [
    {
      label: "Fila",
      value: floor ? (floor.queue_open ? "Aberta" : "Fechada") : "—",
      detail: filaDetail(floor),
      open: floor ? String(Boolean(floor.queue_open)) : "",
    },
    { label: "Código da noite", value: night.required ? code : "Não exigido" },
    { label: "Na fila", value: String(floor?.queue?.length || 0) },
    { label: "A pagar", value: String(floor?.pending?.length || 0) },
    { label: "Tocadas hoje", value: String(floor?.played?.length || 0) },
  ];
  els.nowGrid.replaceChildren(...cards.map((card) => {
    const node = el("article", "now-card");
    if (card.open) node.dataset.open = card.open;
    node.append(el("span", "", card.label), el("strong", "", card.value));
    if (card.detail) node.append(el("small", "now-detail", card.detail));
    return node;
  }));
  const message = String(floor?.message || "").trim();
  els.nowMessage.textContent = message;
  show(els.nowMessage, Boolean(message));
}

function renderBoard(next) {
  snapshot = next;
  const local = next.source === "local";
  els.badge.textContent = local ? "Exemplo local" : "Ao vivo";
  els.badge.dataset.source = next.source;
  els.subtitle.textContent = local ? "Exemplo neste navegador" : (me?.name ? `Olá, ${me.name}` : "Conta do gerente");
  show(els.banner, local);
  show(els.logout, !local);
  setPressed(els.ranges, next.rangeId, "range");
  setPressed([els.variantCheio, els.variantVazio], next.variant || "cheio", "variant");
  els.kpis.replaceChildren(...metricCards(next.metrics).map((card) => {
    const node = el("article", "kpi glass");
    node.append(el("span", "", card.label), el("strong", "", card.value));
    return node;
  }));
  renderNow(next.floor);
  const nights = (next.metrics.by_night || []).slice(-14);
  renderBars(els.nights, barRows(nights, { label: (item) => nightLabel(item.night), value: (item) => item.requests }), "Sem pedidos no período.");
  renderBars(
    els.weekdays,
    barRows(next.metrics.by_weekday || [], { label: (item) => weekdayLabel(item.weekday), value: (item) => item.requests }),
    "Sem pedidos no período.",
  );
  renderBars(els.funnel, funnelRows(next.metrics), "Nenhum pedido neste período.");
  renderSongs(next.metrics.top_songs || []);
  renderBars(
    els.staff,
    barRows(next.metrics.by_staff || [], { label: (item) => item.name, value: (item) => item.requests }),
    "Nenhum pedido lançado por garçom.",
  );
  renderQueue(els.queue, next.floor.queue, "Nenhuma música na fila agora.");
  renderQueue(els.pending, next.floor.pending, "Nada aguardando pagamento.");
  renderQueue(els.played, next.floor.played, "Nenhuma música tocou nesta noite.");
  show(els.board, true);
  show(els.loginView, false);
  show(els.deniedView, false);
  show(els.boot, false);
}

function showLogin(message = "") {
  clearInterval(timer);
  timer = null;
  show(els.boot, false);
  show(els.board, false);
  show(els.deniedView, false);
  show(els.loginView, true);
  show(els.logout, false);
  els.badge.textContent = "Ao vivo";
  els.badge.dataset.source = "live";
  els.subtitle.textContent = "Bar da Cácia";
  els.loginStatus.textContent = message;
}

function showDenied(person) {
  clearInterval(timer);
  timer = null;
  const role = person?.role === "garcom" ? "garçom" : "sem o papel de dono";
  els.deniedCopy.textContent = person?.name
    ? `${person.name}, sua conta está como ${role}. Este painel fica com o gerente.`
    : "Sua conta não abre o painel do gerente. Ele fica com quem tem o papel de dono.";
  show(els.boot, false);
  show(els.board, false);
  show(els.loginView, false);
  show(els.deniedView, true);
  show(els.logout, false);
  els.badge.textContent = "Ao vivo";
  els.badge.dataset.source = "live";
}

async function loadLive() {
  els.status.textContent = snapshot ? "Atualizando…" : "";
  const [metrics, settings, night, requests, played] = await Promise.all([
    ownerMetrics(metricsRange(rangeId)),
    staffGetSettings(),
    staffGetNightCode(),
    staffListRequests(""),
    staffListPlayed(),
  ]);
  const split = splitStaffRequests(requests);
  renderBoard({
    source: "live",
    rangeId,
    metrics,
    floor: {
      ...settings,
      night: night || { required: false, code: "" },
      queue: split.queue,
      pending: split.pending,
      played,
    },
  });
  els.status.textContent = periodHasActivity(metrics) ? "" : "Nenhum pedido pago neste período.";
}

function loadLocal() {
  renderBoard(localManagerSnapshot(rangeId, { variant }));
  els.status.textContent = "";
}

async function refresh() {
  if (!requestsConfigured) {
    loadLocal();
    return;
  }
  try {
    await loadLive();
  } catch (error) {
    els.status.textContent = requestErrorMessage(error);
    show(els.boot, false);
    if (!snapshot) show(els.board, true);
  }
}

function watchLive() {
  clearInterval(timer);
  timer = setInterval(() => {
    if (!document.hidden) void refresh();
  }, REFRESH_MS);
}

async function enterPanel() {
  me = await staffWhoami();
  if (me?.role !== "dono") {
    showDenied(me);
    return;
  }
  await refresh();
  watchLive();
}

function init() {
  els.ranges.forEach((button) => button.addEventListener("click", () => {
    rangeId = button.dataset.range;
    setPressed(els.ranges, rangeId, "range");
    if (!requestsConfigured) loadLocal();
    else void refresh();
  }));
  for (const button of [els.variantCheio, els.variantVazio]) {
    button.addEventListener("click", () => {
      variant = button.dataset.variant;
      loadLocal();
    });
  }
  els.songSearch.addEventListener("input", () => {
    songQuery = els.songSearch.value;
    if (snapshot) renderSongs(snapshot.metrics.top_songs || []);
  });
  els.logout.addEventListener("click", () => { staffSignOut(); showLogin(); });
  els.deniedLogout.addEventListener("click", () => { staffSignOut(); showLogin(); });
  els.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    els.loginButton.disabled = true;
    els.loginStatus.textContent = "Entrando…";
    try {
      await staffSignIn(els.email.value.trim(), els.password.value);
      els.password.value = "";
      els.loginStatus.textContent = "";
      await enterPanel();
    } catch (error) {
      els.loginStatus.textContent = error.message || "Não foi possível entrar.";
    } finally {
      els.loginButton.disabled = false;
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && timer) void refresh();
  });

  if (!requestsConfigured) {
    loadLocal();
    return;
  }
  getStaffSession()
    .then((session) => (session ? enterPanel() : showLogin()))
    .catch(() => showLogin());
}

init();
