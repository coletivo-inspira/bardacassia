import { displayTitle } from "./lib/catalog.js";
import { fetchDeezerMeta, metaFromCatalog, resolvePreview } from "./integrations/deezer.js";
import {
  DRAFT_TAB_ID,
  FAVORITES_KEY,
  addToTab,
  allCodes,
  clearTab,
  createTab,
  deleteTab,
  loadFavoritesState,
  mergeFavoriteCodes,
  removeSong,
  renameTab,
  sanitizeFavoritesState,
  saveFavoritesState,
  setActiveTab,
} from "./lib/favorites.js";
import {
  createCoverFallback,
  createMoveSelect,
  createRowMetaLoader,
  createSongRow,
  paintPreviewButton,
  spotifySearchUrl,
} from "./lib/song-row.js";
import { recordSongOpen, setFavoriteSyncActive, setSongFavorite } from "./integrations/popularity.js";
import { authBackendReady, onAuthChange } from "./integrations/auth.js";
import { loadSiteFeatures } from "./integrations/features.js";
import { getFeatures } from "./lib/feature-state.js";
import { showDeezer } from "./lib/features.js";
import { syncAccountFavorites } from "./integrations/favorites-sync.js";
import { hasStoredAuthSession } from "./integrations/supabase.js";
import { initAnalytics, trackEvent } from "./integrations/analytics.js";
import { applyFeatureChrome, hideExpiredEventNav, initializeAccountMenu, initializeIsland, initializeTheme, setFooterYear } from "./site.js";

const BASE = import.meta.env.BASE_URL || "/";
const RESULTS_VIEW_KEY = "bdc-results-view-v1";

const $ = (selector) => document.querySelector(selector);
const els = {
  tabList: $("#favorite-tab-list"),
  newTab: $("#new-favorite-tab"),
  renameTab: $("#rename-favorite-tab"),
  clearTab: $("#clear-favorite-tab"),
  deleteTab: $("#delete-favorite-tab"),
  count: $("#results-count"),
  list: $("#songs-list"),
  empty: $("#favorites-empty"),
  emptyText: $("#favorites-empty-text"),
  emptyLink: $("#favorites-empty-link"),
  viewList: $("#view-list"),
  viewGrid: $("#view-grid"),
  dialog: $("#dj-dialog"),
  dialogSong: $("#dialog-song"),
  dialogCode: $("#dialog-code"),
  dialogCover: $("#dialog-cover"),
  dialogPreview: $("#dialog-preview"),
  dialogSpotify: $("#dialog-spotify"),
  copyCode: $("#copy-song-code"),
  copyStatus: $("#copy-code-status"),
  audio: $("#preview-audio"),
};

let favoritesState = loadFavoritesState();
let songByCode = new Map();
let catalogReady = false;
let previewCode = null;
let activeSong = null;
let dialogReturnFocus = null;
let copyTimer = null;
let coversPromise = null;
let bootSyncStarted = false;

function ensureSongCovers() {
  if (coversPromise) return coversPromise;
  coversPromise = (async () => {
    try {
      const res = await fetch(`${BASE}data/song-covers.json`);
      if (!res.ok) return;
      const covers = await res.json();
      if (!covers || typeof covers !== "object") return;
      for (const [code, url] of Object.entries(covers)) {
        const song = songByCode.get(code);
        if (song && url) song.coverUrl = url;
      }
    } catch {
      /* covers stay empty; Deezer contingency still works */
    }
  })();
  return coversPromise;
}

const rowMeta = createRowMetaLoader({ songFor: (code) => songByCode.get(code), ensureCovers: ensureSongCovers });

function persist() {
  if (!saveFavoritesState(favoritesState)) {
    els.count.textContent = "Não foi possível salvar suas favoritas neste navegador.";
  }
}

function update(next) {
  favoritesState = next;
  persist();
  render();
}

function activeTab() {
  return favoritesState.tabs.find((tab) => tab.id === favoritesState.active)
    || favoritesState.tabs.find((tab) => tab.id === DRAFT_TAB_ID);
}

function loadResultsView() {
  try {
    const saved = localStorage.getItem(RESULTS_VIEW_KEY);
    if (saved === "grid" || saved === "list") return saved;
  } catch {
    /* private mode */
  }
  return window.matchMedia("(max-width: 719px)").matches ? "grid" : "list";
}

function applyResultsView(view) {
  const isGrid = view === "grid";
  els.list.classList.toggle("songs-list--grid", isGrid);
  els.list.classList.toggle("songs-list--list", !isGrid);
  for (const [button, on] of [[els.viewList, !isGrid], [els.viewGrid, isGrid]]) {
    button.setAttribute("aria-pressed", String(on));
    button.classList.toggle("is-active", on);
  }
}

function setResultsView(view) {
  try {
    localStorage.setItem(RESULTS_VIEW_KEY, view);
  } catch {
    /* private mode */
  }
  applyResultsView(view);
}

function renderTabs() {
  const current = activeTab();
  els.tabList.replaceChildren(...favoritesState.tabs.map((tab) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "favorite-tab";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(tab.id === current.id));
    button.classList.toggle("is-active", tab.id === current.id);
    const name = document.createElement("span");
    name.textContent = tab.name;
    const count = document.createElement("span");
    count.className = "favorite-count";
    count.textContent = String(tab.codes.length);
    button.append(name, count);
    button.addEventListener("click", () => update(setActiveTab(favoritesState, tab.id)));
    return button;
  }));
  const isDraft = current.id === DRAFT_TAB_ID;
  els.renameTab.hidden = isDraft;
  els.deleteTab.hidden = isDraft;
  els.clearTab.disabled = current.codes.length === 0;
}

function toggleFavorite(song) {
  setSongFavorite(song.code, false);
  update(removeSong(favoritesState, song.code));
}

function showArtist(artist) {
  location.assign(new URL(`index.html#buscar?q=${encodeURIComponent(artist)}`, location.href).href);
}

function renderSongs() {
  const tab = activeTab();
  const tabSongs = tab.codes.map((code) => songByCode.get(code)).filter(Boolean);
  const rows = tabSongs.map((song) => createSongRow(song, {
    favorite: true,
    onShowCode: showSongToDJ,
    onShowArtist: showArtist,
    onToggleFavorite: toggleFavorite,
    onTogglePreview: togglePreview,
    extra: createMoveSelect(song, favoritesState, update),
  }));
  els.list.replaceChildren(...rows);
  rowMeta.observe(rows);

  const total = allCodes(favoritesState).size;
  els.count.textContent = tabSongs.length === 1 ? "1 música nesta aba" : `${tabSongs.length.toLocaleString("pt-BR")} músicas nesta aba`;
  els.empty.hidden = tabSongs.length > 0;
  if (total === 0) {
    els.emptyText.textContent = "Você ainda não favoritou nenhuma música.";
    els.emptyLink.hidden = false;
  } else {
    els.emptyText.textContent = "Esta aba ainda está vazia. Use “Mover para…” nas músicas de outra aba.";
    els.emptyLink.hidden = true;
  }
}

function render() {
  renderTabs();
  if (!catalogReady) return;
  stopPreview();
  renderSongs();
}

function promptNewTab() {
  const name = window.prompt("Nome da nova aba (ex.: Noite de sexta):");
  if (name?.trim()) update(createTab(favoritesState, name));
}

function promptRenameTab() {
  const tab = activeTab();
  const name = window.prompt("Novo nome da aba:", tab.name);
  if (name?.trim()) update(renameTab(favoritesState, tab.id, name));
}

function confirmDeleteTab() {
  const tab = activeTab();
  if (!window.confirm(`Apagar a aba “${tab.name}”? As músicas dela voltam para o Rascunho.`)) return;
  update(deleteTab(favoritesState, tab.id));
}

function confirmClearTab() {
  const tab = activeTab();
  if (!tab.codes.length || !window.confirm(`Tirar todas as músicas da aba “${tab.name}”?`)) return;
  for (const code of tab.codes) setSongFavorite(code, false);
  update(clearTab(favoritesState, tab.id));
}

function stopPreview() {
  els.audio.pause();
  els.audio.removeAttribute("src");
  previewCode = null;
  document.querySelectorAll(".preview-btn.is-playing").forEach((button) => paintPreviewButton(button, false));
}

async function togglePreview(song, button) {
  if (previewCode === song.code && !els.audio.paused) {
    stopPreview();
    return;
  }
  let url = button.dataset.preview || "";
  if (!url) {
    button.disabled = true;
    try {
      url = (await resolvePreview(song)) || "";
      if (url) button.dataset.preview = url;
    } finally {
      button.disabled = false;
    }
  }
  if (!url || !button.isConnected) return;
  stopPreview();
  previewCode = song.code;
  els.audio.src = url;
  els.audio.play().catch(() => stopPreview());
  paintPreviewButton(button, true);
}

function setDialogCover(song, coverUrl) {
  if (!coverUrl) {
    els.dialogCover.replaceChildren(createCoverFallback(song));
    return;
  }
  const img = document.createElement("img");
  img.alt = "";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  img.src = coverUrl;
  img.addEventListener("error", () => {
    if (activeSong?.code === song.code) els.dialogCover.replaceChildren(createCoverFallback(song));
  }, { once: true });
  els.dialogCover.replaceChildren(img);
}

function applyDialogMeta(song, meta) {
  if (!meta || activeSong?.code !== song.code) return;
  if (meta.cover) setDialogCover(song, meta.cover);
  if (meta.previewUrl) {
    els.dialogPreview.hidden = false;
    els.dialogPreview.dataset.preview = meta.previewUrl;
  }
  rowMeta.syncSongMeta(song, meta);
}

function showSongToDJ(song) {
  activeSong = song;
  recordSongOpen(song.code);
  trackEvent("abrir_musica", { code: song.code });
  dialogReturnFocus = document.activeElement;
  const artist = song.artist.replace(/\.\.\.$/, "");
  const title = displayTitle(song.title);
  els.dialogSong.textContent = `${title} — ${artist}`;
  els.dialogCode.textContent = song.code;
  els.copyCode.textContent = "Copiar código";
  els.copyStatus.textContent = "";
  if (copyTimer) clearTimeout(copyTimer);
  els.dialogSpotify.href = spotifySearchUrl(artist, title);
  els.dialogSpotify.setAttribute("aria-label", `Ouvir no Spotify: ${title}`);

  const row = els.list.querySelector(`.song-row[data-code="${CSS.escape(String(song.code))}"]`);
  const catalogMeta = metaFromCatalog(song);
  const rowImg = row?.querySelector(".song-cover img");
  setDialogCover(song, catalogMeta.cover || rowImg?.currentSrc || rowImg?.src || null);
  const preview = catalogMeta.previewUrl || row?.querySelector(".preview-btn")?.dataset.preview || "";
  const deezer = showDeezer(getFeatures());
  els.dialogPreview.hidden = !(deezer && (preview || catalogMeta.deezerId));
  if (preview) els.dialogPreview.dataset.preview = preview;
  else delete els.dialogPreview.dataset.preview;
  paintPreviewButton(els.dialogPreview, false);
  if (!catalogMeta.cover && !rowImg) {
    fetchDeezerMeta(song).then((meta) => applyDialogMeta(song, meta)).catch(() => { /* dialog works without Deezer */ });
  }
  if (typeof els.dialog.showModal === "function") els.dialog.showModal();
}

async function applyAccountFavorites() {
  if (hasStoredAuthSession()) bootSyncStarted = true;
  const remote = await syncAccountFavorites(allCodes(favoritesState));
  if (!remote) return;
  const local = allCodes(favoritesState);
  const merged = mergeFavoriteCodes(local, remote, (code) => songByCode.has(code));
  const incoming = [...merged].filter((code) => !local.has(code));
  if (!incoming.length) return;
  let next = favoritesState;
  for (const code of incoming) next = addToTab(next, code, DRAFT_TAB_ID);
  update(next);
}

async function watchAccountFavorites() {
  if (!authBackendReady) return;
  let skipRecoverySignedIn = true;
  await onAuthChange(async (event) => {
    if (event === "SIGNED_OUT") {
      setFavoriteSyncActive(false);
      bootSyncStarted = false;
      skipRecoverySignedIn = false;
      return;
    }
    if (event === "SIGNED_IN" || event === "USER_UPDATED") {
      // Supabase replays SIGNED_IN on load; the boot sync already covers it.
      if (event === "SIGNED_IN" && skipRecoverySignedIn && bootSyncStarted) {
        skipRecoverySignedIn = false;
        return;
      }
      skipRecoverySignedIn = false;
      if (catalogReady) await applyAccountFavorites();
    }
  });
}

els.copyCode.addEventListener("click", async () => {
  try {
    if (!activeSong) throw new Error("Código indisponível.");
    if (!navigator.clipboard?.writeText) throw new Error("A cópia automática não está disponível.");
    await navigator.clipboard.writeText(String(activeSong.code));
    els.copyCode.textContent = "Copiado!";
    els.copyStatus.textContent = "Código copiado. Mostre ao DJ.";
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      els.copyCode.textContent = "Copiar código";
      els.copyStatus.textContent = "";
    }, 2000);
  } catch {
    els.copyStatus.textContent = "Não foi possível copiar automaticamente. Selecione o código e copie manualmente.";
  }
});
els.dialogPreview.addEventListener("click", () => {
  if (activeSong) togglePreview(activeSong, els.dialogPreview);
});
els.dialog.addEventListener("click", (event) => {
  if (event.target === els.dialog) els.dialog.close();
});
els.dialog.addEventListener("close", () => {
  stopPreview();
  activeSong = null;
  if (dialogReturnFocus?.isConnected) dialogReturnFocus.focus({ preventScroll: true });
});
els.audio.addEventListener("ended", stopPreview);
els.newTab.addEventListener("click", promptNewTab);
els.renameTab.addEventListener("click", promptRenameTab);
els.deleteTab.addEventListener("click", confirmDeleteTab);
els.clearTab.addEventListener("click", confirmClearTab);
els.viewList.addEventListener("click", () => setResultsView("list"));
els.viewGrid.addEventListener("click", () => setResultsView("grid"));
// Another tab (the catalog) may favorite songs while this page is open.
window.addEventListener("storage", (event) => {
  if (event.key !== null && event.key !== FAVORITES_KEY) return;
  favoritesState = sanitizeFavoritesState(loadFavoritesState(), catalogReady ? { allowed: new Set(songByCode.keys()) } : {});
  render();
});

async function init() {
  applyResultsView(loadResultsView());
  renderTabs();
  try {
    const res = await fetch(`${BASE}data/songs.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const songs = await res.json();
    songByCode = new Map(songs.map((song) => [String(song.code), song]));
  } catch (error) {
    els.count.textContent = "Não foi possível carregar o catálogo.";
    console.error(error);
    return;
  }
  catalogReady = true;
  void ensureSongCovers();
  favoritesState = sanitizeFavoritesState(favoritesState, { allowed: new Set(songByCode.keys()) });
  persist();
  render();
  void applyAccountFavorites();
}

async function boot() {
  await loadSiteFeatures();
  const open = applyFeatureChrome();
  initializeTheme();
  if (open) initAnalytics();
  hideExpiredEventNav();
  setFooterYear();
  initializeIsland();
  void initializeAccountMenu();
  if (!open) return;
  void watchAccountFavorites();
  await init();
}

void boot();
