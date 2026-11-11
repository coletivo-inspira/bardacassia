import "./admin.css";
import {
  authBackendReady,
  buildAuthProviders,
  displayName,
  getCurrentUser,
  signIn,
  signOut,
} from "./integrations/auth.js";
import {
  loadSiteFeatures,
  peekSitePayload,
  saveSiteFeatures,
  saveSitePalette,
} from "./integrations/features.js";
import { getMyRole } from "./integrations/profile.js";
import {
  ownerMetrics,
  staffCancel,
  staffGetNightCode,
  staffGetSettings,
  staffMarkPaid,
  staffMarkPlayed,
  staffSetNightCode,
  staffUpdateSettings,
} from "./integrations/requests.js";
import {
  adminDbOverview,
  adminInspectTable,
  adminListAuditLogs,
  adminListRequests,
  adminListUsers,
  adminSaveRuntimeParams,
  adminUpdateUserAccess,
} from "./integrations/admin.js";
import { getFeatures } from "./lib/feature-state.js";
import {
  FEATURE_SWITCHES,
  RUNTIME_PARAM_BOUNDS,
  SITE_NOTICE_MAX,
  defaultThemeOf,
  effectiveAuthProviders,
  maxPendingPerUserOf,
  maxPendingTotalOf,
  pendingExpireMinutesOf,
  popularLimitOf,
  requestModeOf,
  siteNoticeOf,
  storedAuthProviders,
  validateRuntimeParams,
  writeLimitPerMinuteOf,
} from "./lib/features.js";
import {
  LOGO_PALETTE,
  PALETTE_THEMES,
  PALETTE_TOKENS,
  applyPalette,
  isHexColor,
  mergePalette,
} from "./lib/palette.js";
import { authErrorMessage } from "./lib/auth-validation.js";
import { profileInitials } from "./lib/profile.js";
import { barRows, formatCount, nightLabel, weekdayLabel } from "./lib/metrics.js";
import { funnelRows } from "./lib/manager-board.js";
import {
  formatClock,
  nextOccurrence,
  normalizeNightCode,
  randomNightCode,
  roundSummary,
  songLabel,
} from "./lib/requests.js";
import {
  ADMIN_ROLE_FILTERS,
  AUDIT_CATEGORIES,
  INSPECTABLE_TABLES,
  REQUEST_ORIGIN_FILTERS,
  REQUEST_STATUS_FILTERS,
  ROLE_LABELS,
  ROLE_OPTIONS,
  adminDbHealthItems,
  adminErrorMessage,
  adminKpiCards,
  adminMetricsRange,
  adminTabHash,
  auditActionSummary,
  auditCategoryLabel,
  consentBadgeInfo,
  defaultStaffNameForUser,
  formatAuditDetails,
  formatSaoPauloDateTime,
  formatTableCell,
  isStaffCapableRole,
  requestStatusBadge,
  resolveAdminTab,
  resolveDataSubtab,
  shortUuid,
} from "./lib/admin-view.js";

const ADMIN_SURFACE_KEY = "bdc-admin-surface-v1";
const SPOTIFY_CLIENT_ID = String(import.meta.env.VITE_SPOTIFY_CLIENT_ID || "").trim();
const USERS_PAGE_SIZE = 24;
const REQUESTS_PAGE_SIZE = 30;
const INSPECT_PAGE_SIZE = 30;
const AUDIT_PAGE_SIZE = 40;

const $ = (selector) => document.querySelector(selector);

const els = {
  actorSubtitle: $("#admin-actor-subtitle"),
  surfaceToggle: $("#admin-surface-toggle"),
  surfaceLabel: $("#admin-surface-label"),
  refreshBtn: $("#admin-refresh"),
  logoutBtn: $("#admin-logout"),
  unconfigured: $("#admin-unconfigured"),
  loginView: $("#login-view"),
  loginButton: $("#admin-login"),
  loginStatus: $("#login-status"),
  email: $("#admin-email"),
  password: $("#admin-password"),
  deniedView: $("#denied-view"),
  deniedLogout: $("#denied-logout"),
  panelView: $("#panel-view"),
  tabbar: $("#admin-tabbar"),
  tabs: [...document.querySelectorAll("#admin-tabbar .admin-tab")],

  // Aba 1: Visão Geral
  visaoRanges: [...document.querySelectorAll("#visao-ranges .pill-btn")],
  visaoLiveStrip: $("#visao-live-strip"),
  visaoStatus: $("#visao-status"),
  visaoKpis: $("#visao-kpis"),
  chartNights: $("#chart-nights"),
  chartFunnel: $("#chart-funnel"),
  chartWeekdays: $("#chart-weekdays"),
  chartStaff: $("#chart-staff"),
  chartTopSongs: $("#chart-top-songs"),
  visaoHealth: $("#visao-health"),

  // Aba 2: Configurações
  featuresForm: $("#features-form"),
  featureGroups: $("#feature-groups"),
  providersSection: $("#providers-section"),
  providerSwitches: $("#provider-switches"),
  adminStatus: $("#admin-status"),
  barOpsForm: $("#bar-ops-form"),
  cfgQueueOpen: $("#cfg-queue-open"),
  cfgRoundLimit: $("#cfg-round-limit"),
  cfgNextRound: $("#cfg-next-round"),
  cfgBarMessage: $("#cfg-bar-message"),
  cfgNewRound: $("#cfg-new-round"),
  barOpsStatus: $("#bar-ops-status"),
  nightCodeForm: $("#night-code-form"),
  cfgNightRequired: $("#cfg-night-required"),
  cfgNightCode: $("#cfg-night-code"),
  cfgNightGenerate: $("#cfg-night-generate"),
  nightCodeStatus: $("#night-code-status"),
  runtimeParamsForm: $("#runtime-params-form"),
  paramSiteNotice: $("#param-site-notice"),
  paramNoticeCount: $("#param-notice-count"),
  paramNoticeClear: $("#param-notice-clear"),
  paramPendingExpire: $("#param-pending-expire"),
  paramMaxUser: $("#param-max-user"),
  paramMaxTotal: $("#param-max-total"),
  paramWriteLimit: $("#param-write-limit"),
  paramPopularLimit: $("#param-popular-limit"),
  paramResetDefaults: $("#param-reset-defaults"),
  runtimeParamsStatus: $("#runtime-params-status"),

  // Aba 3: Aparência
  defaultThemeButtons: [...document.querySelectorAll("#default-theme-group [data-default-theme]")],
  saveDefaultTheme: $("#save-default-theme"),
  defaultThemeStatus: $("#default-theme-status"),
  paletteForm: $("#palette-form"),
  paletteFields: $("#palette-fields"),
  paletteReset: $("#palette-reset"),
  paletteStatus: $("#palette-status"),
  previewThemeButtons: [...document.querySelectorAll("#preview-theme-switch [data-pv-theme]")],
  paletteMiniPreview: $("#palette-mini-preview"),

  // Aba 4: Acessos
  usersRolePills: $("#users-role-pills"),
  usersSearch: $("#users-search"),
  roleStatus: $("#role-status"),
  usersList: $("#users-list"),
  roleEmpty: $("#role-empty"),
  usersPagination: $("#users-pagination"),
  usersPageInfo: $("#users-page-info"),
  usersPrev: $("#users-prev"),
  usersNext: $("#users-next"),

  // Aba 5: Pedidos, Tabelas e Logs
  dataSubtabButtons: [...document.querySelectorAll("#data-subtabs [data-subtab]")],
  subpanelRequests: $("#subpanel-requests"),
  subpanelTabelas: $("#subpanel-tabelas"),
  subpanelLogs: $("#subpanel-logs"),

  reqStatusFilter: $("#req-status-filter"),
  reqOriginFilter: $("#req-origin-filter"),
  reqSearch: $("#req-search"),
  reqRefresh: $("#req-refresh"),
  reqStatusMsg: $("#req-status-msg"),
  reqList: $("#req-list"),
  reqEmpty: $("#req-empty"),
  reqPagination: $("#req-pagination"),
  reqPageInfo: $("#req-page-info"),
  reqPrev: $("#req-prev"),
  reqNext: $("#req-next"),

  inspectTableSelect: $("#inspect-table-select"),
  inspectSearch: $("#inspect-search"),
  inspectCountBadge: $("#inspect-count-badge"),
  inspectRefresh: $("#inspect-refresh"),
  inspectDescription: $("#inspect-description"),
  inspectStatusMsg: $("#inspect-status-msg"),
  inspectThead: $("#inspect-thead"),
  inspectTbody: $("#inspect-tbody"),
  inspectEmpty: $("#inspect-empty"),
  inspectPagination: $("#inspect-pagination"),
  inspectPageInfo: $("#inspect-page-info"),
  inspectPrev: $("#inspect-prev"),
  inspectNext: $("#inspect-next"),

  auditCategoryFilter: $("#audit-category-filter"),
  auditSearch: $("#audit-search"),
  auditRefresh: $("#audit-refresh"),
  auditStatusMsg: $("#audit-status-msg"),
  auditList: $("#audit-list"),
  auditEmpty: $("#audit-empty"),
  auditPagination: $("#audit-pagination"),
  auditPageInfo: $("#audit-page-info"),
  auditPrev: $("#audit-prev"),
  auditNext: $("#audit-next"),
};

const state = {
  panelReady: false,
  activeTab: resolveAdminTab(window.location.hash),
  visaoRange: "30d",
  defaultThemeDraft: "auto",
  previewTheme: "light",
  paletteResetPending: false,
  usersRole: "",
  usersSearch: "",
  usersOffset: 0,
  usersTotal: 0,
  usersCounts: { all: 0, admin: 0, dono: 0, garcom: 0, cliente: 0 },
  dataSubtab: "requests",
  reqStatus: "",
  reqOrigin: "",
  reqSearch: "",
  reqOffset: 0,
  reqTotal: 0,
  inspectTable: "song_requests",
  inspectSearch: "",
  inspectOffset: 0,
  inspectTotal: 0,
  auditCategory: "",
  auditSearch: "",
  auditOffset: 0,
  auditTotal: 0,
  loadedTabs: new Set(),
};

let draftFeatures = null;

function el(tag, className = "", text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function debounce(fn, delay = 240) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

function setFeedback(node, message = "", tone = "") {
  if (!node) return;
  node.textContent = message;
  if (tone) node.dataset.tone = tone;
  else delete node.dataset.tone;
}

function setSwitchChecked(btn, checked) {
  if (!btn) return;
  btn.setAttribute("aria-checked", String(Boolean(checked)));
}

function isSwitchChecked(btn) {
  return btn?.getAttribute("aria-checked") === "true";
}

function bindSwitchButton(btn, onChange) {
  if (!btn) return;
  btn.addEventListener("click", () => {
    const next = !isSwitchChecked(btn);
    setSwitchChecked(btn, next);
    onChange?.(next);
  });
}

function createSwitchRow({ label, hint = "", checked = false, dataset = {}, onChange }) {
  const row = el("div", "switch-row");
  const copy = el("span", "switch-copy");
  copy.append(el("strong", "", label));
  if (hint) copy.append(el("small", "", hint));

  const btn = el("button", "glass-switch");
  btn.type = "button";
  btn.setAttribute("role", "switch");
  btn.setAttribute("aria-label", label);
  setSwitchChecked(btn, checked);
  for (const [key, value] of Object.entries(dataset)) {
    btn.dataset[key] = value;
  }
  bindSwitchButton(btn, onChange);
  row.append(copy, btn);
  return { row, btn };
}

/* Superfície clara/noturna do próprio console */
function currentAdminSurface() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function paintAdminSurfaceControls() {
  const dark = currentAdminSurface() === "dark";
  els.surfaceToggle?.setAttribute("aria-pressed", String(dark));
  if (els.surfaceLabel) {
    els.surfaceLabel.textContent = dark ? "Modo claro" : "Pré-ver noturno";
  }
}

function setAdminSurface(theme) {
  const next = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(ADMIN_SURFACE_KEY, next);
  } catch {
    /* persiste apenas na memória da aba */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = next === "dark" ? "#09191f" : "#eef7f6";
  paintAdminSurfaceControls();
}

/* Navegação de abas + pílula deslizante */
function syncTabPill() {
  if (!els.tabbar || els.panelView.hidden) return;
  const active = els.tabs.find((tab) => tab.dataset.tab === state.activeTab);
  if (!active) return;
  const barRect = els.tabbar.getBoundingClientRect();
  const tabRect = active.getBoundingClientRect();
  if (!barRect.width || !tabRect.width) return;
  const x = Math.max(0, tabRect.left - barRect.left + els.tabbar.scrollLeft);
  els.tabbar.style.setProperty("--tab-pill-x", `${x}px`);
  els.tabbar.style.setProperty("--tab-pill-w", `${tabRect.width}px`);
  els.tabbar.classList.add("has-pill");
}

function showView(view) {
  els.unconfigured.hidden = view !== "unconfigured";
  els.loginView.hidden = view !== "login";
  els.deniedView.hidden = view !== "denied";
  els.panelView.hidden = view !== "panel";
  els.logoutBtn.hidden = view === "unconfigured" || view === "login";
  els.refreshBtn.hidden = view !== "panel";
  if (view === "panel") {
    requestAnimationFrame(syncTabPill);
  }
}

async function activateTab(tabId, { updateHash = false, forceLoad = false } = {}) {
  const resolved = resolveAdminTab(tabId);
  state.activeTab = resolved;

  if (updateHash) {
    const targetHash = adminTabHash(resolved);
    if (window.location.hash !== targetHash) {
      history.replaceState(null, "", targetHash);
    }
  }

  for (const tab of els.tabs) {
    const selected = tab.dataset.tab === resolved;
    tab.setAttribute("aria-selected", String(selected));
    const panel = document.getElementById(tab.getAttribute("aria-controls"));
    if (panel) panel.hidden = !selected;
  }

  requestAnimationFrame(syncTabPill);

  if (!state.panelReady) return;
  if (forceLoad || !state.loadedTabs.has(resolved)) {
    state.loadedTabs.add(resolved);
    await refreshActiveTab();
  }
}

async function refreshActiveTab() {
  switch (state.activeTab) {
    case "visao":
      await loadVisaoTab();
      break;
    case "config":
      await loadConfigTab();
      break;
    case "aparencia":
      renderAparenciaTab();
      break;
    case "acessos":
      await loadUsersTab();
      break;
    case "banco-logs":
      await loadCurrentDataSubtab();
      break;
    default:
      break;
  }
}

/* =========================================================================
   ABA 1: VISÃO GERAL E RELATÓRIOS
   ========================================================================= */
function renderGlassBars(listEl, rows, emptyMessage = "Sem movimento registrado neste período.") {
  if (!listEl) return;
  if (!rows?.length) {
    listEl.replaceChildren(el("li", "empty-state-admin", emptyMessage));
    return;
  }
  listEl.replaceChildren(
    ...rows.map((row) => {
      const li = el("li", "glass-bar-row");
      const track = el("span", "glass-bar-track");
      const fill = el("span", "glass-bar-fill");
      fill.style.width = `${row.percent}%`;
      track.append(fill);
      li.append(
        el("span", "glass-bar-label", row.label),
        track,
        el("span", "glass-bar-value", formatCount(row.value)),
      );
      li.title = `${row.label}: ${row.value}`;
      return li;
    }),
  );
}

function renderLiveBarStrip(overview) {
  const bar = overview?.bar_settings;
  if (!bar) {
    els.visaoLiveStrip.replaceChildren(el("span", "badge", "Operação sem leitura no momento"));
    return;
  }
  const openBadge = el("span", "badge", bar.queue_open ? "Fila aberta" : "Fila fechada");
  openBadge.dataset.tone = bar.queue_open ? "teal" : "coral";

  const summary = el("span", "card-subtitle", roundSummary(bar));
  const nightBadge = el(
    "span",
    "badge",
    bar.night_code_required
      ? `Código da noite ativo (${bar.night_code})`
      : "Código da noite livre",
  );
  nightBadge.dataset.tone = bar.night_code_required ? "amber" : "sky";

  const nodes = [openBadge, summary, nightBadge];
  if (bar.message) {
    const msg = el("span", "badge", `Aviso: ${bar.message}`);
    msg.dataset.tone = "muted";
    nodes.push(msg);
  }
  els.visaoLiveStrip.replaceChildren(...nodes);
}

async function loadVisaoTab() {
  for (const btn of els.visaoRanges) {
    btn.setAttribute("aria-pressed", String(btn.dataset.range === state.visaoRange));
  }
  setFeedback(els.visaoStatus, "Atualizando relatórios…");

  try {
    const range = adminMetricsRange(state.visaoRange);
    const [metrics, overview] = await Promise.all([
      ownerMetrics(range),
      adminDbOverview().catch(() => null),
    ]);

    setFeedback(els.visaoStatus, "");
    renderLiveBarStrip(overview);

    els.visaoKpis.replaceChildren(
      ...adminKpiCards(metrics, overview).map((card) => {
        const tile = el("article", "glass-card kpi-tile");
        tile.dataset.tone = card.tone || "sky";
        tile.append(el("span", "", card.label), el("strong", "", card.value));
        return tile;
      }),
    );

    const nights = (metrics?.by_night || []).slice(-14);
    renderGlassBars(
      els.chartNights,
      barRows(nights, { label: (item) => nightLabel(item.night), value: (item) => item.requests }),
    );
    renderGlassBars(els.chartFunnel, funnelRows(metrics), "Nenhum pedido registrado no período.");
    renderGlassBars(
      els.chartWeekdays,
      barRows(metrics?.by_weekday || [], {
        label: (item) => weekdayLabel(item.weekday),
        value: (item) => item.requests,
      }),
    );
    renderGlassBars(
      els.chartStaff,
      barRows(metrics?.by_staff || [], {
        label: (item) => item.name,
        value: (item) => item.requests,
      }),
      "Nenhum pedido lançado por garçom no período.",
    );
    renderGlassBars(
      els.chartTopSongs,
      barRows(metrics?.top_songs || [], {
        label: (item) => `${item.code} · ${songLabel(item)}`,
        value: (item) => item.requests,
      }),
      "Nenhuma música pedida neste período.",
    );

    const health = adminDbHealthItems(overview);
    if (health.length) {
      els.visaoHealth.replaceChildren(
        ...health.map((item) => {
          const card = el("article", "health-item");
          card.append(
            el("span", "", item.label),
            el("strong", "", item.value),
            el("small", "", item.detail),
          );
          return card;
        }),
      );
    } else {
      els.visaoHealth.replaceChildren(
        el("p", "card-subtitle", "Aplique a migração 012 para visualizar o resumo completo das tabelas."),
      );
    }
  } catch (error) {
    setFeedback(els.visaoStatus, adminErrorMessage(error), "error");
  }
}

/* =========================================================================
   ABA 2: CONFIGURAÇÕES SEM DEPLOY
   ========================================================================= */
function renderFeatureSwitches() {
  const features = draftFeatures || getFeatures();
  const visible = FEATURE_SWITCHES.filter((item) => item.id !== "spotify" || SPOTIFY_CLIENT_ID);
  const groups = [];
  for (const item of visible) {
    const existing = groups.find((entry) => entry.name === item.group);
    if (existing) existing.items.push(item);
    else groups.push({ name: item.group, items: [item] });
  }

  els.featureGroups.replaceChildren(
    ...groups.map((group) => {
      const card = el("div", "glass-card card-pad");
      card.append(el("h3", "card-title", group.name));
      for (const item of group.items) {
        const { row } = createSwitchRow({
          label: item.label,
          checked: Boolean(features[item.id]),
          dataset: { feature: item.id },
        });
        card.append(row);
      }
      return card;
    }),
  );

  const mode = requestModeOf(features);
  document.querySelectorAll('input[name="request-mode"]').forEach((input) => {
    input.checked = input.value === mode;
  });

  const build = buildAuthProviders();
  els.providersSection.hidden = build.length === 0;
  if (build.length) {
    const selected = new Set(effectiveAuthProviders(features, build));
    els.providerSwitches.replaceChildren(
      ...build.map((name) => {
        const caption = name.charAt(0).toUpperCase() + name.slice(1);
        return createSwitchRow({
          label: caption,
          checked: selected.has(name),
          dataset: { provider: name },
        }).row;
      }),
    );
  }
}

function readFeaturesForm() {
  const next = { ...draftFeatures };
  document.querySelectorAll("[data-feature]").forEach((btn) => {
    next[btn.dataset.feature] = isSwitchChecked(btn);
  });
  const mode = document.querySelector('input[name="request-mode"]:checked');
  if (mode) next.request_mode = mode.value === "remoto" ? "remoto" : "qr";
  const build = buildAuthProviders();
  if (build.length) {
    const checked = [...document.querySelectorAll("[data-provider]")]
      .filter((btn) => isSwitchChecked(btn))
      .map((btn) => btn.dataset.provider);
    next.auth_providers = storedAuthProviders(checked, build);
  }
  return next;
}

function updateNoticeCounter() {
  const len = String(els.paramSiteNotice?.value || "").length;
  if (els.paramNoticeCount) {
    els.paramNoticeCount.textContent = `${len} / ${SITE_NOTICE_MAX} caracteres`;
  }
}

function populateRuntimeParamsForm(features = getFeatures()) {
  els.paramSiteNotice.value = siteNoticeOf(features);
  els.paramPendingExpire.value = String(pendingExpireMinutesOf(features));
  els.paramMaxUser.value = String(maxPendingPerUserOf(features));
  els.paramMaxTotal.value = String(maxPendingTotalOf(features));
  els.paramWriteLimit.value = String(writeLimitPerMinuteOf(features));
  els.paramPopularLimit.value = String(popularLimitOf(features));
  updateNoticeCounter();
}

async function loadBarOperationControls() {
  try {
    const [settings, night] = await Promise.all([
      staffGetSettings(),
      staffGetNightCode(),
    ]);
    if (settings) {
      setSwitchChecked(els.cfgQueueOpen, Boolean(settings.queue_open));
      els.cfgRoundLimit.value = String(settings.round_limit ?? 0);
      els.cfgNextRound.value = settings.next_round_at ? formatClock(settings.next_round_at) : "";
      els.cfgBarMessage.value = settings.message || "";
    }
    if (night) {
      setSwitchChecked(els.cfgNightRequired, Boolean(night.required));
      els.cfgNightCode.value = night.code || "";
    }
  } catch (error) {
    setFeedback(els.barOpsStatus, adminErrorMessage(error), "error");
  }
}

async function loadConfigTab() {
  draftFeatures = { ...getFeatures() };
  renderFeatureSwitches();
  populateRuntimeParamsForm(draftFeatures);
  await loadBarOperationControls();
}

/* =========================================================================
   ABA 3: APARÊNCIA E TEMA
   ========================================================================= */
function syncDefaultThemeButtons() {
  for (const btn of els.defaultThemeButtons) {
    btn.setAttribute("aria-pressed", String(btn.dataset.defaultTheme === state.defaultThemeDraft));
  }
}

function syncPreviewThemeButtons() {
  for (const btn of els.previewThemeButtons) {
    btn.setAttribute("aria-pressed", String(btn.dataset.pvTheme === state.previewTheme));
  }
}

function readPaletteForm() {
  const next = { dark: {}, light: {} };
  document.querySelectorAll("input[type='color'][data-palette-token]").forEach((input) => {
    next[input.dataset.theme][input.dataset.paletteToken] = input.value.toLowerCase();
  });
  return next;
}

function isLogoPaletteExact(palette) {
  const merged = mergePalette(palette);
  for (const theme of PALETTE_THEMES) {
    for (const token of PALETTE_TOKENS) {
      if (merged[theme.id][token.id].toLowerCase() !== LOGO_PALETTE[theme.id][token.id].toLowerCase()) {
        return false;
      }
    }
  }
  return true;
}

function paintMiniPreview(palette) {
  if (!els.paletteMiniPreview) return;
  const merged = mergePalette(palette);
  const activeColors = merged[state.previewTheme] || merged.light;
  for (const token of PALETTE_TOKENS) {
    els.paletteMiniPreview.style.setProperty(`--pv-${token.id}`, activeColors[token.id]);
  }
}

function renderPaletteEditor(palette) {
  const merged = mergePalette(palette);
  els.paletteFields.replaceChildren(
    ...PALETTE_THEMES.map((theme) => {
      const card = el("div", "glass-card card-pad");
      card.append(el("h3", "card-title", theme.label));
      const list = el("div", "palette-token-list");

      for (const token of PALETTE_TOKENS) {
        const row = el("div", "palette-token-row");
        const label = el("span", "", token.label);

        const colorInput = document.createElement("input");
        colorInput.type = "color";
        colorInput.value = merged[theme.id][token.id];
        colorInput.dataset.theme = theme.id;
        colorInput.dataset.paletteToken = token.id;
        colorInput.setAttribute("aria-label", `${token.label} (${theme.label})`);

        const hexInput = document.createElement("input");
        hexInput.type = "text";
        hexInput.className = "palette-hex-input";
        hexInput.maxLength = 7;
        hexInput.spellcheck = false;
        hexInput.value = merged[theme.id][token.id];
        hexInput.setAttribute("aria-label", `Hexadecimal de ${token.label} (${theme.label})`);

        colorInput.addEventListener("input", () => {
          state.paletteResetPending = false;
          hexInput.value = colorInput.value.toLowerCase();
          hexInput.classList.remove("is-invalid");
          const current = readPaletteForm();
          paintMiniPreview(current);
          applyPalette(current, { persist: false });
        });

        hexInput.addEventListener("input", () => {
          let raw = hexInput.value.trim();
          if (raw && !raw.startsWith("#")) raw = `#${raw}`;
          if (isHexColor(raw)) {
            state.paletteResetPending = false;
            const clean = raw.toLowerCase();
            colorInput.value = clean;
            hexInput.classList.remove("is-invalid");
            const current = readPaletteForm();
            paintMiniPreview(current);
            applyPalette(current, { persist: false });
          } else {
            hexInput.classList.toggle("is-invalid", raw.length > 0);
          }
        });

        hexInput.addEventListener("blur", () => {
          let raw = hexInput.value.trim();
          if (raw && !raw.startsWith("#")) raw = `#${raw}`;
          hexInput.value = isHexColor(raw) ? raw.toLowerCase() : colorInput.value.toLowerCase();
          hexInput.classList.remove("is-invalid");
        });

        row.append(label, colorInput, hexInput);
        list.append(row);
      }

      card.append(list);
      return card;
    }),
  );

  paintMiniPreview(merged);
}

function renderAparenciaTab() {
  state.defaultThemeDraft = defaultThemeOf(getFeatures());
  syncDefaultThemeButtons();
  syncPreviewThemeButtons();
  renderPaletteEditor(peekSitePayload()?.palette);
}

/* =========================================================================
   ABA 4: USUÁRIOS, PERFIS E ACESSOS
   ========================================================================= */
function renderRoleFilterPills() {
  els.usersRolePills.replaceChildren(
    ...ADMIN_ROLE_FILTERS.map((filter) => {
      const btn = el("button", "pill-btn");
      btn.type = "button";
      btn.setAttribute("aria-pressed", String(state.usersRole === filter.id));
      const count = Number(state.usersCounts?.[filter.key]) || 0;
      btn.append(
        document.createTextNode(filter.label),
        el("span", "pill-count", formatCount(count)),
      );
      btn.addEventListener("click", () => {
        state.usersRole = filter.id;
        state.usersOffset = 0;
        void loadUsersTab();
      });
      return btn;
    }),
  );
}

function renderPagination(barEl, infoEl, prevBtn, nextBtn, { offset, limit, total, onPage }) {
  if (!barEl) return;
  barEl.hidden = total <= 0;
  if (total <= 0) return;
  const from = offset + 1;
  const to = Math.min(offset + limit, total);
  infoEl.textContent = `Mostrando ${formatCount(from)}–${formatCount(to)} de ${formatCount(total)}`;
  prevBtn.disabled = offset <= 0;
  nextBtn.disabled = offset + limit >= total;
  prevBtn.onclick = () => {
    if (offset > 0) onPage(Math.max(0, offset - limit));
  };
  nextBtn.onclick = () => {
    if (offset + limit < total) onPage(offset + limit);
  };
}

function createUserCard(user) {
  const card = el("article", "glass-card user-card");

  const top = el("div", "user-card-top");
  const avatar = el("div", "user-avatar");
  const initials = profileInitials(user.display_name, user.email);
  avatar.textContent = initials;
  if (user.avatar_url) {
    const img = new Image();
    img.alt = "";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.src = user.avatar_url;
    img.addEventListener("error", () => {
      avatar.textContent = initials;
    }, { once: true });
    avatar.replaceChildren(img);
  }

  const identity = el("div", "user-identity");
  const titleName = String(user.display_name || "").trim() || "Sem nome no perfil";
  identity.append(
    el("strong", "", titleName),
    el("span", "user-email", user.email || "Sem e-mail visível"),
  );

  const badges = el("div", "user-badges");
  const roleBadge = el("span", "badge", ROLE_LABELS[user.role] || user.role);
  roleBadge.dataset.tone = user.role === "admin" ? "amber" : (user.role === "cliente" ? "muted" : "teal");

  const idBadge = el("span", "badge", `ID ${shortUuid(user.id)}`);
  idBadge.dataset.tone = "sky";
  idBadge.title = user.id;

  const consent = consentBadgeInfo(user);
  const lgpdBadge = el("span", "badge", consent.label);
  lgpdBadge.dataset.tone = consent.ok ? "teal" : "muted";

  badges.append(roleBadge, idBadge, lgpdBadge);
  identity.append(badges);
  top.append(avatar, identity);

  const dates = el("div", "user-dates");
  const createdBox = el("div");
  createdBox.append(el("span", "", "Cadastro"), el("strong", "", formatSaoPauloDateTime(user.created_at)));
  const signInBox = el("div");
  signInBox.append(el("span", "", "Último login"), el("strong", "", formatSaoPauloDateTime(user.last_sign_in_at)));
  dates.append(createdBox, signInBox);

  const form = el("div", "user-access-form");
  const controlsRow = el("div", "user-access-row");

  const roleField = el("div", "field");
  const roleSelectId = `role-${user.id}`;
  const roleLabel = el("label", "", "Papel de acesso");
  roleLabel.htmlFor = roleSelectId;
  const roleSelect = document.createElement("select");
  roleSelect.id = roleSelectId;
  for (const [value, label] of ROLE_OPTIONS) {
    const opt = new Option(label, value, value === user.role, value === user.role);
    roleSelect.append(opt);
  }
  roleField.append(roleLabel, roleSelect);

  const staffField = el("div", "field");
  const staffInputId = `staff-name-${user.id}`;
  const staffLabel = el("label", "", "Nome na fila (equipe)");
  staffLabel.htmlFor = staffInputId;
  const staffInput = document.createElement("input");
  staffInput.type = "text";
  staffInput.id = staffInputId;
  staffInput.maxLength = 60;
  staffInput.placeholder = "Ex.: Marina";
  staffInput.value = defaultStaffNameForUser(user);
  const staffHint = el("small", "");
  staffField.append(staffLabel, staffInput, staffHint);

  const syncStaffInputState = () => {
    const staffCapable = isStaffCapableRole(roleSelect.value);
    staffInput.disabled = !staffCapable;
    if (staffCapable && !staffInput.value.trim()) {
      staffInput.value = defaultStaffNameForUser(user);
    }
    staffHint.textContent = staffCapable
      ? "Sincronizado em public.staff para operar a fila."
      : "Clientes não possuem vínculo em public.staff.";
  };
  roleSelect.addEventListener("change", syncStaffInputState);
  syncStaffInputState();

  controlsRow.append(roleField, staffField);

  const actionRow = el("div", "actions-row");
  actionRow.style.marginTop = "0.2rem";
  const saveBtn = el("button", "btn btn-primary btn-sm", "Salvar acesso");
  saveBtn.type = "button";
  const cardMsg = el("span", "status-feedback");
  cardMsg.style.margin = "0";

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    setFeedback(cardMsg, "Salvando…");
    try {
      const nextRole = roleSelect.value;
      const nextStaffName = isStaffCapableRole(nextRole) ? staffInput.value.trim() : null;
      await adminUpdateUserAccess({
        userId: user.id,
        role: nextRole,
        staffName: nextStaffName,
      });
      setFeedback(els.roleStatus, `Acesso de ${titleName} atualizado para ${ROLE_LABELS[nextRole]}.`, "ok");
      await loadUsersTab();
    } catch (error) {
      setFeedback(cardMsg, adminErrorMessage(error), "error");
    } finally {
      saveBtn.disabled = false;
    }
  });

  actionRow.append(saveBtn, cardMsg);
  form.append(controlsRow, actionRow);
  card.append(top, dates, form);
  return card;
}

async function loadUsersTab() {
  renderRoleFilterPills();
  setFeedback(els.roleStatus, "Carregando contas…");
  try {
    const result = await adminListUsers({
      search: state.usersSearch,
      role: state.usersRole,
      limit: USERS_PAGE_SIZE,
      offset: state.usersOffset,
    });
    state.usersTotal = result.total;
    state.usersCounts = result.counts_by_role || state.usersCounts;
    renderRoleFilterPills();
    setFeedback(els.roleStatus, "");

    els.usersList.replaceChildren(...result.rows.map(createUserCard));
    els.roleEmpty.hidden = result.rows.length > 0;
    renderPagination(els.usersPagination, els.usersPageInfo, els.usersPrev, els.usersNext, {
      offset: state.usersOffset,
      limit: USERS_PAGE_SIZE,
      total: state.usersTotal,
      onPage: (nextOffset) => {
        state.usersOffset = nextOffset;
        void loadUsersTab();
      },
    });
  } catch (error) {
    setFeedback(els.roleStatus, adminErrorMessage(error), "error");
  }
}

/* =========================================================================
   ABA 5: PEDIDOS (REQUESTS), TABELAS DO BANCO E LOGS DE AUDITORIA
   ========================================================================= */
function populateDataFiltersOnce() {
  if (els.reqStatusFilter && !els.reqStatusFilter.options.length) {
    els.reqStatusFilter.replaceChildren(
      ...REQUEST_STATUS_FILTERS.map((item) => new Option(item.label, item.id)),
    );
  }
  if (els.reqOriginFilter && !els.reqOriginFilter.options.length) {
    els.reqOriginFilter.replaceChildren(
      ...REQUEST_ORIGIN_FILTERS.map((item) => new Option(item.label, item.id)),
    );
  }
  if (els.inspectTableSelect && !els.inspectTableSelect.options.length) {
    els.inspectTableSelect.replaceChildren(
      ...INSPECTABLE_TABLES.map((item) => new Option(item.label, item.id)),
    );
  }
  if (els.auditCategoryFilter && !els.auditCategoryFilter.options.length) {
    els.auditCategoryFilter.replaceChildren(
      ...AUDIT_CATEGORIES.map((item) => new Option(item.label, item.id)),
    );
  }
}

function selectDataSubtab(subtabId) {
  const resolved = resolveDataSubtab(subtabId);
  state.dataSubtab = resolved;
  for (const btn of els.dataSubtabButtons) {
    btn.setAttribute("aria-selected", String(btn.dataset.subtab === resolved));
  }
  els.subpanelRequests.hidden = resolved !== "requests";
  els.subpanelTabelas.hidden = resolved !== "tabelas";
  els.subpanelLogs.hidden = resolved !== "logs";
  void loadCurrentDataSubtab();
}

async function loadCurrentDataSubtab() {
  populateDataFiltersOnce();
  if (state.dataSubtab === "requests") {
    await loadAdminRequests();
  } else if (state.dataSubtab === "tabelas") {
    await loadInspectTable();
  } else {
    await loadAuditLogs();
  }
}

function createRequestRow(req) {
  const item = el("li", "glass-card request-item");
  const main = el("div", "request-main");

  const titleLine = el("div", "request-title-line");
  const statusInfo = requestStatusBadge(req.status);
  const statusBadge = el("span", "badge", statusInfo.label);
  statusBadge.dataset.tone = statusInfo.tone;

  const originBadge = el("span", "badge", req.origin === "qr" ? "QR" : "Remoto");
  originBadge.dataset.tone = req.origin === "qr" ? "sky" : "muted";

  titleLine.append(
    el("span", "code-pill", `#${req.id} · ${req.code}`),
    el("strong", "", songLabel(req)),
    statusBadge,
    originBadge,
  );

  const phonePart = req.customer_phone_masked ? ` · ${req.customer_phone_masked}` : "";
  const staffPart = req.staff_name ? ` · Garçom: ${req.staff_name}` : "";
  const customerMeta = el("div", "request-meta", `Cliente: ${req.customer_name}${phonePart}${staffPart}`);

  const times = [`Criado: ${formatSaoPauloDateTime(req.created_at)}`];
  if (req.paid_at) times.push(`Pago: ${formatSaoPauloDateTime(req.paid_at)}`);
  if (req.played_at) times.push(`Tocou: ${formatSaoPauloDateTime(req.played_at)}`);
  if (req.cancelled_at) times.push(`Cancelado: ${formatSaoPauloDateTime(req.cancelled_at)}`);
  const timeMeta = el("div", "request-meta", times.join(" · "));

  main.append(titleLine, customerMeta, timeMeta);
  item.append(main);

  const actions = el("div", "request-actions");
  if (req.status === "aguardando_pagamento") {
    const payBtn = el("button", "btn btn-primary btn-sm", "Confirmar pagamento");
    payBtn.type = "button";
    payBtn.addEventListener("click", () => moderateRequest(() => staffMarkPaid(req.id), `Pagamento do pedido #${req.id} confirmado.`));
    actions.append(payBtn);
  }
  if (req.status === "na_fila") {
    const playBtn = el("button", "btn btn-primary btn-sm", "Tocou");
    playBtn.type = "button";
    playBtn.addEventListener("click", () => moderateRequest(() => staffMarkPlayed(req.id), `Pedido #${req.id} marcado como tocado.`));
    actions.append(playBtn);
  }
  if (req.status === "aguardando_pagamento" || req.status === "na_fila") {
    const cancelBtn = el("button", "btn btn-danger btn-sm", "Cancelar");
    cancelBtn.type = "button";
    cancelBtn.addEventListener("click", () => {
      if (!window.confirm(`Cancelar o pedido #${req.id} (${req.customer_name})?`)) return;
      void moderateRequest(() => staffCancel(req.id), `Pedido #${req.id} cancelado.`);
    });
    actions.append(cancelBtn);
  }
  if (actions.childElementCount > 0) {
    item.append(actions);
  }

  return item;
}

async function moderateRequest(action, okMessage) {
  setFeedback(els.reqStatusMsg, "Executando ação…");
  try {
    await action();
    setFeedback(els.reqStatusMsg, okMessage, "ok");
    await loadAdminRequests({ preserveMessage: true });
  } catch (error) {
    setFeedback(els.reqStatusMsg, adminErrorMessage(error), "error");
  }
}

async function loadAdminRequests({ preserveMessage = false } = {}) {
  if (!preserveMessage) setFeedback(els.reqStatusMsg, "Carregando pedidos…");
  try {
    const result = await adminListRequests({
      status: state.reqStatus,
      search: state.reqSearch,
      origin: state.reqOrigin,
      limit: REQUESTS_PAGE_SIZE,
      offset: state.reqOffset,
    });
    state.reqTotal = result.total;
    if (!preserveMessage) setFeedback(els.reqStatusMsg, "");
    els.reqList.replaceChildren(...result.rows.map(createRequestRow));
    els.reqEmpty.hidden = result.rows.length > 0;
    renderPagination(els.reqPagination, els.reqPageInfo, els.reqPrev, els.reqNext, {
      offset: state.reqOffset,
      limit: REQUESTS_PAGE_SIZE,
      total: state.reqTotal,
      onPage: (nextOffset) => {
        state.reqOffset = nextOffset;
        void loadAdminRequests();
      },
    });
  } catch (error) {
    setFeedback(els.reqStatusMsg, adminErrorMessage(error), "error");
  }
}

async function loadInspectTable() {
  const meta = INSPECTABLE_TABLES.find((item) => item.id === state.inspectTable);
  els.inspectDescription.textContent = meta?.description || "";
  setFeedback(els.inspectStatusMsg, "Consultando tabela…");

  try {
    const result = await adminInspectTable({
      table: state.inspectTable,
      search: state.inspectSearch,
      limit: INSPECT_PAGE_SIZE,
      offset: state.inspectOffset,
    });
    state.inspectTotal = result.total;
    setFeedback(els.inspectStatusMsg, "");
    els.inspectCountBadge.textContent = `${formatCount(result.total)} ${result.total === 1 ? "linha" : "linhas"}`;

    const trHead = document.createElement("tr");
    for (const col of result.columns) {
      trHead.append(el("th", "", col));
    }
    els.inspectThead.replaceChildren(trHead);

    els.inspectTbody.replaceChildren(
      ...result.rows.map((row) => {
        const tr = document.createElement("tr");
        for (const col of result.columns) {
          const td = el("td", "", formatTableCell(col, row?.[col]));
          td.dataset.col = col;
          tr.append(td);
        }
        return tr;
      }),
    );

    els.inspectEmpty.hidden = result.rows.length > 0;
    renderPagination(
      els.inspectPagination,
      els.inspectPageInfo,
      els.inspectPrev,
      els.inspectNext,
      {
        offset: state.inspectOffset,
        limit: INSPECT_PAGE_SIZE,
        total: state.inspectTotal,
        onPage: (nextOffset) => {
          state.inspectOffset = nextOffset;
          void loadInspectTable();
        },
      },
    );
  } catch (error) {
    setFeedback(els.inspectStatusMsg, adminErrorMessage(error), "error");
  }
}

function categoryTone(category) {
  switch (category) {
    case "config":
      return "sky";
    case "aparencia":
      return "amber";
    case "acesso":
      return "teal";
    case "fila":
      return "sky";
    case "pedido":
      return "teal";
    default:
      return "muted";
  }
}

function createAuditItem(row) {
  const item = el("li", "glass-card audit-item");
  const main = el("div", "audit-main");

  const titleLine = el("div", "audit-title-line");
  const catBadge = el("span", "badge", auditCategoryLabel(row.category));
  catBadge.dataset.tone = categoryTone(row.category);

  titleLine.append(catBadge, el("strong", "", auditActionSummary(row)));

  const actorLabel = row.actor_name || (row.actor_id ? shortUuid(row.actor_id) : "Sistema");
  const meta = el(
    "div",
    "audit-meta",
    `${formatSaoPauloDateTime(row.created_at)} · Responsável: ${actorLabel}`,
  );

  main.append(titleLine, meta);

  const detailsObj = row.details && typeof row.details === "object" ? row.details : {};
  if (Object.keys(detailsObj).length > 0) {
    const details = el("details", "audit-details");
    const summary = el("summary", "", "Ver detalhes JSON");
    const pre = el("pre", "", formatAuditDetails(detailsObj));
    details.append(summary, pre);
    main.append(details);
  }

  item.append(main);
  return item;
}

async function loadAuditLogs() {
  setFeedback(els.auditStatusMsg, "Carregando trilha de auditoria…");
  try {
    const result = await adminListAuditLogs({
      category: state.auditCategory,
      search: state.auditSearch,
      limit: AUDIT_PAGE_SIZE,
      offset: state.auditOffset,
    });
    state.auditTotal = result.total;
    setFeedback(els.auditStatusMsg, "");
    els.auditList.replaceChildren(...result.rows.map(createAuditItem));
    els.auditEmpty.hidden = result.rows.length > 0;
    renderPagination(els.auditPagination, els.auditPageInfo, els.auditPrev, els.auditNext, {
      offset: state.auditOffset,
      limit: AUDIT_PAGE_SIZE,
      total: state.auditTotal,
      onPage: (nextOffset) => {
        state.auditOffset = nextOffset;
        void loadAuditLogs();
      },
    });
  } catch (error) {
    setFeedback(els.auditStatusMsg, adminErrorMessage(error), "error");
  }
}

/* =========================================================================
   EVENTOS, AUTENTICAÇÃO E INICIALIZAÇÃO
   ========================================================================= */
function bindEvents() {
  els.surfaceToggle.addEventListener("click", () => {
    setAdminSurface(currentAdminSurface() === "dark" ? "light" : "dark");
  });

  els.refreshBtn.addEventListener("click", () => {
    void refreshActiveTab();
  });

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", (event) => {
      event.preventDefault();
      void activateTab(tab.dataset.tab, { updateHash: true });
    });
  });

  window.addEventListener("hashchange", () => {
    const fromHash = resolveAdminTab(window.location.hash);
    if (fromHash !== state.activeTab) {
      void activateTab(fromHash, { updateHash: false });
    }
  });

  window.addEventListener("resize", () => {
    requestAnimationFrame(syncTabPill);
  }, { passive: true });

  // Login e Logout
  els.loginView.addEventListener("submit", async (event) => {
    event.preventDefault();
    els.loginButton.disabled = true;
    setFeedback(els.loginStatus, "Entrando…");
    try {
      await signIn({ email: els.email.value, password: els.password.value, persist: true });
      els.password.value = "";
      setFeedback(els.loginStatus, "");
      await enterConsole();
    } catch (error) {
      setFeedback(els.loginStatus, authErrorMessage(error), "error");
    } finally {
      els.loginButton.disabled = false;
    }
  });

  const handleLogout = async () => {
    await signOut();
    state.panelReady = false;
    state.loadedTabs.clear();
    els.actorSubtitle.textContent = "Bar da Cácia · Gestão em tempo real";
    showView("login");
  };
  els.logoutBtn.addEventListener("click", handleLogout);
  els.deniedLogout.addEventListener("click", handleLogout);

  // Aba 1: Períodos
  els.visaoRanges.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.visaoRange = btn.dataset.range;
      void loadVisaoTab();
    });
  });

  // Aba 2: Funcionalidades, Operação da Fila, Código da Noite e Parâmetros
  els.featuresForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitBtn = els.featuresForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    setFeedback(els.adminStatus, "Salvando funcionalidades…");
    try {
      draftFeatures = await saveSiteFeatures(readFeaturesForm());
      renderFeatureSwitches();
      setFeedback(els.adminStatus, "Funcionalidades salvas. Já estão valendo no site.", "ok");
    } catch (error) {
      setFeedback(els.adminStatus, adminErrorMessage(error), "error");
    } finally {
      submitBtn.disabled = false;
    }
  });

  bindSwitchButton(els.cfgQueueOpen);
  bindSwitchButton(els.cfgNightRequired);

  els.barOpsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitBtn = els.barOpsForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    setFeedback(els.barOpsStatus, "Salvando operação da fila…");
    try {
      const nextTime = nextOccurrence(els.cfgNextRound.value);
      await staffUpdateSettings({
        queueOpen: isSwitchChecked(els.cfgQueueOpen),
        roundLimit: Number(els.cfgRoundLimit.value) || 0,
        nextRoundAt: nextTime ? nextTime.toISOString() : null,
        message: els.cfgBarMessage.value.trim(),
        newRound: false,
      });
      setFeedback(els.barOpsStatus, "Operação da fila atualizada.", "ok");
      await loadBarOperationControls();
    } catch (error) {
      setFeedback(els.barOpsStatus, adminErrorMessage(error), "error");
    } finally {
      submitBtn.disabled = false;
    }
  });

  els.cfgNewRound.addEventListener("click", async () => {
    if (!window.confirm("Abrir uma nova rodada agora? As vagas usadas voltam a zero e a fila abre.")) return;
    els.cfgNewRound.disabled = true;
    setFeedback(els.barOpsStatus, "Iniciando nova rodada…");
    try {
      await staffUpdateSettings({
        queueOpen: true,
        roundLimit: Number(els.cfgRoundLimit.value) || 0,
        nextRoundAt: null,
        message: els.cfgBarMessage.value.trim(),
        newRound: true,
      });
      setFeedback(els.barOpsStatus, "Nova rodada aberta com sucesso.", "ok");
      await loadBarOperationControls();
    } catch (error) {
      setFeedback(els.barOpsStatus, adminErrorMessage(error), "error");
    } finally {
      els.cfgNewRound.disabled = false;
    }
  });

  els.cfgNightGenerate.addEventListener("click", () => {
    els.cfgNightCode.value = randomNightCode();
    setSwitchChecked(els.cfgNightRequired, true);
  });

  els.nightCodeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitBtn = els.nightCodeForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    setFeedback(els.nightCodeStatus, "Salvando código da noite…");
    try {
      const saved = await staffSetNightCode({
        required: isSwitchChecked(els.cfgNightRequired),
        code: normalizeNightCode(els.cfgNightCode.value),
      });
      setSwitchChecked(els.cfgNightRequired, Boolean(saved?.required));
      els.cfgNightCode.value = saved?.code || "";
      setFeedback(els.nightCodeStatus, "Código da noite salvo.", "ok");
    } catch (error) {
      setFeedback(els.nightCodeStatus, adminErrorMessage(error), "error");
    } finally {
      submitBtn.disabled = false;
    }
  });

  els.paramSiteNotice.addEventListener("input", updateNoticeCounter);
  els.paramNoticeClear.addEventListener("click", () => {
    els.paramSiteNotice.value = "";
    updateNoticeCounter();
  });

  els.paramResetDefaults.addEventListener("click", () => {
    els.paramPendingExpire.value = String(RUNTIME_PARAM_BOUNDS.pending_expire_minutes.fallback);
    els.paramMaxUser.value = String(RUNTIME_PARAM_BOUNDS.max_pending_per_user.fallback);
    els.paramMaxTotal.value = String(RUNTIME_PARAM_BOUNDS.max_pending_total.fallback);
    els.paramWriteLimit.value = String(RUNTIME_PARAM_BOUNDS.write_limit_per_minute.fallback);
    els.paramPopularLimit.value = String(RUNTIME_PARAM_BOUNDS.popular_limit.fallback);
    setFeedback(els.runtimeParamsStatus, "Valores padrão preenchidos. Clique em Salvar parâmetros para gravar.");
  });

  els.runtimeParamsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const check = validateRuntimeParams({
      site_notice: els.paramSiteNotice.value,
      pending_expire_minutes: els.paramPendingExpire.value,
      max_pending_per_user: els.paramMaxUser.value,
      max_pending_total: els.paramMaxTotal.value,
      write_limit_per_minute: els.paramWriteLimit.value,
      popular_limit: els.paramPopularLimit.value,
    });
    if (!check.ok) {
      const firstError = Object.values(check.errors)[0];
      setFeedback(els.runtimeParamsStatus, firstError, "error");
      return;
    }

    const submitBtn = els.runtimeParamsForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    setFeedback(els.runtimeParamsStatus, "Gravando parâmetros…");
    try {
      draftFeatures = await adminSaveRuntimeParams(check.value);
      populateRuntimeParamsForm(draftFeatures);
      setFeedback(els.runtimeParamsStatus, "Parâmetros e comunicado atualizados em tempo real.", "ok");
    } catch (error) {
      setFeedback(els.runtimeParamsStatus, adminErrorMessage(error), "error");
    } finally {
      submitBtn.disabled = false;
    }
  });

  // Aba 3: Tema padrão, Mini-Preview e Paleta
  els.defaultThemeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.defaultThemeDraft = btn.dataset.defaultTheme;
      syncDefaultThemeButtons();
    });
  });

  els.saveDefaultTheme.addEventListener("click", async () => {
    els.saveDefaultTheme.disabled = true;
    setFeedback(els.defaultThemeStatus, "Salvando tema inicial padrão…");
    try {
      draftFeatures = await adminSaveRuntimeParams({ default_theme: state.defaultThemeDraft });
      renderAparenciaTab();
      setFeedback(els.defaultThemeStatus, "Tema inicial padrão salvo.", "ok");
    } catch (error) {
      setFeedback(els.defaultThemeStatus, adminErrorMessage(error), "error");
    } finally {
      els.saveDefaultTheme.disabled = false;
    }
  });

  els.previewThemeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.previewTheme = btn.dataset.pvTheme === "dark" ? "dark" : "light";
      syncPreviewThemeButtons();
      paintMiniPreview(readPaletteForm());
    });
  });

  els.paletteReset.addEventListener("click", () => {
    state.paletteResetPending = true;
    renderPaletteEditor(LOGO_PALETTE);
    applyPalette(LOGO_PALETTE, { persist: false });
    setFeedback(els.paletteStatus, "Cores da logo aplicadas na amostra. Clique em Salvar cores para gravar.");
  });

  els.paletteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitBtn = els.paletteForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    setFeedback(els.paletteStatus, "Salvando paleta…");
    try {
      const formPalette = readPaletteForm();
      const payload = state.paletteResetPending || isLogoPaletteExact(formPalette) ? {} : formPalette;
      await saveSitePalette(payload);
      state.paletteResetPending = false;
      renderPaletteEditor(peekSitePayload()?.palette);
      setFeedback(els.paletteStatus, "Cores salvas. Quem abrir o site já recebe a nova paleta.", "ok");
    } catch (error) {
      setFeedback(els.paletteStatus, adminErrorMessage(error), "error");
    } finally {
      submitBtn.disabled = false;
    }
  });

  // Aba 4: Busca instantânea de contas
  els.usersSearch.addEventListener(
    "input",
    debounce(() => {
      state.usersSearch = els.usersSearch.value.trim();
      state.usersOffset = 0;
      void loadUsersTab();
    }),
  );

  // Aba 5: Sub-abas, Requests, Tabelas e Logs
  els.dataSubtabButtons.forEach((btn) => {
    btn.addEventListener("click", () => selectDataSubtab(btn.dataset.subtab));
  });

  els.reqStatusFilter.addEventListener("change", () => {
    state.reqStatus = els.reqStatusFilter.value;
    state.reqOffset = 0;
    void loadAdminRequests();
  });

  els.reqOriginFilter.addEventListener("change", () => {
    state.reqOrigin = els.reqOriginFilter.value;
    state.reqOffset = 0;
    void loadAdminRequests();
  });

  els.reqSearch.addEventListener(
    "input",
    debounce(() => {
      state.reqSearch = els.reqSearch.value.trim();
      state.reqOffset = 0;
      void loadAdminRequests();
    }),
  );

  els.reqRefresh.addEventListener("click", () => void loadAdminRequests());

  els.inspectTableSelect.addEventListener("change", () => {
    state.inspectTable = els.inspectTableSelect.value;
    state.inspectOffset = 0;
    void loadInspectTable();
  });

  els.inspectSearch.addEventListener(
    "input",
    debounce(() => {
      state.inspectSearch = els.inspectSearch.value.trim();
      state.inspectOffset = 0;
      void loadInspectTable();
    }),
  );

  els.inspectRefresh.addEventListener("click", () => void loadInspectTable());

  els.auditCategoryFilter.addEventListener("change", () => {
    state.auditCategory = els.auditCategoryFilter.value;
    state.auditOffset = 0;
    void loadAuditLogs();
  });

  els.auditSearch.addEventListener(
    "input",
    debounce(() => {
      state.auditSearch = els.auditSearch.value.trim();
      state.auditOffset = 0;
      void loadAuditLogs();
    }),
  );

  els.auditRefresh.addEventListener("click", () => void loadAuditLogs());
}

async function openConsole(user) {
  draftFeatures = { ...getFeatures() };
  state.panelReady = true;
  state.loadedTabs.clear();
  els.actorSubtitle.textContent = `Conectado como ${displayName(user)} (${user.email || "admin"})`;

  renderFeatureSwitches();
  populateRuntimeParamsForm(draftFeatures);
  renderAparenciaTab();
  populateDataFiltersOnce();

  showView("panel");
  const initialTab = resolveAdminTab(window.location.hash);
  await activateTab(initialTab, { updateHash: !window.location.hash, forceLoad: true });
}

async function enterConsole() {
  const user = await getCurrentUser();
  if (!user) {
    showView("login");
    return;
  }
  const role = await getMyRole();
  if (role !== "admin") {
    showView("denied");
    return;
  }
  await openConsole(user);
}

async function boot() {
  paintAdminSurfaceControls();
  bindEvents();

  if (!authBackendReady) {
    showView("unconfigured");
    return;
  }

  await loadSiteFeatures();
  await enterConsole();
}

void boot();
