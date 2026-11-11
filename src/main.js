import { initializeSongDialogActions } from "./lib/song-dialog-actions.js";
import { initializeRecommendationCarousel } from "./lib/recommendation-carousel.js";
import { displayTitle, filterCatalog, filtersForArtistSelection, countActiveFilterChips, filtersToggleLabel, searchCatalog, matchSpotifyTracks, curatedArtistSuggestions, normalizeText, cleanArtist } from "./lib/catalog.js";
import { fetchDeezerMeta, fetchRelatedArtists, fetchArtistPicture, metaFromCatalog, resolvePreview } from "./integrations/deezer.js";
import { spotifyConfigured, connectSpotify, completeSpotifyConnection } from "./integrations/spotify.js";
import { buildDiscoveryQueue, catalogArtists, filterArtists, sanitizeDiscoveryState, emptyDiscoveryState } from "./lib/discovery.js";
import { relatedCodesFor } from "./lib/connections.js";
import { GENRES, artistsForGenres, genreById, genreForSong } from "./lib/genres.js";
import {
  DRAFT_TAB_ID,
  addToTab,
  allCodes,
  loadFavoritesState,
  mergeFavoriteCodes,
  removeSong,
  sanitizeFavoritesState,
  saveFavoritesState,
  setActiveTab,
} from "./lib/favorites.js";
import {
  LANG_LABELS,
  colorFromCode,
  createCoverFallback,
  createRowMetaLoader,
  createSongRow,
  paintFavoriteButton,
  paintPreviewButton,
  setIconAction,
  setCoverImage,
  spotifySearchUrl,
} from "./lib/song-row.js";
import {
  resolveSwipeAxis,
  shouldCommitSwipe,
  swipeActionFromDx,
  swipeDelta,
  swipeStrength,
  isInteractiveSwipeTarget,
} from "./lib/discovery-swipe.js";
import { fetchPopularSongs, popularityNeedsUpdate, recordSongOpen, setFavoriteSyncActive, setSongFavorite } from "./integrations/popularity.js";
import { authBackendReady, getCurrentUser, onAuthChange, publicAuthEnabled } from "./integrations/auth.js";
import { loadSiteFeatures } from "./integrations/features.js";
import { getFeatures } from "./lib/feature-state.js";
import { popularLimitOf, showDeezer, showDiscovery, showFavorites, showFavoritesSync, showPopularity, siteNoticeOf } from "./lib/features.js";
import { applyFeatureChrome, hideExpiredEventNav, initializeAccountMenu, initializeIsland, initializeTheme, setFooterYear, setIslandTab } from "./site.js";
import { syncAccountFavorites } from "./integrations/favorites-sync.js";
import { hasStoredAuthSession } from "./integrations/supabase.js";
import { clearSongRequest, initSongRequests, prepareSongRequest } from "./song-requests.js";
import { initAnalytics, trackEvent } from "./integrations/analytics.js";

// Auth e-mails sometimes land on /?code= when Site URL was wrong; send PKCE to login.html.
(() => {
  const params = new URLSearchParams(location.search);
  if (!params.has("code")) return;
  const login = new URL("login.html", location.href);
  for (const [key, value] of params) login.searchParams.set(key, value);
  location.replace(login.href);
})();

const FAVORITES_PAGE = "favoritos.html";

/** Old "#favoritas" links (account menu, Minha conta, bookmarks) now open favoritos.html. */
function redirectLegacyFavoritesHash() {
  if (!location.hash.toLowerCase().startsWith("#favoritas")) return false;
  location.replace(new URL(FAVORITES_PAGE, location.href).href);
  return true;
}

const BASE = import.meta.env.BASE_URL || "/";
const PAGE_SIZE = 40;
function discoveryOn() { return showDiscovery(getFeatures()); }
function popularityOn() { return showPopularity(getFeatures()); }
function deezerOn() { return showDeezer(getFeatures()); }
function favoritesOn() { return showFavorites(getFeatures()); }
const DISCOVERY_KEY = "bdc-discovery-v1";
const RESULTS_VIEW_KEY = "bdc-results-view-v1";
const ARTIST_VIEW_KEY = "bdc-artist-view-v1";

const LANG_COLORS = {
  BRA: "#e91429",
  EUA: "#148a08",
  JAP: "#dc148c",
  ITA: "#8d67ab",
  ESP: "#e1118c",
  FRA: "#477d95",
};

const CURATED = [
  {
    id: "feito",
    title: "Feito para você",
    color: "#ba5d07",
    artists: [
      "Adele",
      "Abba",
      "Marília Mendonça",
      "Bruno & Marrone",
      "Queen",
      "Roberto Carlos",
      "Chitãozinho & Xororó",
      "Legião Urbana",
      "Anitta",
      "Coldplay",
    ],
  },
  {
    id: "sertanejo",
    title: "Clássicos do palco",
    color: "#1e3264",
    artists: [
      "Zezé Di Camargo e Luciano",
      "Jorge e Mateus",
      "Gusttavo Lima",
      "Henrique e Juliano",
      "Luan Santana",
      "Paula Fernandes",
    ],
  },
];

const els = {
  searchInput: document.querySelector("#song-search"),
  clearButton: document.querySelector("#clear-search"),
  resultsCount: document.querySelector("#results-count"),
  browseView: document.querySelector("#browse-view"),
  catalogTitle: document.querySelector("#catalog-title"),
  resultsView: document.querySelector("#results-view"),
  categoryGrid: document.querySelector("#category-grid"),
  songsList: document.querySelector("#songs-list"),
  emptyState: document.querySelector("#empty-state"),
  loadMore: document.querySelector("#load-more"),
  backToBrowse: document.querySelector("#back-to-browse"),
  activeFilter: document.querySelector("#active-filter"),
  dialog: document.querySelector("#dj-dialog"),
  previewAudio: document.querySelector("#preview-audio"),
  searchSection: document.querySelector("#buscar"),
  spotifyButton: document.querySelector("#spotify-connect"),
  spotifyStatus: document.querySelector("#spotify-status"),
  relatedSection: document.querySelector("#related-artists"),
  relatedTitle: document.querySelector("#related-title"),
  relatedList: document.querySelector("#related-list"),
  dialogRelated: document.querySelector("#dialog-related"),
  dialogRelatedList: document.querySelector("#dialog-related-list"),
  discoverFab: document.querySelector("#open-discover"),
  discoverDialog: document.querySelector("#discover-dialog"),
  discoverBack: document.querySelector("#discover-back"),
  closeDiscover: document.querySelector("#close-discover"),
  discoverSteps: document.querySelectorAll(".discover-steps li"),
  discoveryTitle: document.querySelector("#discovery-title"),
  discoveryDescription: document.querySelector("#discovery-description"),
  stepGenres: document.querySelector("#step-genres"),
  genreOptions: document.querySelector("#genre-options"),
  genreSelected: document.querySelector("#genre-selected"),
  confirmGenres: document.querySelector("#confirm-genres"),
  stepArtists: document.querySelector("#step-artists"),
  artistSearch: document.querySelector("#artist-search"),
  artistOptions: document.querySelector("#artist-options"),
  artistSelectionCount: document.querySelector("#artist-selection-count"),
  artistSelectionToggle: document.querySelector("#artist-selection-toggle"),
  artistSelected: document.querySelector("#artist-selected"),
  artistViewGrid: document.querySelector("#artist-view-grid"),
  artistViewList: document.querySelector("#artist-view-list"),
  startDiscovery: document.querySelector("#start-discovery"),
  skipArtistPicker: document.querySelector("#skip-artist-picker"),
  discoveryCards: document.querySelector("#discovery-cards"),
  discoveryDeck: document.querySelector("#discovery-deck"),
  discoveryCard: document.querySelector("#discovery-card"),
  cardPosition: document.querySelector("#card-position"),
  undoDiscovery: document.querySelector("#undo-discovery"),
  changeArtists: document.querySelector("#change-artists"),
  restartPassed: document.querySelector("#restart-passed"),
  goToFavorites: document.querySelector("#go-to-favorites"),
  popularView: document.querySelector("#popular-view"),
  popularList: document.querySelector("#popular-list"),
  artistSongsDialog: document.querySelector("#artist-songs-dialog"),
  artistSongsTitle: document.querySelector("#artist-songs-title"),
  artistSongsNote: document.querySelector("#artist-songs-note"),
  artistSongsItems: document.querySelector("#artist-songs-items"),
  artistSongsEmpty: document.querySelector("#artist-songs-empty"),
  closeArtistSongs: document.querySelector("#close-artist-songs"),
  copyCode: document.querySelector("#copy-song-code"),
  copyCodeStatus: document.querySelector("#copy-code-status"),
  dialogCover: document.querySelector("#dialog-cover"),
  dialogPreview: document.querySelector("#dialog-preview"),
  dialogSpotify: document.querySelector("#dialog-spotify"),
  viewList: document.querySelector("#view-list"),
  viewGrid: document.querySelector("#view-grid"),
  siteNotice: document.querySelector("#site-notice"),
  siteNoticeText: document.querySelector("#site-notice-text"),
};

/** @type {Array<{code:string,artist:string,title:string,lyricStart:string,lang:string}>} */
let songs = [];
let filtered = [];
let visibleCount = PAGE_SIZE;
let activeCategory = null;
let previewCode = null;
let dialogMetaGen = 0;
let favoritesState = loadFavoritesState();
let favoriteCodes = allCodes(favoritesState);
/** "Somente favoritas" spans every tab; the tabs themselves live on favoritos.html. */
let favoritesOnly = false;
let accountFavoritesPromptShown = false;
let relatedRequest = 0;
let songByCode = new Map();
let discovery = loadDiscovery();
let allCatalogArtists = [];
let artistOptions = [];
let discoverStep = "genres";
let artistView = loadArtistView();
let popularSongs = [];
let spotifySuggestions = [];
/** @type {Record<string, string[]>|null} */
let songConnections = null;
/** @type {Promise<Record<string, string[]>|null>|null} */
let songConnectionsPromise = null;
/** @type {Promise<void>|null} */
let songCoversPromise = null;
/** Skip the first auth-recovery SIGNED_IN when init already started favorites sync. */
let favoritesBootSyncStarted = false;
let activeSong = null;
let dialogReturnFocus = null;
let copyTimer = null;
let resultsView = loadResultsView();

function defaultResultsView() {
  return window.matchMedia("(max-width: 719px)").matches ? "grid" : "list";
}

function loadResultsView() {
  try {
    const saved = localStorage.getItem(RESULTS_VIEW_KEY);
    if (saved === "grid" || saved === "list") return saved;
  } catch {
    /* private mode */
  }
  return defaultResultsView();
}

function persistResultsView(view) {
  try {
    localStorage.setItem(RESULTS_VIEW_KEY, view);
  } catch {
    /* private mode */
  }
}

function applyResultsView() {
  const isGrid = resultsView === "grid";
  els.songsList.classList.toggle("songs-list--grid", isGrid);
  els.songsList.classList.toggle("songs-list--list", !isGrid);
  if (els.viewList) {
    els.viewList.setAttribute("aria-pressed", String(!isGrid));
    els.viewList.classList.toggle("is-active", !isGrid);
  }
  if (els.viewGrid) {
    els.viewGrid.setAttribute("aria-pressed", String(isGrid));
    els.viewGrid.classList.toggle("is-active", isGrid);
  }
}

function setResultsView(view) {
  if (view !== "grid" && view !== "list") return;
  resultsView = view;
  persistResultsView(view);
  applyResultsView();
}

function normalize(value) {
  return normalizeText(value);
}

/** Search lives in the top bar, so the island has no Buscar tab: the whole catalog page is Início. */
function updateMobileTabs() {
  setIslandTab("inicio");
}

function loadDiscovery() {
  try {
    const saved = JSON.parse(localStorage.getItem(DISCOVERY_KEY) || "null");
    return sanitizeDiscoveryState(saved, saved?.queue || []);
  } catch {
    return emptyDiscoveryState();
  }
}

function persistDiscovery() {
  try {
    localStorage.setItem(DISCOVERY_KEY, JSON.stringify(discovery));
    els.spotifyStatus.hidden = false;
    els.spotifyStatus.textContent = "Suas escolhas ficam salvas neste navegador.";
  } catch {
    els.spotifyStatus.hidden = false;
    els.spotifyStatus.textContent = "Não foi possível salvar as escolhas neste navegador. Você ainda pode continuar nesta visita.";
  }
}

function renderArtistSongsDialog(artist) {
  if (!els.artistSongsItems) return;
  els.artistSongsTitle.textContent = artist;
  els.artistSongsNote.textContent = `Músicas de ${artist} no catálogo do karaokê.`;
  const matches = filterCatalog(songs, { artist }).slice().sort((a, b) =>
    displayTitle(a.title).localeCompare(displayTitle(b.title), "pt-BR")
  );
  els.artistSongsItems.replaceChildren(...matches.map((song) => {
    const row = document.createElement("article");
    row.className = "night-list-item artist-songs-item";
    const title = document.createElement("p");
    title.className = "night-list-heading";
    title.textContent = displayTitle(song.title);
    const code = document.createElement("span");
    code.className = "night-list-code";
    code.textContent = `Código ${song.code} · ${LANG_LABELS[song.lang] || song.lang}`;
    const actions = document.createElement("div");
    actions.className = "night-list-item-actions";
    const djBtn = document.createElement("button");
    djBtn.type = "button";
    djBtn.className = "action-btn dj-btn icon-action";
    setIconAction(djBtn, "code");
    djBtn.setAttribute("aria-label", `Código ao DJ: ${song.code}`);
    djBtn.title = "Código";
    djBtn.addEventListener("click", () => showSongToDJ(song));
    const favoriteBtn = document.createElement("button");
    favoriteBtn.type = "button";
    favoriteBtn.className = "action-btn favorite-btn icon-action";
    favoriteBtn.dataset.code = song.code;
    favoriteBtn.title = "Favoritar";
    paintFavoriteButton(favoriteBtn, favoriteCodes.has(song.code), displayTitle(song.title));
    favoriteBtn.addEventListener("click", () => toggleFavorite(song));
    actions.append(djBtn, favoriteBtn);
    row.append(title, code, actions);
    return row;
  }));
  els.artistSongsEmpty.hidden = matches.length > 0;
}

function openArtistSongsDialog(artist) {
  const name = cleanArtist(artist);
  if (!name || !els.artistSongsDialog) return;
  renderArtistSongsDialog(name);
  if (typeof els.artistSongsDialog.showModal === "function") els.artistSongsDialog.showModal();
}

function closeArtistSongsDialog() {
  if (els.artistSongsDialog?.open) els.artistSongsDialog.close();
}

function loadArtistView() {
  try {
    const saved = localStorage.getItem(ARTIST_VIEW_KEY);
    if (saved === "grid" || saved === "list") return saved;
  } catch {
    /* private mode */
  }
  return "grid";
}

function setArtistView(view) {
  artistView = view;
  try { localStorage.setItem(ARTIST_VIEW_KEY, view); } catch { /* private mode */ }
  applyArtistView();
}

function applyArtistView() {
  const isGrid = artistView === "grid";
  els.artistOptions.classList.toggle("artist-options--grid", isGrid);
  els.artistOptions.classList.toggle("artist-options--list", !isGrid);
  els.artistViewGrid.setAttribute("aria-pressed", String(isGrid));
  els.artistViewGrid.classList.toggle("is-active", isGrid);
  els.artistViewList.setAttribute("aria-pressed", String(!isGrid));
  els.artistViewList.classList.toggle("is-active", !isGrid);
}

const STEP_COPY = {
  genres: ["Que estilos você gosta de cantar?", "Escolha um ou mais estilos. Eles guiam as sugestões de músicas."],
  artists: ["Quais artistas você curte?", "Toque nos artistas que você tem interesse. Escolha quantos quiser ou pule esta etapa."],
  cards: ["Descobrir minha música", "Deslize ou use os botões: escolha músicas para cantar ou passe para a próxima."],
};

function showDiscoverStep(step) {
  discoverStep = step;
  els.stepGenres.hidden = step !== "genres";
  els.stepArtists.hidden = step !== "artists";
  els.discoveryCards.hidden = step !== "cards";
  els.discoverBack.hidden = step === "genres";
  const order = ["genres", "artists", "cards"];
  els.discoverSteps.forEach((item) => {
    const index = order.indexOf(item.dataset.step);
    item.classList.toggle("is-current", item.dataset.step === step);
    item.classList.toggle("is-done", index < order.indexOf(step));
    if (item.dataset.step === step) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
  });
  const [title, description] = STEP_COPY[step];
  els.discoveryTitle.textContent = title;
  els.discoveryDescription.textContent = description;
  if (step === "genres") renderGenreOptions();
  if (step === "artists") {
    artistOptions = artistsForGenres(discovery.genres, allCatalogArtists);
    els.artistSearch.value = "";
    artistSelectionOpen = discovery.artists.length > 0;
    renderArtistOptions();
  }
  if (step === "cards") renderDiscoveryCard();
  els.discoverDialog.querySelector(".discover-screen-inner")?.scrollTo({ top: 0 });
}

/** Stable-per-session cover artist so chips keep the same photo while toggling. */
const genreCoverArtistById = new Map();

function coverArtistForGenre(genre) {
  if (!genreCoverArtistById.has(genre.id)) {
    const pool = genre.artists.slice(0, 12);
    genreCoverArtistById.set(genre.id, pool[Math.floor(Math.random() * pool.length)] || genre.label);
  }
  return genreCoverArtistById.get(genre.id);
}

function loadGenreChipPhoto(media) {
  const artist = media.dataset.artist;
  if (!artist) return;
  void fetchArtistPicture(artist).then((url) => {
    if (!url || !media.isConnected) return;
    const img = new Image();
    img.alt = "";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.onload = () => {
      if (!media.isConnected) return;
      media.replaceChildren(img);
      media.classList.add("has-photo");
    };
    img.src = url;
  });
}

function createGenreChip(genre, { selected = false, compact = false } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = compact ? "genre-chip genre-chip--selected" : "genre-chip";
  button.style.setProperty("--genre", genre.color);
  button.setAttribute("aria-pressed", String(selected));
  button.setAttribute("aria-label", selected ? `Remover ${genre.label}` : `Selecionar ${genre.label}`);
  if (compact) button.setAttribute("role", "listitem");

  const media = document.createElement("span");
  media.className = "genre-chip-media";
  media.dataset.artist = coverArtistForGenre(genre);
  media.setAttribute("aria-hidden", "true");

  const check = document.createElement("span");
  check.className = "genre-chip-check";
  check.setAttribute("aria-hidden", "true");
  check.textContent = selected ? "×" : "+";

  const label = document.createElement("span");
  label.className = "genre-chip-label";
  label.textContent = genre.label;

  button.append(media, check, label);
  button.addEventListener("click", () => {
    discovery.genres = selected
      ? discovery.genres.filter((id) => id !== genre.id)
      : [...discovery.genres, genre.id];
    persistDiscovery();
    renderGenreOptions();
  });
  loadGenreChipPhoto(media);
  return button;
}

function renderGenreOptions() {
  const selectedIds = discovery.genres.filter((id) => genreById(id));
  const selectedSet = new Set(selectedIds);
  const available = GENRES.filter((genre) => !selectedSet.has(genre.id));
  const chosen = selectedIds.map((id) => genreById(id)).filter(Boolean);

  els.genreOptions.replaceChildren(...available.map((genre) => createGenreChip(genre, { selected: false })));
  if (els.genreSelected) {
    els.genreSelected.hidden = chosen.length === 0;
    els.genreSelected.replaceChildren(...chosen.map((genre) => createGenreChip(genre, { selected: true, compact: true })));
  }

  const count = chosen.length;
  els.confirmGenres.disabled = count === 0;
  els.confirmGenres.textContent = count
    ? `Continuar com ${count} estilo${count === 1 ? "" : "s"}`
    : "Escolha pelo menos um estilo";
}

function createArtistPlaceholder(name) {
  const placeholder = document.createElement("span");
  placeholder.className = "artist-photo-fallback";
  placeholder.style.background = colorFromCode(name);
  placeholder.textContent = name.trim().charAt(0).toUpperCase();
  return placeholder;
}

async function loadArtistPhoto(photo) {
  const url = await fetchArtistPicture(photo.dataset.artist);
  if (!url || !photo.isConnected) return;
  const img = new Image();
  img.alt = "";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  img.onload = () => { if (photo.isConnected) photo.replaceChildren(img); };
  img.src = url;
}

const artistPhotoObserver = typeof IntersectionObserver === "function"
  ? new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      artistPhotoObserver.unobserve(entry.target);
      loadArtistPhoto(entry.target);
    }
  }, { rootMargin: "200px" })
  : null;

let artistSelectionOpen = false;

function setArtistSelectionOpen(open) {
  artistSelectionOpen = open && discovery.artists.length > 0;
  if (els.artistSelectionToggle) {
    els.artistSelectionToggle.setAttribute("aria-expanded", String(artistSelectionOpen));
    els.artistSelectionToggle.classList.toggle("is-open", artistSelectionOpen);
  }
  if (els.artistSelected) els.artistSelected.hidden = !artistSelectionOpen;
}

function updateArtistSelectionCount() {
  const count = discovery.artists.length;
  els.artistSelectionCount.textContent = count
    ? `${count} artista${count === 1 ? "" : "s"} selecionado${count === 1 ? "" : "s"}`
    : "Nenhum artista selecionado";
  if (els.artistSelectionToggle) {
    els.artistSelectionToggle.disabled = count === 0;
    els.artistSelectionToggle.hidden = false;
  }
  els.startDiscovery.disabled = count === 0;
  if (count === 0) setArtistSelectionOpen(false);
}

function createArtistTile(name, { selected = false, compact = false } = {}) {
  const key = normalize(name);
  const button = document.createElement("button");
  button.type = "button";
  button.className = compact ? "artist-tile artist-tile--selected" : "artist-tile";
  button.setAttribute("aria-pressed", String(selected));
  button.setAttribute("aria-label", `${selected ? "Remover" : "Selecionar"} ${name}`);
  if (compact) button.setAttribute("role", "listitem");
  const photo = document.createElement("span");
  photo.className = "artist-photo";
  photo.dataset.artist = name;
  photo.append(createArtistPlaceholder(name));
  const badge = document.createElement("span");
  badge.className = "artist-tile-check";
  badge.setAttribute("aria-hidden", "true");
  badge.textContent = selected ? "×" : "+";
  const label = document.createElement("span");
  label.className = "artist-tile-name";
  label.textContent = name;
  button.append(photo, badge, label);
  button.addEventListener("click", () => {
    discovery.artists = selected
      ? discovery.artists.filter((artist) => normalize(artist) !== key)
      : [...discovery.artists, name];
    persistDiscovery();
    if (!selected) setArtistSelectionOpen(true);
    renderArtistOptions();
  });
  if (artistPhotoObserver) artistPhotoObserver.observe(photo);
  else loadArtistPhoto(photo);
  return button;
}

function renderArtistOptions() {
  const selected = new Set(discovery.artists.map(normalize));
  const query = els.artistSearch.value.trim();
  const styleKeys = new Set(artistOptions.map((artist) => artist.key));
  const pool = query ? [...artistOptions, ...allCatalogArtists.filter((artist) => !styleKeys.has(artist.key))] : artistOptions;
  const matches = filterArtists(pool, query)
    .filter(({ key }) => !selected.has(key))
    .slice(0, 120);
  const chosen = discovery.artists
    .map((name) => {
      const key = normalize(name);
      const fromOptions = artistOptions.find((artist) => artist.key === key)
        || allCatalogArtists.find((artist) => artist.key === key);
      return fromOptions?.name || name;
    });

  artistPhotoObserver?.disconnect();
  els.artistOptions.replaceChildren(...matches.map(({ name }) => createArtistTile(name, { selected: false })));
  if (!matches.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = selected.size
      ? "Todos os artistas desta busca já foram selecionados."
      : "Nenhum artista encontrado nestes estilos.";
    els.artistOptions.append(empty);
  }
  if (els.artistSelected) {
    els.artistSelected.replaceChildren(...chosen.map((name) => createArtistTile(name, { selected: true, compact: true })));
  }
  updateArtistSelectionCount();
  setArtistSelectionOpen(artistSelectionOpen && chosen.length > 0);
}

function hasDiscoverySession() {
  return discovery.genres.length > 0 && discovery.queue.length > 0 && discovery.index < discovery.queue.length;
}

function openDiscover() {
  if (!discoveryOn()) return;
  if (!els.discoverDialog.open) {
    if (typeof els.discoverDialog.showModal === "function") els.discoverDialog.showModal();
    else els.discoverDialog.setAttribute("open", "");
  }
  document.documentElement.classList.add("discover-open");
  showDiscoverStep(hasDiscoverySession() ? "cards" : "genres");
}

function closeDiscover() {
  stopPreview();
  if (els.discoverDialog.open) els.discoverDialog.close();
}

function discoverBack() {
  if (discoverStep === "cards") showDiscoverStep("artists");
  else if (discoverStep === "artists") showDiscoverStep("genres");
}

async function ensureSongConnections() {
  if (songConnections) return songConnections;
  if (songConnectionsPromise) return songConnectionsPromise;
  songConnectionsPromise = (async () => {
    try {
      const connectionsRes = await fetch(`${BASE}data/song-connections.json`);
      if (connectionsRes.ok) songConnections = await connectionsRes.json();
      else songConnections = null;
    } catch {
      songConnections = null;
    }
    return songConnections;
  })();
  return songConnectionsPromise;
}

/** Load coverUrl sidecar and attach onto in-memory catalog songs. */
function ensureSongCovers() {
  if (songCoversPromise) return songCoversPromise;
  songCoversPromise = (async () => {
    try {
      const res = await fetch(`${BASE}data/song-covers.json`);
      if (!res.ok) return;
      const covers = await res.json();
      if (!covers || typeof covers !== "object") return;
      for (const song of songs) {
        const url = covers[String(song.code)];
        if (url) song.coverUrl = url;
      }
    } catch {
      /* covers stay empty; Deezer contingency still works */
    }
  })();
  return songCoversPromise;
}

async function startDiscovery(passedArtists = discovery.artists) {
  if (!discovery.genres.length) {
    showDiscoverStep("genres");
    return;
  }
  discovery.artists = [...passedArtists];
  if (popularityOn() && !popularSongs.length) popularSongs = (await fetchPopularSongs()).map((entry) => songByCode.get(String(entry.code))).filter(Boolean);
  if (popularityNeedsUpdate()) {
    els.spotifyStatus.hidden = false;
    els.spotifyStatus.textContent = "Ranking exibido com dados salvos; atualização pendente.";
  }
  const [connections] = await Promise.all([ensureSongConnections(), ensureSongCovers()]);
  const genreArtists = artistsForGenres(discovery.genres, allCatalogArtists).map((artist) => artist.name);
  const editorialArtists = CURATED.flatMap((pack) => pack.artists);
  const seedCodes = [...favoriteCodes, ...discovery.list, ...discovery.seen].map(String);
  const queue = buildDiscoveryQueue(
    songs,
    { artists: discovery.artists, genreArtists },
    [...spotifySuggestions, ...popularSongs],
    editorialArtists,
    { excludeCodes: favoriteCodes, connections, seedCodes },
  );
  const fallback = [...new Set(editorialArtists.map(normalize))];
  const fallbackSongs = queue.length ? queue : songs
    .filter((song) => fallback.includes(normalize(cleanArtist(song.artist))) && !favoriteCodes.has(String(song.code)))
    .map((song) => ({ ...song, source: "Sugestão da casa" }));
  discovery.queue = fallbackSongs.map((song) => String(song.code));
  discovery.index = 0;
  discovery.seen = [];
  discovery.passed = [];
  discovery.history = [];
  persistDiscovery();
  showDiscoverStep("cards");
}

function discoverySourceLabel(song) {
  if (song.source === "Relacionada") return "Relacionada";
  const isSpotify = spotifySuggestions.some((item) => item.code === song.code);
  const isChosenArtist = discovery.artists.some((name) => normalize(name) === normalize(cleanArtist(song.artist)));
  const genre = isChosenArtist ? null : genreForSong(song, discovery.genres);
  if (isSpotify) return "Do seu Spotify";
  if (isChosenArtist) return "Artista escolhido";
  if (genre) return genre.label;
  if (popularSongs.some((item) => item.code === song.code)) return "Mais popular";
  return "Sugestão da casa";
}

function skipFavoriteDiscoverySongs() {
  let moved = false;
  while (discovery.index < discovery.queue.length && favoriteCodes.has(String(discovery.queue[discovery.index]))) {
    discovery.index += 1;
    moved = true;
  }
  if (moved) persistDiscovery();
}

function currentDiscoverySong() {
  skipFavoriteDiscoverySongs();
  const code = discovery.queue[discovery.index];
  return code ? songByCode.get(code) : null;
}

function renderDiscoveryCard() {
  stopPreview();
  const song = currentDiscoverySong();
  els.undoDiscovery.disabled = discovery.history.length === 0;
  if (!song) {
    els.discoveryCard.replaceChildren();
    renderDiscoveryPeeks();
    els.cardPosition.textContent = "Sugestões concluídas";
    const saved = favoritesState.tabs.find((tab) => tab.id === DRAFT_TAB_ID)?.codes.length || 0;
    els.discoveryDescription.textContent = saved
      ? `Você tem ${saved} música${saved === 1 ? "" : "s"} na aba Rascunho das Favoritas.`
      : "Não encontramos mais músicas para estes estilos e artistas no catálogo.";
    els.changeArtists.hidden = false;
    els.restartPassed.hidden = discovery.seen.length === 0;
    return;
  }
  els.discoveryDescription.textContent = "Deslize ou use os botões: escolha músicas para cantar ou passe para a próxima.";
  const remaining = discovery.queue.slice(discovery.index).filter((code) => !favoriteCodes.has(String(code))).length;
  els.cardPosition.textContent = `Sugestão ${discovery.index + 1} · ${remaining} restante${remaining === 1 ? "" : "s"}`;
  els.restartPassed.hidden = false;

  const catalogMeta = metaFromCatalog(song);
  const { content: card, media, cover, artist } = createDiscoveryCardBody(song);
  const stamp = document.createElement("span");
  stamp.className = "discovery-stamp";
  stamp.setAttribute("aria-hidden", "true");
  media.append(stamp);
  artist.addEventListener("click", (event) => {
    event.stopPropagation();
    const name = cleanArtist(song.artist);
    closeDiscover();
    showArtistSongs(name);
  });

  const actions = document.createElement("div");
  actions.className = "discovery-card-links";

  const pass = document.createElement("button");
  pass.type = "button";
  pass.id = "pass-song";
  pass.className = "action-btn icon-action glass-btn discovery-swipe-btn discovery-pass-btn";
  setIconAction(pass, "pass");
  pass.title = "Passar";
  pass.setAttribute("aria-label", "Passar");
  pass.addEventListener("click", (event) => {
    event.stopPropagation();
    animateDiscovery("pass");
  });

  const choose = document.createElement("button");
  choose.type = "button";
  choose.id = "choose-song";
  choose.className = "action-btn icon-action glass-btn discovery-swipe-btn discovery-like-btn";
  setIconAction(choose, "heartFilled");
  choose.title = "Quero cantar";
  choose.setAttribute("aria-label", "Quero cantar");
  choose.addEventListener("click", (event) => {
    event.stopPropagation();
    animateDiscovery("choose");
  });

  const details = document.createElement("button");
  details.type = "button";
  details.className = "action-btn dj-btn icon-action glass-btn";
  setIconAction(details, "code");
  details.title = "Código";
  details.setAttribute("aria-label", `Código ao DJ: ${song.code}`);
  details.addEventListener("click", (event) => {
    event.stopPropagation();
    showSongToDJ(song);
  });

  const remind = document.createElement("button");
  remind.type = "button";
  remind.className = "action-btn icon-action glass-btn discovery-remind-btn";
  const reminded = favoriteCodes.has(String(song.code));
  setIconAction(remind, reminded ? "bookmarkFilled" : "bookmark");
  remind.title = "Relembrar depois";
  remind.setAttribute("aria-label", `Relembrar depois: ${displayTitle(song.title)}`);
  remind.setAttribute("aria-pressed", String(reminded));
  remind.addEventListener("click", (event) => {
    event.stopPropagation();
    if (favoriteCodes.has(String(song.code))) unsaveFavorite(song.code);
    else saveFavorite(song);
    renderDiscoveryCard();
  });

  const previewBtn = document.createElement("button");
  previewBtn.type = "button";
  previewBtn.className = "action-btn preview-btn icon-action glass-btn";
  setIconAction(previewBtn, "play");
  previewBtn.title = "Ouvir trecho";
  previewBtn.setAttribute("aria-label", `Ouvir trecho: ${displayTitle(song.title)}`);
  previewBtn.dataset.idleLabel = "Ouvir trecho";
  const canPreview = Boolean(catalogMeta.previewUrl || catalogMeta.deezerId);
  previewBtn.hidden = !canPreview;
  if (catalogMeta.previewUrl) previewBtn.dataset.preview = catalogMeta.previewUrl;
  previewBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    togglePreview(song, previewBtn);
  });

  const spotify = document.createElement("a");
  spotify.href = spotifySearchUrl(cleanArtist(song.artist), displayTitle(song.title));
  spotify.target = "_blank";
  spotify.rel = "noopener noreferrer";
  spotify.className = "action-link icon-action glass-btn";
  setIconAction(spotify, "spotify");
  spotify.title = "Spotify";
  spotify.setAttribute("aria-label", `Ouvir no Spotify: ${displayTitle(song.title)}`);
  spotify.addEventListener("click", (event) => event.stopPropagation());

  actions.append(pass, details, remind, previewBtn, spotify, choose);
  card.append(actions);
  els.discoveryCard.replaceChildren(card);
  renderDiscoveryPeeks();
  // Only hit Deezer when the catalog has no cover — preview resolves on click.
  if (!catalogMeta.cover) enrichDiscoveryCover(cover, song, previewBtn);
}

function createDiscoveryCover(song, src) {
  if (!src) {
    const fallback = createCoverFallback(song);
    fallback.className = "cover-fallback discovery-cover";
    return fallback;
  }
  const img = document.createElement("img");
  img.alt = "";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  img.className = "discovery-cover";
  img.src = src;
  img.addEventListener("error", () => {
    if (img.isConnected) img.replaceWith(createDiscoveryCover(song));
  }, { once: true });
  return img;
}

function createDiscoveryCardBody(song, { interactive = true } = {}) {
  const content = document.createElement("div");
  content.className = "discovery-card-content";

  const media = document.createElement("div");
  media.className = "discovery-card-media";
  const cover = createDiscoveryCover(song, metaFromCatalog(song).cover);
  const record = document.createElement("span");
  record.className = "discovery-source";
  record.textContent = discoverySourceLabel(song);
  media.append(cover, record);

  const metaBlock = document.createElement("div");
  metaBlock.className = "discovery-card-meta";
  const title = document.createElement("h4");
  title.textContent = displayTitle(song.title);
  const name = cleanArtist(song.artist);
  const artist = document.createElement(interactive ? "button" : "p");
  artist.className = "discovery-artist";
  artist.textContent = name;
  if (interactive) {
    artist.type = "button";
    artist.classList.add("discovery-artist-link");
    artist.title = `Ver músicas de ${name}`;
  }
  metaBlock.append(title, artist);

  content.append(media, metaBlock);
  return { content, media, cover, artist };
}

function upcomingDiscoverySongs(count) {
  const upcoming = [];
  for (let i = discovery.index + 1; i < discovery.queue.length && upcoming.length < count; i++) {
    const code = discovery.queue[i];
    if (favoriteCodes.has(String(code))) continue;
    const song = songByCode.get(code);
    if (song) upcoming.push(song);
  }
  return upcoming;
}

// The next songs sit behind the card, already loaded, so a swipe reveals them.
function renderDiscoveryPeeks() {
  els.discoveryDeck.querySelectorAll(".discovery-peek").forEach((el) => el.remove());
  if (!currentDiscoverySong()) return;
  upcomingDiscoverySongs(2).forEach((song, depth) => {
    const peek = document.createElement("div");
    peek.className = "discovery-card discovery-peek";
    peek.dataset.depth = String(depth + 1);
    peek.setAttribute("aria-hidden", "true");
    const { content, cover } = createDiscoveryCardBody(song, { interactive: false });
    peek.append(content);
    els.discoveryDeck.prepend(peek);
    if (!metaFromCatalog(song).cover) {
      fetchDeezerMeta(song).then((meta) => {
        if (meta?.cover && cover.isConnected) cover.replaceWith(createDiscoveryCover(song, meta.cover));
      }).catch(() => { /* fallback cover stays */ });
    }
  });
}

async function enrichDiscoveryCover(cover, song, previewBtn) {
  try {
    const meta = await fetchDeezerMeta(song);
    if (!meta || currentDiscoverySong()?.code !== song.code) return;
    if (meta.cover && cover.isConnected) cover.replaceWith(createDiscoveryCover(song, meta.cover));
    if (meta.previewUrl && previewBtn?.isConnected) {
      previewBtn.hidden = false;
      previewBtn.dataset.preview = meta.previewUrl;
    }
  } catch { /* O cartão segue funcional sem dados do Deezer. */ }
}

function moveDiscovery(action) {
  const song = currentDiscoverySong();
  if (!song) return;
  const added = action === "choose" && !favoriteCodes.has(song.code);
  discovery.history.push({ action, code: song.code, index: discovery.index, added });
  discovery.history = discovery.history.slice(-1);
  discovery.seen = [...new Set([...discovery.seen, song.code])];
  if (action === "pass" && !discovery.passed.includes(song.code)) discovery.passed.push(song.code);
  if (added) saveFavorite(song);
  discovery.index++;
  persistDiscovery();
  renderDiscoveryCard();
}

function undoDiscovery() {
  if (cardAnimating) return;
  const last = discovery.history.pop();
  if (!last) return;
  discovery.index = last.index;
  discovery.seen = discovery.seen.filter((code) => code !== last.code);
  if (last.action === "pass") discovery.passed = discovery.passed.filter((code) => code !== last.code);
  if (last.action === "choose" && last.added) unsaveFavorite(last.code);
  persistDiscovery();
  renderDiscoveryCard();
}

function renderPopularSongs() {
  const entries = popularSongs.slice(0, popularLimitOf(getFeatures()));
  els.popularList.replaceChildren(...entries.map((song) => {
    const row = document.createElement("article");
    row.className = "popular-song";
    const heading = document.createElement("button");
    heading.type = "button";
    heading.className = "popular-song-title";
    heading.textContent = displayTitle(song.title);
    heading.addEventListener("click", () => showSongToDJ(song));
    const artist = document.createElement("span");
    artist.textContent = cleanArtist(song.artist);
    row.append(heading, artist);
    return row;
  }));
  const noRanking = !entries.length;
  if (noRanking) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "O ranking está começando. Estas são as Sugestões da casa, selecionadas pela equipe.";
    const heading = document.createElement("h4");
    heading.className = "house-suggestions-heading";
    heading.textContent = "Sugestões da casa";
    const catalog = songs.filter((song) => CURATED.some((pack) => pack.artists.some((artist) => normalize(artist) === normalize(cleanArtist(song.artist))))).slice(0, 20);
    els.popularList.append(empty, heading, ...catalog.map((song) => {
      const row = document.createElement("article");
      row.className = "popular-song";
      const title = document.createElement("button");
      title.type = "button";
      title.className = "popular-song-title";
      title.textContent = displayTitle(song.title);
      title.addEventListener("click", () => showSongToDJ(song));
      const artist = document.createElement("span");
      artist.textContent = cleanArtist(song.artist);
      row.append(title, artist);
      return row;
    }));
  }
}

function showPopular() {
  showCategory({ type: "popular", label: "Mais populares" });
  els.popularView.hidden = false;
  els.songsList.hidden = true;
  renderPopularSongs();
  if (popularityOn()) fetchPopularSongs().then((entries) => {
    popularSongs = entries.map((entry) => songByCode.get(String(entry.code))).filter(Boolean);
    renderPopularSongs();
    if (popularityNeedsUpdate()) {
      els.spotifyStatus.hidden = false;
      els.spotifyStatus.textContent = "Ranking exibido com dados salvos; atualização pendente.";
    }
  });
}

function persistFavorites() {
  favoriteCodes = allCodes(favoritesState);
  if (!saveFavoritesState(favoritesState)) {
    els.spotifyStatus.hidden = false;
    els.spotifyStatus.textContent = "Não foi possível salvar suas favoritas neste navegador.";
  }
}

function updateFavoriteControls() {
  updateMobileTabs();
}

async function applyAccountFavorites() {
  if (hasStoredAuthSession()) favoritesBootSyncStarted = true;
  const remote = await syncAccountFavorites(favoriteCodes);
  if (!remote) return;
  const merged = mergeFavoriteCodes(favoriteCodes, remote, (code) => songByCode.has(code));
  const incoming = [...merged].filter((code) => !favoriteCodes.has(code));
  if (!incoming.length) return;
  for (const code of incoming) favoritesState = addToTab(favoritesState, code, DRAFT_TAB_ID);
  persistFavorites();
  updateFavoriteControls();
  if (favoritesOnly) applyFilters();
  else refreshFavoriteButtons();
}

/** Soft CTA once per visit when the first favorite is saved without a permanent account. */
async function maybePromptAccountForFavorites() {
  if (!publicAuthEnabled() || !showFavoritesSync(getFeatures()) || accountFavoritesPromptShown) return;
  try {
    if (await getCurrentUser()) return;
  } catch {
    return;
  }
  accountFavoritesPromptShown = true;
  const link = document.createElement("a");
  link.href = `login.html?next=${encodeURIComponent("index.html#buscar")}`;
  link.textContent = "Entre";
  els.spotifyStatus.hidden = false;
  els.spotifyStatus.replaceChildren(
    link,
    document.createTextNode(" para guardar as favoritas entre aparelhos."),
  );
}

async function watchAccountFavorites() {
  if (!authBackendReady) return;
  let skipRecoverySignedIn = true;
  await onAuthChange(async (event) => {
    if (event === "SIGNED_OUT") {
      setFavoriteSyncActive(false);
      favoritesBootSyncStarted = false;
      skipRecoverySignedIn = false;
      return;
    }
    if (event === "SIGNED_IN" || event === "USER_UPDATED") {
      if (event === "SIGNED_IN" && skipRecoverySignedIn && favoritesBootSyncStarted) {
        skipRecoverySignedIn = false;
        return;
      }
      skipRecoverySignedIn = false;
      await applyAccountFavorites();
    }
  });
}

function refreshFavoriteButtons(onlyCode = null) {
  document.querySelectorAll(".favorite-btn").forEach((button) => {
    if (onlyCode && button.dataset.code !== onlyCode) return;
    const song = songByCode.get(button.dataset.code);
    if (!song) return;
    paintFavoriteButton(button, favoriteCodes.has(song.code), displayTitle(song.title));
  });
}

function onFavoritesChanged(code) {
  if (favoritesOnly) applyFilters();
  else if (code) refreshFavoriteButtons(code);
  updateFavoriteControls();
}

function saveFavorite(song) {
  const code = String(song.code);
  if (favoriteCodes.has(code)) return;
  const wasEmpty = favoriteCodes.size === 0;
  favoritesState = addToTab(favoritesState, code, DRAFT_TAB_ID);
  setSongFavorite(code, true);
  persistFavorites();
  onFavoritesChanged(code);
  if (wasEmpty) void maybePromptAccountForFavorites();
}

function unsaveFavorite(code) {
  const key = String(code);
  if (!favoriteCodes.has(key)) return;
  favoritesState = removeSong(favoritesState, key);
  setSongFavorite(key, false);
  persistFavorites();
  onFavoritesChanged(key);
}

function addFavorites(newSongs) {
  for (const song of newSongs) favoritesState = addToTab(favoritesState, String(song.code), DRAFT_TAB_ID);
  persistFavorites();
  updateFavoriteControls();
}

function toggleFavorite(song) {
  if (favoriteCodes.has(song.code)) unsaveFavorite(song.code);
  else saveFavorite(song);
}

function hideRelatedArtists() {
  relatedRequest++;
  els.relatedSection.hidden = true;
  els.relatedList.replaceChildren();
}

function relatedArtistsFromConnections(artist) {
  if (!songConnections) return [];
  const artistNorm = normalize(artist);
  const seeds = songs.filter((song) => normalize(cleanArtist(song.artist)) === artistNorm).slice(0, 8);
  const names = [];
  const seen = new Set([artistNorm]);
  for (const seed of seeds) {
    for (const code of relatedCodesFor(songConnections, seed.code, { limit: 12 })) {
      const related = songByCode.get(String(code));
      if (!related) continue;
      const name = cleanArtist(related.artist);
      const key = normalize(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      names.push(name);
      if (names.length >= 8) return names;
    }
  }
  return names;
}

async function renderRelatedArtists(artist) {
  if (!discoveryOn()) { hideRelatedArtists(); return; }
  const request = ++relatedRequest;
  els.relatedSection.hidden = false;
  els.relatedTitle.textContent = "Buscando artistas relacionados…";
  els.relatedList.replaceChildren();

  await ensureSongConnections();
  if (request !== relatedRequest) return;
  let suggestions = relatedArtistsFromConnections(artist);
  let source = suggestions.length ? "offline" : null;

  if (!suggestions.length) {
    const names = await fetchRelatedArtists(artist);
    if (request !== relatedRequest) return;
    const byName = new Map(songs.map((song) => [normalize(cleanArtist(song.artist)), cleanArtist(song.artist)]));
    suggestions = names
      .map((name) => byName.get(normalize(name)))
      .filter((name) => name && normalize(name) !== normalize(artist));
    suggestions = [...new Set(suggestions)].slice(0, 8);
    if (suggestions.length) source = "deezer";
  }

  if (!suggestions.length) {
    suggestions = curatedArtistSuggestions(songs, artist, CURATED);
    if (suggestions.length) source = "curated";
  }
  if (request !== relatedRequest) return;
  if (!suggestions.length) {
    els.relatedSection.hidden = true;
    return;
  }
  els.relatedTitle.textContent = source === "curated" ? "Explore também" : "Artistas relacionados no catálogo";
  for (const name of suggestions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "artist-chip";
    button.textContent = name;
    button.addEventListener("click", () => showArtistSongs(name));
    els.relatedList.append(button);
  }
}

let relatedRenderGeneration = 0;
let disposeRecommendations = () => {};

async function renderDialogRelated(song) {
  if (!discoveryOn()) {
    if (els.dialogRelated) els.dialogRelated.hidden = true;
    return;
  }
  const generation = ++relatedRenderGeneration;
  disposeRecommendations();
  if (!els.dialogRelated || !els.dialogRelatedList) return;
  els.dialogRelatedList.replaceChildren();
  els.dialogRelated.hidden = true;
  await Promise.all([ensureSongConnections(), ensureSongCovers()]);
  if (generation !== relatedRenderGeneration || activeSong?.code !== song.code) return;
  const codes = relatedCodesFor(songConnections, song.code, { limit: 8 });
  const relatedSongs = codes.map((code) => songByCode.get(String(code))).filter(Boolean)
    .filter((item) => String(item.code) !== String(song.code));
  if (!relatedSongs.length) {
    els.dialogRelated.hidden = true;
    return;
  }
  els.dialogRelated.hidden = false;
  for (const related of relatedSongs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "song-recommendation";
    const cover = document.createElement("span");
    cover.className = "recommendation-cover";
    cover.setAttribute("aria-hidden", "true");
    cover.append(createCoverFallback(related));
    setCoverImage(cover, related, metaFromCatalog(related).cover);
    const text = document.createElement("span");
    text.className = "recommendation-text";
    const title = document.createElement("strong");
    title.textContent = displayTitle(related.title);
    const artist = document.createElement("span");
    artist.textContent = cleanArtist(related.artist);
    text.append(title, artist);
    button.append(cover, text);
    button.addEventListener("click", () => showSongToDJ(related));
    els.dialogRelatedList.append(button);
  }
  disposeRecommendations = initializeRecommendationCarousel(els.dialogRelated);
}

function showArtistSongs(artist) {
  const next = filtersForArtistSelection(artist);
  selectedArtist = next.artist;
  selectedLanguage = next.language;
  favoritesOnly = next.favoritesOnly;
  activeCategory = next.category;
  els.popularView.hidden = true;
  els.songsList.hidden = false;
  els.searchInput.value = next.query;
  els.clearButton.hidden = true;
  els.activeFilter.textContent = activeCategory?.label || `Artista: ${selectedArtist}`;
  const artistSearch = document.querySelector("#filter-artist-search");
  if (artistSearch) artistSearch.value = "";
  populateArtistFilter();
  setBrowseMode(false);
  updateFavoriteControls();
  applyFilters();
  collapseFiltersPanel();
  renderRelatedArtists(artist);
  els.resultsView.scrollIntoView({ behavior: "smooth", block: "start" });
}

let selectedLanguage = "";
let selectedArtist = "";
function filteredCatalog(query = "") {
  return filterCatalog(songs, { query, language: selectedLanguage, artist: selectedArtist, favoritesOnly, favoriteCodes, category: activeCategory });
}
function populateArtistFilter() {
  const select = document.querySelector("#filter-artist");
  const query = normalize(document.querySelector("#filter-artist-search").value);
  const names = [...new Set(songs.map((song) => cleanArtist(song.artist)))].sort((a,b) => a.localeCompare(b, "pt-BR"));
  select.replaceChildren(new Option("Todos os artistas", ""), ...names.filter((name) => name === selectedArtist || normalize(name).includes(query)).map((name) => new Option(name, name)));
  select.value = selectedArtist;
}
function syncFilterControls() {
  document.querySelector("#filter-language").value = selectedLanguage;
  document.querySelector("#filter-artist").value = selectedArtist;
  document.querySelector("#filter-favorites").checked = favoritesOnly;
  const chips = document.querySelector("#active-filter-chips");
  chips.replaceChildren();
  const browsingArtist = activeCategory?.type === "artist";
  const entries = [
    selectedLanguage && [LANG_LABELS[selectedLanguage], () => { selectedLanguage = ""; }],
    selectedArtist && !browsingArtist && [selectedArtist, () => { selectedArtist = ""; }],
    favoritesOnly && ["Favoritas", () => { favoritesOnly = false; }],
    activeCategory && ["letter", "artists"].includes(activeCategory.type) && [activeCategory.label, () => { activeCategory = null; }],
  ].filter(Boolean);
  for (const [label, remove] of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-suggestion";
    button.textContent = `${label} ×`;
    button.setAttribute("aria-label", `Remover filtro ${label}`);
    button.onclick = () => { remove(); refreshFilteredSearch(); };
    chips.append(button);
  }
  const count = countActiveFilterChips({
    language: selectedLanguage,
    artist: selectedArtist,
    favoritesOnly,
    category: activeCategory,
  });
  document.querySelector("#toggle-filters").textContent = filtersToggleLabel(count);
}
/** The search lives in the top bar, above the hero; bring its results up when the section is still below. */
function revealSearchSection() {
  const section = els.searchSection;
  if (!section || section.getBoundingClientRect().top < window.innerHeight * 0.5) return;
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  section.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
}
function refreshFilteredSearch() {
  if (activeCategory?.type === "popular") activeCategory = null;
  els.popularView.hidden = true;
  els.songsList.hidden = false;
  setBrowseMode(false);
  els.activeFilter.textContent = "Resultados da busca";
  applyFilters();
  revealSearchSection();
}
function applyFilters() {
  filtered = filteredCatalog(els.searchInput.value.trim());
  visibleCount = PAGE_SIZE;
  syncFilterControls();
  renderSearchSuggestions();
  renderResults();
}

const filtersToggle = document.querySelector("#toggle-filters");
const catalogFiltersPanel = document.querySelector("#catalog-filters");
const searchChrome = document.querySelector(".spotify-search-chrome");

function setFiltersPanelOpen(open) {
  catalogFiltersPanel.hidden = !open;
  filtersToggle.setAttribute("aria-expanded", String(open));
  searchChrome?.classList.toggle("is-filters-open", open);
}

function collapseFiltersPanel() {
  setFiltersPanelOpen(false);
}

filtersToggle.addEventListener("click", () => {
  setFiltersPanelOpen(catalogFiltersPanel.hidden);
});
document.querySelector("#filter-language").addEventListener("change", (event) => {
  selectedLanguage = event.target.value;
  refreshFilteredSearch();
  collapseFiltersPanel();
});
document.querySelector("#filter-artist-search").addEventListener("input", populateArtistFilter);
document.querySelector("#filter-artist").addEventListener("change", (event) => {
  selectedArtist = event.target.value;
  refreshFilteredSearch();
  collapseFiltersPanel();
});
document.querySelector("#filter-favorites").addEventListener("change", (event) => {
  favoritesOnly = event.target.checked;
  refreshFilteredSearch();
  collapseFiltersPanel();
});
document.querySelector("#clear-filters").addEventListener("click", () => {
  selectedLanguage = ""; selectedArtist = ""; favoritesOnly = false; activeCategory = null;
  document.querySelector("#filter-artist-search").value = "";
  populateArtistFilter();
  updateFavoriteControls();
  refreshFilteredSearch();
  collapseFiltersPanel();
});

function setBrowseMode(browse) {
  els.browseView.hidden = !browse;
  els.catalogTitle.hidden = !browse;
  els.resultsView.hidden = browse;
}

function showCategory(category) {
  if (category.type === "lang") {
    selectedLanguage = category.value;
    activeCategory = null;
  } else if (category.type === "artist") {
    const next = filtersForArtistSelection(category.value);
    selectedArtist = next.artist;
    selectedLanguage = next.language;
    favoritesOnly = next.favoritesOnly;
    activeCategory = next.category;
    els.searchInput.value = next.query;
    const artistSearch = document.querySelector("#filter-artist-search");
    if (artistSearch) artistSearch.value = "";
    populateArtistFilter();
  } else {
    activeCategory = category;
  }
  updateFavoriteControls();
  hideRelatedArtists();
  if (category.type !== "artist") els.searchInput.value = "";
  els.clearButton.hidden = true;
  setBrowseMode(false);
  els.popularView.hidden = true;
  els.songsList.hidden = false;
  els.activeFilter.textContent = category.label;
  applyFilters();
  els.resultsView.scrollIntoView({ behavior: "smooth", block: "start" });
}

function backToBrowse() {
  favoritesOnly = false;
  activeCategory = null;
  syncFilterControls();
  hideRelatedArtists();
  updateFavoriteControls();
  els.searchInput.value = "";
  els.clearButton.hidden = true;
  setBrowseMode(true);
  els.popularView.hidden = true;
  els.songsList.hidden = false;
  els.resultsCount.textContent = `${songs.length.toLocaleString("pt-BR")} músicas no catálogo`;
  els.songsList.replaceChildren();
  stopPreview();
}

const rowMeta = createRowMetaLoader({ songFor: (code) => songByCode.get(code), ensureCovers: ensureSongCovers });

function renderSongRow(song) {
  return createSongRow(song, {
    favorite: favoriteCodes.has(song.code),
    onShowCode: showSongToDJ,
    onShowArtist: showArtistSongs,
    onToggleFavorite: toggleFavorite,
    onTogglePreview: togglePreview,
  });
}

function renderResults() {
  const slice = filtered.slice(0, visibleCount);
  const rows = slice.map(renderSongRow);
  els.songsList.replaceChildren(...rows);
  applyResultsView();
  rowMeta.observe(rows);

  const total = filtered.length;
  const q = els.searchInput.value.trim();
  if (activeCategory || q || selectedLanguage || selectedArtist || favoritesOnly) {
    els.resultsCount.textContent =
      total === 1 ? "1 música encontrada" : `${total.toLocaleString("pt-BR")} músicas encontradas`;
  } else {
    els.resultsCount.textContent = `${songs.length.toLocaleString("pt-BR")} músicas no catálogo`;
  }

  els.emptyState.hidden = total !== 0;
  els.emptyState.textContent = favoritesOnly && !q
    ? "Você ainda não salvou músicas. Use “Descobrir minha música” ou Favoritar nas que quiser cantar."
    : "Nenhuma música encontrada com esta busca e os filtros ativos. Tente menos palavras ou use Limpar filtros.";
  els.loadMore.hidden = visibleCount >= total;
  els.clearButton.hidden = q.length === 0;
  updateFavoriteControls();
}

function stopPreview() {
  els.previewAudio.pause();
  els.previewAudio.removeAttribute("src");
  previewCode = null;
  document.querySelectorAll(".preview-btn.is-playing").forEach((btn) => paintPreviewButton(btn, false));
}

function setDialogCover(song, coverUrl = null) {
  if (!els.dialogCover) return;
  if (coverUrl) {
    const img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.src = coverUrl;
    img.addEventListener("error", () => {
      if (activeSong?.code === song.code && els.dialogCover) {
        els.dialogCover.replaceChildren(createCoverFallback(song));
      }
    }, { once: true });
    els.dialogCover.replaceChildren(img);
    return;
  }
  els.dialogCover.replaceChildren(createCoverFallback(song));
}

function resetDialogListen(song) {
  if (els.dialogPreview) {
    els.dialogPreview.hidden = true;
    delete els.dialogPreview.dataset.preview;
    els.dialogPreview.classList.remove("is-playing");
    els.dialogPreview.textContent = els.dialogPreview.dataset.idleLabel || "Ouvir trecho";
  }
  if (els.dialogRelated) {
    els.dialogRelated.hidden = true;
    els.dialogRelatedList?.replaceChildren();
  }
  if (els.dialogSpotify) {
    const artist = song.artist.replace(/\.\.\.$/, "");
    const title = displayTitle(song.title);
    els.dialogSpotify.href = spotifySearchUrl(artist, title);
    els.dialogSpotify.setAttribute("aria-label", `Ouvir no Spotify: ${title}`);
    els.dialogSpotify.hidden = false;
  }
}

function applyDialogMeta(song, meta) {
  if (!meta || activeSong?.code !== song.code) return;
  if (meta.cover) setDialogCover(song, meta.cover);
  if (deezerOn() && meta.previewUrl && els.dialogPreview) {
    els.dialogPreview.hidden = false;
    els.dialogPreview.dataset.preview = meta.previewUrl;
    if (previewCode === song.code && !els.previewAudio.paused) {
      els.dialogPreview.classList.add("is-playing");
      els.dialogPreview.textContent = "Pausar";
    }
  }
  // Keep search results in sync when the dialog is the first place the cover arrives.
  rowMeta.syncSongMeta(song, meta);
  if (meta.cover && currentDiscoverySong()?.code === song.code) {
    const fallback = els.discoveryCard?.querySelector(".cover-fallback, .discovery-cover");
    if (fallback && !els.discoveryCard.querySelector("img")) {
      const img = document.createElement("img");
      img.alt = "";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.src = meta.cover;
      img.addEventListener("error", () => {
        if (fallback.isConnected && currentDiscoverySong()?.code === song.code) {
          fallback.replaceWith(createCoverFallback(song));
        }
      }, { once: true });
      fallback.replaceWith(img);
    }
  }
}

async function togglePreview(song, button) {
  if (previewCode === song.code && !els.previewAudio.paused) {
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
  if (!url) return;
  if (!button.isConnected) return;
  stopPreview();
  previewCode = song.code;
  els.previewAudio.src = url;
  els.previewAudio.play().catch(() => stopPreview());
  paintPreviewButton(button, true);
}

els.previewAudio.addEventListener("ended", stopPreview);

function showSongToDJ(song) {
  activeSong = song;
  recordSongOpen(song.code);
  trackEvent("abrir_musica", { code: song.code });
  dialogReturnFocus = document.activeElement;
  document.querySelector("#dialog-song").textContent = `${displayTitle(song.title)} — ${song.artist.replace(/\.\.\.$/, "")}`;
  document.querySelector("#dialog-code").textContent = song.code;
  els.copyCode.textContent = "Copiar código";
  els.copyCodeStatus.textContent = "";
  if (copyTimer) clearTimeout(copyTimer);
  els.dialog.classList.remove("copy-sticky-visible");
  prepareSongRequest(song);

  resetDialogListen(song);
  const row = document.querySelector(`.song-row[data-code="${song.code}"]`);
  const discoveryMatch = currentDiscoverySong()?.code === song.code;
  const paintDialogMeta = () => {
    if (activeSong?.code !== song.code) return;
    const catalogMeta = metaFromCatalog(song);
    const liveCover =
      catalogMeta.cover
      || row?.querySelector(".song-cover img")?.currentSrc
      || row?.querySelector(".song-cover img")?.src
      || (discoveryMatch ? els.discoveryCard?.querySelector("img")?.currentSrc || els.discoveryCard?.querySelector("img")?.src : null)
      || null;
    const livePreview =
      catalogMeta.previewUrl
      || row?.querySelector(".preview-btn")?.dataset.preview
      || (discoveryMatch ? els.discoveryCard?.querySelector(".preview-btn")?.dataset.preview : null)
      || null;
    setDialogCover(song, liveCover);
    if (deezerOn() && els.dialogPreview && (livePreview || catalogMeta.deezerId)) {
      els.dialogPreview.hidden = false;
      if (livePreview) els.dialogPreview.dataset.preview = livePreview;
      if (previewCode === song.code && !els.previewAudio.paused) {
        els.dialogPreview.classList.add("is-playing");
        els.dialogPreview.textContent = "Pausar";
      }
    }

    // Skip network when the catalog already has the cover for this code.
    if (!catalogMeta.cover) {
      const gen = ++dialogMetaGen;
      fetchDeezerMeta(song).then((meta) => {
        if (gen !== dialogMetaGen || activeSong?.code !== song.code) return;
        applyDialogMeta(song, meta);
      }).catch(() => { /* Dialog follows without Deezer meta. */ });
    } else if (catalogMeta.previewUrl || catalogMeta.cover) {
      applyDialogMeta(song, catalogMeta);
    }
  };
  void ensureSongCovers().then(paintDialogMeta);
  void renderDialogRelated(song);

  if (typeof els.dialog.showModal === "function") els.dialog.showModal();
}

initializeSongDialogActions(els.dialog);

els.copyCode.addEventListener("click", async () => {
  try {
    if (!activeSong) throw new Error("Código indisponível.");
    if (!navigator.clipboard?.writeText) throw new Error("A cópia automática não está disponível.");
    await navigator.clipboard.writeText(String(activeSong.code));
    els.copyCode.textContent = "Copiado!";
    els.copyCodeStatus.textContent = "Código copiado. Mostre ao DJ.";
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      els.copyCode.textContent = "Copiar código";
      els.copyCodeStatus.textContent = "";
    }, 2000);
  } catch {
    els.copyCodeStatus.textContent = "Não foi possível copiar automaticamente. Selecione o código e copie manualmente.";
  }
});
els.dialogPreview?.addEventListener("click", () => {
  if (activeSong) togglePreview(activeSong, els.dialogPreview);
});
els.dialog.addEventListener("close", () => {
  relatedRenderGeneration++;
  disposeRecommendations();
  dialogMetaGen++;
  stopPreview();
  activeSong = null;
  clearSongRequest();
  if (dialogReturnFocus?.isConnected) dialogReturnFocus.focus({ preventScroll: true });
});

function categorySongs(id) {
  if (id.startsWith("lang-")) return songs.filter((song) => song.lang === id.slice(5));
  if (id.startsWith("az-")) return songs.filter((song) => normalize(cleanArtist(song.artist)).startsWith(normalize(id.slice(3))));
  const pack = CURATED.find((item) => item.id === id) || CURATED[id === "popular" ? 1 : 0];
  return pack.artists.flatMap((artist) => songs.filter((song) => normalize(cleanArtist(song.artist)) === normalize(artist)).slice(0, 2));
}

async function loadCategoryCover(art, candidates) {
  for (const song of candidates.slice(0, 4)) {
    const catalog = metaFromCatalog(song);
    const meta = catalog.cover ? catalog : await fetchDeezerMeta(song);
    if (!meta?.cover || !art.isConnected) continue;
    const image = new Image();
    image.alt = "";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.onload = () => art.replaceChildren(image);
    image.src = meta.cover;
    return;
  }
}

const categoryCoverObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    categoryCoverObserver.unobserve(entry.target);
    loadCategoryCover(entry.target.querySelector(".category-art"), categorySongs(entry.target.dataset.categoryId));
  }
}, { rootMargin: "150px" });

function renderSearchSuggestions() {
  const container = document.querySelector("#search-suggestions");
  const q = els.searchInput.value.trim();
  container.replaceChildren();
  if (!songs.length || !q) return;
  const matches = filteredCatalog(q);
  const options = [];
  for (const song of matches) {
    const artist = cleanArtist(song.artist);
    if (normalize(artist).includes(normalize(q)) && !options.some((item) => item.artist === artist)) options.push({ artist });
    if (options.length === 2) break;
  }
  for (const song of matches.slice(0, 3)) options.push({ song });
  const label = document.createElement("p");
  label.textContent = matches.length ? "Você está procurando…" : "Tente menos palavras, confira o nome ou remova um filtro.";
  container.append(label);
  const examples = options;
  for (const item of examples) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-suggestion";
    button.textContent = item.artist ? `Artista: ${item.artist}` : `${displayTitle(item.song.title)} · ${cleanArtist(item.song.artist)}`;
    button.addEventListener("click", () => {
      if (item.artist) showArtistSongs(item.artist);
      else showSongToDJ(item.song);
    });
    container.append(button);
  }
}

function createCategoryTile({ id, title, color, onClick, artLabel }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "category-tile";
  btn.style.setProperty("--tile", color);
  btn.setAttribute("role", "listitem");
  btn.dataset.categoryId = id;

  const name = document.createElement("span");
  name.className = "category-name";
  name.textContent = title;

  const art = document.createElement("span");
  art.className = "category-art";
  art.setAttribute("aria-hidden", "true");
  art.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="#24252b"/><circle cx="50" cy="50" r="41" fill="#111216"/><circle cx="50" cy="50" r="32" fill="none" stroke="#42434a"/><circle cx="50" cy="50" r="23" fill="none" stroke="#42434a"/><circle cx="50" cy="50" r="13" fill="var(--tile)"/><circle cx="50" cy="50" r="3" fill="#f7f3e9"/></svg>';

  btn.append(name, art);
  btn.addEventListener("click", onClick);
  return btn;
}

function buildCategories() {
  const tiles = [];

  if (popularityOn()) tiles.push(createCategoryTile({ id: "popular", title: "Mais populares", color: "#1e3264", artLabel: "★", onClick: showPopular }));

  for (const pack of CURATED) {
    tiles.push(
      createCategoryTile({
        id: pack.id,
        title: pack.title,
        color: pack.color,
        artLabel: "★",
        onClick: () =>
          showCategory({
            type: "artists",
            value: pack.artists,
            label: pack.title,
          }),
      })
    );
  }

  const langOrder = ["BRA", "EUA", "JAP", "ITA", "ESP", "FRA"];
  const present = new Set(songs.map((s) => s.lang));
  for (const lang of langOrder) {
    if (!present.has(lang)) continue;
    tiles.push(
      createCategoryTile({
        id: `lang-${lang}`,
        title: LANG_LABELS[lang] || lang,
        color: LANG_COLORS[lang] || "#535353",
        onClick: () =>
          showCategory({
            type: "lang",
            value: lang,
            label: LANG_LABELS[lang] || lang,
          }),
      })
    );
  }

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  for (const letter of letters) {
    const count = songs.filter((s) => normalize(s.artist).startsWith(normalize(letter))).length;
    if (!count) continue;
    tiles.push(
      createCategoryTile({
        id: `az-${letter}`,
        title: `Artistas ${letter}`,
        color: colorFromCode(letter + count),
        artLabel: letter,
        onClick: () =>
          showCategory({
            type: "letter",
            value: letter,
            label: `Artistas · ${letter}`,
          }),
      })
    );
  }

  els.categoryGrid.replaceChildren(...tiles);
  tiles.forEach((tile) => categoryCoverObserver.observe(tile));
  const languageSelect = document.querySelector("#filter-language");
  languageSelect.replaceChildren(new Option("Todos os idiomas", ""), ...langOrder.filter((lang) => present.has(lang)).map((lang) => new Option(LANG_LABELS[lang], lang)));
  populateArtistFilter();
  renderSearchSuggestions();
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

const onSearchInput = debounce(() => {
  renderSearchSuggestions();
  els.popularView.hidden = true;
  els.songsList.hidden = false;
  const q = els.searchInput.value.trim();
  if (q) {
    setBrowseMode(false);
    if (favoritesOnly) els.activeFilter.textContent = `Suas favoritas · “${q}”`;
    else if (!activeCategory) els.activeFilter.textContent = `Busca: “${q}”`;
    else els.activeFilter.textContent = `${activeCategory.label} · “${q}”`;
    revealSearchSection();
  } else if (!activeCategory && !favoritesOnly && !selectedLanguage && !selectedArtist) {
    setBrowseMode(true);
    els.resultsCount.textContent = `${songs.length.toLocaleString("pt-BR")} músicas no catálogo`;
    return;
  } else {
    els.activeFilter.textContent = favoritesOnly ? "Suas favoritas" : (activeCategory?.label || "Resultados da busca");
  }
  applyFilters();
}, 160);

els.searchInput.addEventListener("input", onSearchInput);
const trackSearch = debounce(() => {
  const term = els.searchInput.value.trim();
  if (term.length >= 2) trackEvent("busca", { search_term: term.slice(0, 60) });
}, 1500);
els.searchInput.addEventListener("input", trackSearch);
els.clearButton.addEventListener("click", () => {
  els.searchInput.value = "";
  els.clearButton.hidden = true;
  renderSearchSuggestions();
  if (activeCategory || favoritesOnly || selectedLanguage || selectedArtist) {
    els.activeFilter.textContent = favoritesOnly ? "Suas favoritas" : (activeCategory?.label || "Resultados da busca");
    applyFilters();
  } else {
    backToBrowse();
  }
  els.searchInput.focus();
});
els.backToBrowse.addEventListener("click", backToBrowse);
els.artistSearch.addEventListener("input", renderArtistOptions);
els.artistViewGrid.addEventListener("click", () => setArtistView("grid"));
els.artistViewList.addEventListener("click", () => setArtistView("list"));
els.confirmGenres.addEventListener("click", () => { if (discovery.genres.length) showDiscoverStep("artists"); });
els.artistSelectionToggle?.addEventListener("click", () => {
  if (!discovery.artists.length) return;
  setArtistSelectionOpen(!artistSelectionOpen);
});
els.startDiscovery.addEventListener("click", () => startDiscovery());
els.skipArtistPicker.addEventListener("click", () => startDiscovery([]));
els.changeArtists.addEventListener("click", () => showDiscoverStep("genres"));
function applyCatalogFeatures() {
  const features = getFeatures();
  const discovery = discoveryOn();
  const favorites = favoritesOn();
  const spotify = spotifyConfigured();
  const notice = siteNoticeOf(features);
  if (els.siteNotice && els.siteNoticeText) {
    els.siteNoticeText.textContent = notice;
    els.siteNotice.hidden = !notice;
  }
  if (els.discoverFab) els.discoverFab.hidden = !discovery;
  const favFilter = document.querySelector("#filter-favorites")?.closest("label");
  if (favFilter) favFilter.hidden = !favorites;
  if (!favorites) favoritesOnly = false;
  if (els.goToFavorites) els.goToFavorites.hidden = !favorites;
  document.querySelectorAll(".favorite-btn").forEach((button) => { button.hidden = !favorites; });
  if (!deezerOn() && els.dialogPreview) els.dialogPreview.hidden = true;
  if (!discovery) {
    hideRelatedArtists();
    if (els.dialogRelated) els.dialogRelated.hidden = true;
    if (els.discoverDialog?.open) closeDiscover();
  }
  if (els.spotifyButton) els.spotifyButton.hidden = !spotify;
  if (els.spotifyStatus) {
    if (!spotify) els.spotifyStatus.hidden = true;
    else if (!els.spotifyStatus.textContent) {
      els.spotifyStatus.hidden = false;
      els.spotifyStatus.textContent = "Com sua autorização, usamos suas músicas mais ouvidas para sugerir opções disponíveis no karaokê.";
    }
  }
}

applyCatalogFeatures();
els.discoverFab.addEventListener("click", openDiscover);
els.closeDiscover.addEventListener("click", closeDiscover);
els.discoverBack.addEventListener("click", discoverBack);
els.discoverDialog.addEventListener("close", () => {
  stopPreview();
  document.documentElement.classList.remove("discover-open");
});
els.goToFavorites.addEventListener("click", () => {
  closeDiscover();
  favoritesState = setActiveTab(favoritesState, DRAFT_TAB_ID);
  persistFavorites();
  location.assign(new URL(FAVORITES_PAGE, location.href).href);
});
let cardPointerStart = null;
let cardAnimating = false;
let cardSuppressClick = false;
let cardTouchFallbackId = null;
const supportsPointer = typeof window.PointerEvent === "function";

function resetCardDrag({ keepSuppress = false } = {}) {
  const start = cardPointerStart;
  cardPointerStart = null;
  cardTouchFallbackId = null;
  if (!keepSuppress) cardSuppressClick = false;
  els.discoveryCard.classList.remove("is-dragging");
  els.discoveryCard.style.removeProperty("transform");
  els.discoveryDeck.style.removeProperty("--swipe-strength");
  delete els.discoveryCard.dataset.direction;
  if (start?.captured && start.id != null) {
    try {
      if (els.discoveryCard.hasPointerCapture?.(start.id)) {
        els.discoveryCard.releasePointerCapture(start.id);
      }
    } catch { /* capture may already be gone */ }
  }
}

function animateDiscovery(action) {
  if (cardAnimating || !currentDiscoverySong()) return;
  cardAnimating = true;
  const committedCode = currentDiscoverySong().code;
  stopPreview();
  const direction = action === "choose" ? 1 : -1;
  els.discoveryCard.classList.remove("is-dragging");
  els.discoveryCard.dataset.direction = action;
  els.discoveryDeck.style.setProperty("--swipe-strength", "1");
  els.discoveryCard.style.transform = `translateX(${direction * (els.discoveryCard.offsetWidth + 80)}px) rotate(${direction * 18}deg)`;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.setTimeout(() => {
    // The risen peek already sits where the next card goes, so snap into place instead of sliding back.
    els.discoveryDeck.classList.add("is-settling");
    resetCardDrag();
    if (currentDiscoverySong()?.code === committedCode) moveDiscovery(action);
    void els.discoveryDeck.offsetWidth;
    els.discoveryDeck.classList.remove("is-settling");
    cardAnimating = false;
  }, reduced ? 0 : 220);
}

function beginCardSwipe(event, { clientX, clientY, pointerId, pointerType }) {
  if (cardAnimating || !currentDiscoverySong()) return false;
  cardSuppressClick = false;
  cardPointerStart = {
    id: pointerId,
    x: clientX,
    y: clientY,
    t: performance.now(),
    horizontal: false,
    captured: false,
    fromInteractive: isInteractiveSwipeTarget(event.target),
    pointerType: pointerType || "unknown",
  };
  return true;
}

function lockCardHorizontal(start, pointerId) {
  start.horizontal = true;
  start.captured = true;
  els.discoveryCard.classList.add("is-dragging");
  if (pointerId != null && els.discoveryCard.setPointerCapture) {
    try { els.discoveryCard.setPointerCapture(pointerId); } catch { /* older WebViews */ }
  }
}

function paintCardDrag(dx) {
  els.discoveryCard.dataset.direction = swipeActionFromDx(dx);
  els.discoveryDeck.style.setProperty("--swipe-strength", String(swipeStrength(dx)));
  // translate3d keeps iOS Safari on the compositor during drag
  els.discoveryCard.style.transform = `translate3d(${dx}px, 0, 0) rotate(${dx / 22}deg)`;
}

function moveCardSwipe(clientX, clientY, pointerId, event) {
  const start = cardPointerStart;
  if (!start || (pointerId != null && start.id !== pointerId)) return;
  const { dx, dy } = swipeDelta(start, clientX, clientY);
  if (!start.horizontal) {
    const axis = resolveSwipeAxis(dx, dy);
    if (axis === "vertical") {
      resetCardDrag();
      return;
    }
    if (axis !== "horizontal") return;
    lockCardHorizontal(start, pointerId ?? start.id);
  }
  if (start.fromInteractive) cardSuppressClick = true;
  // Block page scroll once horizontal intent is locked (needs non-passive touch listeners).
  if (event?.cancelable) event.preventDefault();
  paintCardDrag(dx);
}

function endCardSwipe(clientX, clientY, pointerId) {
  const start = cardPointerStart;
  if (!start || (pointerId != null && start.id !== pointerId)) return;
  const { dx } = swipeDelta(start, clientX, clientY);
  const elapsedMs = performance.now() - start.t;
  const horizontal = start.horizontal;
  const suppress = Boolean(start.fromInteractive && horizontal);
  if (start.captured && start.id != null) {
    try {
      if (els.discoveryCard.hasPointerCapture?.(start.id)) {
        els.discoveryCard.releasePointerCapture(start.id);
      }
    } catch { /* capture may already be gone */ }
  }
  cardPointerStart = null;
  cardTouchFallbackId = null;
  els.discoveryCard.classList.remove("is-dragging");
  if (horizontal && shouldCommitSwipe({ dx, elapsedMs, cardWidth: els.discoveryCard.offsetWidth })) {
    cardSuppressClick = true;
    animateDiscovery(swipeActionFromDx(dx));
    return;
  }
  cardSuppressClick = suppress;
  els.discoveryCard.style.removeProperty("transform");
  els.discoveryDeck.style.removeProperty("--swipe-strength");
  delete els.discoveryCard.dataset.direction;
}

els.discoveryCard.addEventListener("pointerdown", (event) => {
  if (!supportsPointer) return;
  if (!event.isPrimary || event.button !== 0) return;
  beginCardSwipe(event, {
    clientX: event.clientX,
    clientY: event.clientY,
    pointerId: event.pointerId,
    pointerType: event.pointerType,
  });
});
els.discoveryCard.addEventListener("pointermove", (event) => {
  if (!supportsPointer) return;
  moveCardSwipe(event.clientX, event.clientY, event.pointerId, event);
});
els.discoveryCard.addEventListener("pointerup", (event) => {
  if (!supportsPointer) return;
  endCardSwipe(event.clientX, event.clientY, event.pointerId);
});
els.discoveryCard.addEventListener("pointercancel", () => {
  if (!supportsPointer) return;
  resetCardDrag({ keepSuppress: cardSuppressClick });
});
// Do not reset on lostpointercapture: some WebViews fire it around pointerup and
// would cancel a valid swipe before commit. pointerup/pointercancel own teardown.

// Touch fallback + non-passive preventDefault for iOS/Android WebViews that still
// scroll during pointermove, and for environments without Pointer Events.
els.discoveryCard.addEventListener("touchstart", (event) => {
  if (event.touches.length !== 1) {
    resetCardDrag();
    return;
  }
  if (supportsPointer) {
    // Pointer path owns state; remember touch id only for preventDefault pairing.
    cardTouchFallbackId = event.touches[0].identifier;
    return;
  }
  const touch = event.touches[0];
  cardTouchFallbackId = touch.identifier;
  beginCardSwipe(event, {
    clientX: touch.clientX,
    clientY: touch.clientY,
    pointerId: touch.identifier,
    pointerType: "touch",
  });
}, { passive: true });
els.discoveryCard.addEventListener("touchmove", (event) => {
  const touch = [...event.changedTouches].find((item) => item.identifier === cardTouchFallbackId)
    || (event.touches.length === 1 ? event.touches[0] : null);
  if (!touch) return;
  if (supportsPointer) {
    // Still prevent scroll after horizontal lock when pointer events are active.
    if (cardPointerStart?.horizontal && event.cancelable) event.preventDefault();
    return;
  }
  moveCardSwipe(touch.clientX, touch.clientY, touch.identifier, event);
}, { passive: false });
els.discoveryCard.addEventListener("touchend", (event) => {
  const touch = [...event.changedTouches].find((item) => item.identifier === cardTouchFallbackId);
  if (!touch) return;
  if (supportsPointer) {
    cardTouchFallbackId = null;
    return;
  }
  endCardSwipe(touch.clientX, touch.clientY, touch.identifier);
}, { passive: true });
els.discoveryCard.addEventListener("touchcancel", () => {
  if (supportsPointer) {
    cardTouchFallbackId = null;
    return;
  }
  resetCardDrag({ keepSuppress: cardSuppressClick });
}, { passive: true });

els.discoveryCard.addEventListener("click", (event) => {
  if (!cardSuppressClick) return;
  event.preventDefault();
  event.stopPropagation();
  cardSuppressClick = false;
}, true);
els.discoveryCard.addEventListener("dragstart", (event) => event.preventDefault());
els.undoDiscovery.addEventListener("click", undoDiscovery);
els.restartPassed.addEventListener("click", () => {
  if (!discovery.passed.length) return;
  discovery.queue = discovery.passed.filter((code) => !favoriteCodes.has(String(code)));
  discovery.passed = [];
  discovery.seen = [];
  discovery.index = 0;
  discovery.history = [];
  persistDiscovery();
  renderDiscoveryCard();
});
els.closeArtistSongs?.addEventListener("click", closeArtistSongsDialog);
els.artistSongsDialog?.addEventListener("click", (event) => {
  if (event.target === els.artistSongsDialog) closeArtistSongsDialog();
});
document.querySelectorAll('.mobile-tabbar a[data-mobile-tab][href^="#"]').forEach((link) => {
  link.addEventListener("click", () => {
    if (favoritesOnly) {
      favoritesOnly = false;
      refreshFilteredSearch();
    }
    // Defer so location.hash is updated before we paint the active tab.
    queueMicrotask(updateMobileTabs);
  });
});
window.addEventListener("hashchange", () => {
  if (redirectLegacyFavoritesHash()) return;
  updateMobileTabs();
});
updateMobileTabs();
els.spotifyButton.addEventListener("click", async () => {
  try {
    els.spotifyStatus.textContent = "Redirecionando para o Spotify…";
    await connectSpotify();
  } catch (error) {
    els.spotifyStatus.textContent = error.message;
  }
});
els.loadMore.addEventListener("click", () => {
  visibleCount += PAGE_SIZE;
  renderResults();
});
els.viewList?.addEventListener("click", () => setResultsView("list"));
els.viewGrid?.addEventListener("click", () => setResultsView("grid"));
els.dialog.addEventListener("click", (event) => {
  if (event.target === els.dialog) els.dialog.close();
});

async function init() {
  applyResultsView();
  els.resultsCount.textContent = "Carregando catálogo…";
  try {
    const res = await fetch(`${BASE}data/songs.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    songs = await res.json();
    songByCode = new Map(songs.map((song) => [String(song.code), song]));
    favoritesState = sanitizeFavoritesState(favoritesState, { extraDraftCodes: discovery.list, allowed: new Set(songByCode.keys()) });
    persistFavorites();
  } catch (err) {
    els.resultsCount.textContent = "Não foi possível carregar o catálogo.";
    console.error(err);
    await loadSiteFeatures();
    return;
  }
  await loadSiteFeatures();
  applyCatalogFeatures();

  // Covers sidecar: start immediately; the row loader awaits it before painting / Deezer.
  void ensureSongCovers();

  buildCategories();
  allCatalogArtists = catalogArtists(songs);
  discovery = sanitizeDiscoveryState(discovery, songs.map((song) => String(song.code)));
  if (discovery.list.length) {
    discovery.list = [];
    persistDiscovery();
  }
  applyArtistView();
  updateFavoriteControls();
  els.resultsCount.textContent = `${songs.length.toLocaleString("pt-BR")} músicas no catálogo`;
  void applyAccountFavorites();

  try {
  const topTracks = spotifyConfigured() ? await completeSpotifyConnection() : null;
    if (topTracks) {
      const matches = matchSpotifyTracks(songs, topTracks);
      spotifySuggestions = matches;
      els.spotifyStatus.textContent = `${matches.length} de ${topTracks.length} músicas mais ouvidas estão disponíveis para suas sugestões. Escolha “Quero cantar” para salvar nas favoritas.`;
      if (discovery.queue.length && discovery.index < discovery.queue.length) {
        const additions = matches.map((song) => String(song.code)).filter((code) => !discovery.queue.includes(code) && !discovery.seen.includes(code));
        discovery.queue.splice(discovery.index + 1, 0, ...additions);
        persistDiscovery();
        openDiscover();
      } else if (discovery.genres.length) {
        openDiscover();
        await startDiscovery();
      } else openDiscover();
    }
  } catch (error) {
    els.spotifyStatus.textContent = error.message;
  }

  // Deep-link: #buscar?q=…
  const hash = location.hash;
  if (hash.startsWith("#buscar")) {
    const params = new URLSearchParams(hash.split("?")[1] || "");
    const q = params.get("q");
    if (q) {
      els.searchInput.value = q;
      onSearchInput();
    }
    // The browser jumps before the catalog and notice render (and never for #buscar?q=), so land again once they have.
    requestAnimationFrame(() => els.searchSection?.scrollIntoView({ block: "start" }));
  }
}

/** Show the static hero logo immediately; idle-swap to the animated SVG. */
function enhanceHeroLogo() {
  const img = document.querySelector(".hero-artwork img[data-animated-src]");
  if (!img) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const animatedSrc = String(img.dataset.animatedSrc || "").trim();
  if (!animatedSrc || img.getAttribute("src") === animatedSrc) return;

  const swapWhenIdle = () => {
    const preload = new Image();
    preload.decoding = "async";
    preload.onload = () => {
      if (img.isConnected) img.src = animatedSrc;
    };
    preload.src = animatedSrc;
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(swapWhenIdle, { timeout: 2500 });
  } else {
    window.setTimeout(swapWhenIdle, 1);
  }
}

async function boot() {
  const ready = loadSiteFeatures();
  hideExpiredEventNav();
  setFooterYear();
  enhanceHeroLogo();
  const catalog = init();
  await ready;
  applyFeatureChrome();
  applyCatalogFeatures();
  initAnalytics();
  initSongRequests();
  initializeIsland();
  initializeTheme();
  void initializeAccountMenu();
  void watchAccountFavorites();
  await catalog;
}

void boot();
