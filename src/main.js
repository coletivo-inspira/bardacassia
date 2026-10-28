import { displayTitle, filterCatalog, filtersForArtistSelection, countActiveFilterChips, filtersToggleLabel, searchCatalog, matchSpotifyTracks, curatedArtistSuggestions, normalizeText, cleanArtist } from "./lib/catalog.js";
import { fetchDeezerMeta, fetchRelatedArtists, fetchArtistPicture, cancelPendingDeezerMeta, metaFromCatalog } from "./integrations/deezer.js";
import { spotifyConfigured, connectSpotify, completeSpotifyConnection } from "./integrations/spotify.js";
import { buildDiscoveryQueue, catalogArtists, filterArtists, sanitizeDiscoveryState, emptyDiscoveryState } from "./lib/discovery.js";
import { GENRES, artistsForGenres, genreForSong } from "./lib/genres.js";
import {
  DRAFT_TAB_ID,
  addToTab,
  allCodes,
  clearTab,
  createTab,
  deleteTab,
  emptyFavoritesState,
  moveSong,
  removeSong,
  renameTab,
  sanitizeFavoritesState,
  setActiveTab,
  tabOf,
} from "./lib/favorites.js";
import {
  resolveSwipeAxis,
  shouldCommitSwipe,
  swipeActionFromDx,
  swipeDelta,
  swipeStrength,
  isInteractiveSwipeTarget,
} from "./lib/discovery-swipe.js";
import { fetchPopularSongs, popularityNeedsUpdate, recordSongOpen, setSongFavorite } from "./integrations/popularity.js";
import { hideExpiredEventNav, initializeAccountMenu, initializeTheme } from "./site.js";
import { syncAccountFavorites } from "./integrations/favorites-sync.js";
import { mergeFavoriteCodes } from "./lib/favorites.js";
import { clearSongRequest, initSongRequests, prepareSongRequest } from "./song-requests.js";

const BASE = import.meta.env.BASE_URL || "/";
const PAGE_SIZE = 40;
const DISCOVERY_ENABLED = String(import.meta.env.VITE_ENABLE_DISCOVERY || "true") !== "false";
const POPULARITY_ENABLED = String(import.meta.env.VITE_ENABLE_POPULARITY || "true") !== "false";
const LEGACY_FAVORITES_KEY = "bdc-favorites-v1";
const FAVORITES_KEY = "bdc-favorites-v2";
const DISCOVERY_KEY = "bdc-discovery-v1";
const RESULTS_VIEW_KEY = "bdc-results-view-v1";
const ARTIST_VIEW_KEY = "bdc-artist-view-v1";
const META_ROOT_MARGIN = "200px 0px";

const LANG_LABELS = {
  BRA: "Brasileiras",
  EUA: "Internacionais",
  JAP: "Japonês",
  ITA: "Italiano",
  ESP: "Español",
  FRA: "Francês",
};

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
  resultsView: document.querySelector("#results-view"),
  categoryGrid: document.querySelector("#category-grid"),
  songsList: document.querySelector("#songs-list"),
  emptyState: document.querySelector("#empty-state"),
  loadMore: document.querySelector("#load-more"),
  backToBrowse: document.querySelector("#back-to-browse"),
  activeFilter: document.querySelector("#active-filter"),
  dialog: document.querySelector("#dj-dialog"),
  previewAudio: document.querySelector("#preview-audio"),
  favoritesButton: document.querySelector("#show-favorites"),
  favoritesCount: document.querySelector("#favorites-count"),
  mobileFavoritesButton: document.querySelector("#mobile-favorites"),
  mobileFavoritesCount: document.querySelector("#mobile-favorites-count"),
  spotifyButton: document.querySelector("#spotify-connect"),
  themeToggle: document.querySelector("#theme-toggle"),
  spotifyStatus: document.querySelector("#spotify-status"),
  relatedSection: document.querySelector("#related-artists"),
  relatedTitle: document.querySelector("#related-title"),
  relatedList: document.querySelector("#related-list"),
  discoverFab: document.querySelector("#open-discover"),
  discoverDialog: document.querySelector("#discover-dialog"),
  discoverBack: document.querySelector("#discover-back"),
  closeDiscover: document.querySelector("#close-discover"),
  discoverSteps: document.querySelectorAll(".discover-steps li"),
  discoveryTitle: document.querySelector("#discovery-title"),
  discoveryDescription: document.querySelector("#discovery-description"),
  stepGenres: document.querySelector("#step-genres"),
  genreOptions: document.querySelector("#genre-options"),
  confirmGenres: document.querySelector("#confirm-genres"),
  stepArtists: document.querySelector("#step-artists"),
  artistSearch: document.querySelector("#artist-search"),
  artistOptions: document.querySelector("#artist-options"),
  artistSelectionCount: document.querySelector("#artist-selection-count"),
  artistViewGrid: document.querySelector("#artist-view-grid"),
  artistViewList: document.querySelector("#artist-view-list"),
  startDiscovery: document.querySelector("#start-discovery"),
  skipArtistPicker: document.querySelector("#skip-artist-picker"),
  discoveryCards: document.querySelector("#discovery-cards"),
  discoveryCard: document.querySelector("#discovery-card"),
  cardPosition: document.querySelector("#card-position"),
  undoDiscovery: document.querySelector("#undo-discovery"),
  passSong: document.querySelector("#pass-song"),
  chooseSong: document.querySelector("#choose-song"),
  changeArtists: document.querySelector("#change-artists"),
  restartPassed: document.querySelector("#restart-passed"),
  goToFavorites: document.querySelector("#go-to-favorites"),
  favoriteTabs: document.querySelector("#favorite-tabs"),
  favoriteTabList: document.querySelector("#favorite-tab-list"),
  newFavoriteTab: document.querySelector("#new-favorite-tab"),
  renameFavoriteTab: document.querySelector("#rename-favorite-tab"),
  clearFavoriteTab: document.querySelector("#clear-favorite-tab"),
  deleteFavoriteTab: document.querySelector("#delete-favorite-tab"),
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
};

/** @type {Array<{code:string,artist:string,title:string,lyricStart:string,lang:string}>} */
let songs = [];
let filtered = [];
let visibleCount = PAGE_SIZE;
let activeCategory = null;
let previewCode = null;
let dialogMetaGen = 0;
let favoritesState = loadFavorites();
let favoriteCodes = allCodes(favoritesState);
/** Favorites view shows one tab at a time; the "Somente favoritas" filter spans all tabs. */
let favoritesTabView = false;
let favoritesOnly = false;
let relatedRequest = 0;
let songByCode = new Map();
let observer = null;
let discovery = loadDiscovery();
let allCatalogArtists = [];
let artistOptions = [];
let discoverStep = "genres";
let artistView = loadArtistView();
let popularSongs = [];
let spotifySuggestions = [];
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

function spotifySearchUrl(artist, title) {
  return `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${title}`)}`;
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
    djBtn.className = "action-btn dj-btn";
    djBtn.textContent = "Código";
    djBtn.setAttribute("aria-label", `Código ao DJ: ${song.code}`);
    djBtn.addEventListener("click", () => showSongToDJ(song));
    const favoriteBtn = document.createElement("button");
    favoriteBtn.type = "button";
    favoriteBtn.className = "action-btn favorite-btn";
    favoriteBtn.dataset.code = song.code;
    const isFavorite = favoriteCodes.has(song.code);
    favoriteBtn.textContent = isFavorite ? "Salva" : "Favoritar";
    favoriteBtn.classList.toggle("is-favorite", isFavorite);
    favoriteBtn.setAttribute("aria-pressed", String(isFavorite));
    favoriteBtn.setAttribute("aria-label", `${isFavorite ? "Remover das favoritas" : "Adicionar às favoritas"}: ${displayTitle(song.title)}`);
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
    renderArtistOptions();
  }
  if (step === "cards") renderDiscoveryCard();
  els.discoverDialog.querySelector(".discover-screen-inner")?.scrollTo({ top: 0 });
}

function renderGenreOptions() {
  const selected = new Set(discovery.genres);
  els.genreOptions.replaceChildren(...GENRES.map((genre) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "genre-chip";
    button.style.setProperty("--genre", genre.color);
    const isSelected = selected.has(genre.id);
    button.setAttribute("aria-pressed", String(isSelected));
    const check = document.createElement("span");
    check.className = "genre-chip-check";
    check.setAttribute("aria-hidden", "true");
    check.textContent = isSelected ? "✓" : "+";
    const label = document.createElement("span");
    label.textContent = genre.label;
    button.append(check, label);
    button.addEventListener("click", () => {
      discovery.genres = isSelected ? discovery.genres.filter((id) => id !== genre.id) : [...discovery.genres, genre.id];
      persistDiscovery();
      renderGenreOptions();
    });
    return button;
  }));
  els.confirmGenres.disabled = discovery.genres.length === 0;
  els.confirmGenres.textContent = discovery.genres.length
    ? `Continuar com ${discovery.genres.length} estilo${discovery.genres.length === 1 ? "" : "s"}`
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

function updateArtistSelectionCount() {
  const count = discovery.artists.length;
  els.artistSelectionCount.textContent = count
    ? `${count} artista${count === 1 ? "" : "s"} selecionado${count === 1 ? "" : "s"}`
    : "Nenhum artista selecionado";
  els.startDiscovery.disabled = count === 0;
}

function renderArtistOptions() {
  const selected = new Set(discovery.artists.map(normalize));
  const query = els.artistSearch.value.trim();
  const styleKeys = new Set(artistOptions.map((artist) => artist.key));
  const pool = query ? [...artistOptions, ...allCatalogArtists.filter((artist) => !styleKeys.has(artist.key))] : artistOptions;
  const matches = filterArtists(pool, query).slice(0, 120);
  artistPhotoObserver?.disconnect();
  els.artistOptions.replaceChildren(...matches.map(({ name, key }) => {
    let isSelected = selected.has(key);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "artist-tile";
    button.setAttribute("aria-pressed", String(isSelected));
    button.setAttribute("aria-label", `${isSelected ? "Remover" : "Selecionar"} ${name}`);
    const photo = document.createElement("span");
    photo.className = "artist-photo";
    photo.dataset.artist = name;
    photo.append(createArtistPlaceholder(name));
    const badge = document.createElement("span");
    badge.className = "artist-tile-check";
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = isSelected ? "✓" : "+";
    const label = document.createElement("span");
    label.className = "artist-tile-name";
    label.textContent = name;
    button.append(photo, badge, label);
    button.addEventListener("click", () => {
      discovery.artists = isSelected
        ? discovery.artists.filter((artist) => normalize(artist) !== key)
        : [...discovery.artists, name];
      isSelected = !isSelected;
      persistDiscovery();
      button.setAttribute("aria-pressed", String(isSelected));
      button.setAttribute("aria-label", `${isSelected ? "Remover" : "Selecionar"} ${name}`);
      badge.textContent = isSelected ? "✓" : "+";
      updateArtistSelectionCount();
    });
    if (artistPhotoObserver) artistPhotoObserver.observe(photo);
    else loadArtistPhoto(photo);
    return button;
  }));
  if (!matches.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Nenhum artista encontrado nestes estilos.";
    els.artistOptions.append(empty);
  }
  updateArtistSelectionCount();
}

function hasDiscoverySession() {
  return discovery.genres.length > 0 && discovery.queue.length > 0 && discovery.index < discovery.queue.length;
}

function openDiscover() {
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

async function startDiscovery(passedArtists = discovery.artists) {
  if (!discovery.genres.length) {
    showDiscoverStep("genres");
    return;
  }
  discovery.artists = [...passedArtists];
  if (POPULARITY_ENABLED && !popularSongs.length) popularSongs = (await fetchPopularSongs()).map((entry) => songByCode.get(String(entry.code))).filter(Boolean);
  if (popularityNeedsUpdate()) {
    els.spotifyStatus.hidden = false;
    els.spotifyStatus.textContent = "Ranking exibido com dados salvos; atualização pendente.";
  }
  const genreArtists = artistsForGenres(discovery.genres, allCatalogArtists).map((artist) => artist.name);
  const editorialArtists = CURATED.flatMap((pack) => pack.artists);
  const queue = buildDiscoveryQueue(songs, { artists: discovery.artists, genreArtists }, [...spotifySuggestions, ...popularSongs], editorialArtists);
  const fallback = [...new Set(editorialArtists.map(normalize))];
  const fallbackSongs = queue.length ? queue : songs.filter((song) => fallback.includes(normalize(cleanArtist(song.artist))))
    .map((song) => ({ ...song, source: "Sugestão da casa" }));
  discovery.queue = fallbackSongs.map((song) => String(song.code));
  discovery.index = 0;
  discovery.seen = [];
  discovery.passed = [];
  discovery.history = [];
  persistDiscovery();
  showDiscoverStep("cards");
}

function currentDiscoverySong() {
  const code = discovery.queue[discovery.index];
  return code ? songByCode.get(code) : null;
}

function renderDiscoveryCard() {
  stopPreview();
  const song = currentDiscoverySong();
  els.passSong.disabled = !song;
  els.chooseSong.disabled = !song;
  els.undoDiscovery.disabled = discovery.history.length === 0;
  if (!song) {
    els.discoveryCard.replaceChildren();
    els.cardPosition.textContent = "Sugestões concluídas";
    const saved = draftTab().codes.length;
    els.discoveryDescription.textContent = saved
      ? `Você tem ${saved} música${saved === 1 ? "" : "s"} na aba Rascunho das Favoritas.`
      : "Não encontramos mais músicas para estes estilos e artistas no catálogo.";
    els.changeArtists.hidden = false;
    els.restartPassed.hidden = discovery.seen.length === 0;
    return;
  }
  els.discoveryDescription.textContent = "Deslize ou use os botões: escolha músicas para cantar ou passe para a próxima.";
  els.cardPosition.textContent = `Sugestão ${discovery.index + 1} de ${discovery.queue.length}`;
  els.restartPassed.hidden = false;
  const card = document.createElement("div");
  card.className = "discovery-card-content";
  let cover = createCoverFallback(song);
  cover.className = "cover-fallback discovery-cover";
  const catalogMeta = metaFromCatalog(song);
  if (catalogMeta.cover) {
    const img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.className = "discovery-cover";
    img.src = catalogMeta.cover;
    img.addEventListener("error", () => {
      if (img.isConnected) img.replaceWith(createCoverFallback(song));
    }, { once: true });
    cover = img;
  }
  const title = document.createElement("h4");
  title.textContent = displayTitle(song.title);
  const artist = document.createElement("p");
  artist.textContent = cleanArtist(song.artist);
  const record = document.createElement("span");
  record.className = "discovery-source";
  const isSpotify = spotifySuggestions.some((item) => item.code === song.code);
  const isChosenArtist = discovery.artists.some((name) => normalize(name) === normalize(cleanArtist(song.artist)));
  const genre = isChosenArtist ? null : genreForSong(song, discovery.genres);
  record.textContent = isSpotify ? "Do seu Spotify"
    : isChosenArtist ? "Artista escolhido"
    : genre ? `Do estilo ${genre.label}`
    : popularSongs.some((item) => item.code === song.code) ? "Mais popular"
    : "Sugestão da casa";
  const actions = document.createElement("div");
  actions.className = "discovery-card-links";
  const details = document.createElement("button");
  details.type = "button";
  details.className = "action-btn dj-btn";
  details.textContent = "Código";
  details.setAttribute("aria-label", `Código ao DJ: ${song.code}`);
  details.addEventListener("click", () => showSongToDJ(song));
  const spotify = document.createElement("a");
  spotify.href = spotifySearchUrl(cleanArtist(song.artist), displayTitle(song.title));
  spotify.target = "_blank";
  spotify.rel = "noopener noreferrer";
  spotify.className = "action-link";
  spotify.textContent = "Relembrar esta música";
  actions.append(details, spotify);
  if (catalogMeta.previewUrl) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "action-btn preview-btn";
    button.dataset.idleLabel = "Ouvir trecho";
    button.textContent = "Ouvir trecho";
    button.dataset.preview = catalogMeta.previewUrl;
    button.addEventListener("click", () => togglePreview(song, button));
    actions.append(button);
  }
  card.append(cover, title, artist, record, actions);
  els.discoveryCard.replaceChildren(card);
  if (!catalogMeta.cover) enrichDiscoveryCover(cover, song);
}

async function enrichDiscoveryCover(cover, song) {
  try {
    const meta = await fetchDeezerMeta(song);
    if (!meta || !cover.isConnected || currentDiscoverySong()?.code !== song.code) return;
    if (meta.cover && cover.isConnected) {
      const img = document.createElement("img");
      img.alt = "";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.src = meta.cover;
      img.addEventListener("error", () => {
        if (cover.isConnected && currentDiscoverySong()?.code === song.code) {
          cover.replaceWith(createCoverFallback(song));
        }
      }, { once: true });
      cover.replaceWith(img);
    }
    if (meta.previewUrl) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "action-btn preview-btn";
      button.dataset.idleLabel = "Ouvir trecho";
      button.textContent = "Ouvir trecho";
      button.dataset.preview = meta.previewUrl;
      button.addEventListener("click", () => togglePreview(song, button));
      els.discoveryCard.querySelector(".discovery-card-links")?.append(button);
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
  const entries = popularSongs.slice(0, 40);
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
  if (POPULARITY_ENABLED) fetchPopularSongs().then((entries) => {
    popularSongs = entries.map((entry) => songByCode.get(String(entry.code))).filter(Boolean);
    renderPopularSongs();
    if (popularityNeedsUpdate()) {
      els.spotifyStatus.hidden = false;
      els.spotifyStatus.textContent = "Ranking exibido com dados salvos; atualização pendente.";
    }
  });
}

function loadFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "null");
    if (saved) return sanitizeFavoritesState(saved);
    const legacy = JSON.parse(localStorage.getItem(LEGACY_FAVORITES_KEY) || "[]");
    return sanitizeFavoritesState(Array.isArray(legacy) ? legacy : []);
  } catch {
    return emptyFavoritesState();
  }
}

function persistFavorites() {
  favoriteCodes = allCodes(favoritesState);
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoritesState));
  } catch {
    els.spotifyStatus.hidden = false;
    els.spotifyStatus.textContent = "Não foi possível salvar suas favoritas neste navegador.";
  }
}

function draftTab() {
  return favoritesState.tabs.find((tab) => tab.id === DRAFT_TAB_ID);
}

function activeTab() {
  return favoritesState.tabs.find((tab) => tab.id === favoritesState.active) || draftTab();
}

function updateFavoriteControls() {
  const count = favoriteCodes.size.toLocaleString("pt-BR");
  els.favoritesCount.textContent = count;
  els.favoritesButton.setAttribute("aria-pressed", String(favoritesOnly));
  els.favoritesButton.classList.toggle("is-active", favoritesOnly);

  if (els.mobileFavoritesButton) {
    els.mobileFavoritesButton.setAttribute("aria-pressed", String(favoritesOnly));
    els.mobileFavoritesButton.classList.toggle("is-active", favoritesOnly);
  }
  if (els.mobileFavoritesCount) {
    els.mobileFavoritesCount.textContent = count;
    els.mobileFavoritesCount.hidden = favoriteCodes.size === 0;
  }
}

async function applyAccountFavorites() {
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

function refreshFavoriteButtons(onlyCode = null) {
  document.querySelectorAll(".favorite-btn").forEach((button) => {
    if (onlyCode && button.dataset.code !== onlyCode) return;
    const song = songByCode.get(button.dataset.code);
    if (!song) return;
    const saved = favoriteCodes.has(song.code);
    button.textContent = saved ? "Salva" : "Favoritar";
    button.setAttribute("aria-pressed", String(saved));
    button.setAttribute("aria-label", `${saved ? "Remover das favoritas" : "Adicionar às favoritas"}: ${displayTitle(song.title)}`);
    button.classList.toggle("is-favorite", saved);
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
  favoritesState = addToTab(favoritesState, code, DRAFT_TAB_ID);
  setSongFavorite(code, true);
  persistFavorites();
  onFavoritesChanged(code);
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

function moveFavorite(code, tabId) {
  favoritesState = moveSong(favoritesState, code, tabId);
  persistFavorites();
  onFavoritesChanged(code);
}

function renderFavoriteTabs() {
  els.favoriteTabs.hidden = !favoritesTabView;
  if (!favoritesTabView) return;
  const current = activeTab();
  els.favoriteTabList.replaceChildren(...favoritesState.tabs.map((tab) => {
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
    button.addEventListener("click", () => {
      favoritesState = setActiveTab(favoritesState, tab.id);
      persistFavorites();
      showFavoritesTab();
    });
    return button;
  }));
  const isDraft = current.id === DRAFT_TAB_ID;
  els.renameFavoriteTab.hidden = isDraft;
  els.deleteFavoriteTab.hidden = isDraft;
  els.clearFavoriteTab.disabled = current.codes.length === 0;
}

function showFavoritesTab() {
  els.activeFilter.textContent = `Suas favoritas · ${activeTab().name}`;
  applyFilters();
}

function promptNewFavoriteTab() {
  const name = window.prompt("Nome da nova aba (ex.: Noite de sexta):");
  if (!name?.trim()) return;
  favoritesState = createTab(favoritesState, name);
  persistFavorites();
  showFavoritesTab();
}

function promptRenameFavoriteTab() {
  const tab = activeTab();
  const name = window.prompt("Novo nome da aba:", tab.name);
  if (!name?.trim()) return;
  favoritesState = renameTab(favoritesState, tab.id, name);
  persistFavorites();
  showFavoritesTab();
}

function confirmDeleteFavoriteTab() {
  const tab = activeTab();
  if (!window.confirm(`Apagar a aba “${tab.name}”? As músicas dela voltam para o Rascunho.`)) return;
  favoritesState = deleteTab(favoritesState, tab.id);
  persistFavorites();
  showFavoritesTab();
}

function confirmClearFavoriteTab() {
  const tab = activeTab();
  if (!tab.codes.length || !window.confirm(`Tirar todas as músicas da aba “${tab.name}”?`)) return;
  for (const code of tab.codes) setSongFavorite(code, false);
  favoritesState = clearTab(favoritesState, tab.id);
  persistFavorites();
  showFavoritesTab();
}

function createMoveSelect(song) {
  const label = document.createElement("label");
  label.className = "move-favorite";
  const text = document.createElement("span");
  text.className = "visually-hidden";
  text.textContent = `Mover ${displayTitle(song.title)} para outra aba`;
  const select = document.createElement("select");
  const current = tabOf(favoritesState, song.code);
  select.append(new Option("Mover para…", ""));
  for (const tab of favoritesState.tabs) {
    if (tab.id === current?.id) continue;
    select.append(new Option(tab.name, tab.id));
  }
  select.append(new Option("+ Nova aba…", "__new__"));
  select.addEventListener("change", () => {
    const value = select.value;
    if (value === "__new__") {
      const name = window.prompt("Nome da nova aba:");
      if (!name?.trim()) { select.value = ""; return; }
      const previous = favoritesState.active;
      favoritesState = createTab(favoritesState, name);
      const created = favoritesState.active;
      favoritesState = setActiveTab(favoritesState, previous);
      moveFavorite(song.code, created);
    } else if (value) {
      moveFavorite(song.code, value);
    }
  });
  label.append(text, select);
  return label;
}

function hideRelatedArtists() {
  relatedRequest++;
  els.relatedSection.hidden = true;
  els.relatedList.replaceChildren();
}

async function renderRelatedArtists(artist) {
  const request = ++relatedRequest;
  els.relatedSection.hidden = false;
  els.relatedTitle.textContent = "Buscando artistas relacionados…";
  els.relatedList.replaceChildren();
  const names = await fetchRelatedArtists(artist);
  if (request !== relatedRequest) return;

  const byName = new Map(songs.map((song) => [normalize(cleanArtist(song.artist)), cleanArtist(song.artist)]));
  let suggestions = names
    .map((name) => byName.get(normalize(name)))
    .filter((name) => name && normalize(name) !== normalize(artist));
  suggestions = [...new Set(suggestions)].slice(0, 8);
  const fromDeezer = suggestions.length > 0;
  if (!suggestions.length) suggestions = curatedArtistSuggestions(songs, artist, CURATED);
  if (!suggestions.length) {
    els.relatedSection.hidden = true;
    return;
  }
  els.relatedTitle.textContent = fromDeezer ? "Artistas relacionados no catálogo" : "Explore também";
  for (const name of suggestions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "artist-chip";
    button.textContent = name;
    button.addEventListener("click", () => showArtistSongs(name));
    els.relatedList.append(button);
  }
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

function showFavorites() {
  if (favoritesOnly) {
    favoritesOnly = false;
    refreshFilteredSearch();
    return;
  }
  favoritesOnly = true;
  favoritesTabView = true;
  els.popularView.hidden = true;
  els.songsList.hidden = false;
  activeCategory = null;
  els.searchInput.value = "";
  els.clearButton.hidden = true;
  hideRelatedArtists();
  setBrowseMode(false);
  showFavoritesTab();
  els.resultsView.scrollIntoView({ behavior: "smooth", block: "start" });
}

function initials(artist, title) {
  const a = (artist || "?").trim().charAt(0);
  const t = (title || "?").trim().charAt(0);
  return (a + t).toUpperCase();
}

function colorFromCode(code) {
  const colors = ["#e91429", "#148a08", "#509bf5", "#ba5d07", "#8d67ab", "#e1118c", "#477d95", "#b49bc8"];
  let n = 0;
  for (const ch of String(code)) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return colors[n % colors.length];
}

let selectedLanguage = "";
let selectedArtist = "";
function filteredCatalog(query = "") {
  const codes = favoritesOnly && favoritesTabView ? new Set(activeTab().codes) : favoriteCodes;
  return filterCatalog(songs, { query, language: selectedLanguage, artist: selectedArtist, favoritesOnly, favoriteCodes: codes, category: activeCategory });
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
function refreshFilteredSearch() {
  if (activeCategory?.type === "popular") activeCategory = null;
  els.popularView.hidden = true;
  els.songsList.hidden = false;
  setBrowseMode(false);
  els.activeFilter.textContent = "Resultados da busca";
  applyFilters();
}
function applyFilters() {
  if (!favoritesOnly) favoritesTabView = false;
  renderFavoriteTabs();
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
  favoritesTabView = false;
  refreshFilteredSearch();
  collapseFiltersPanel();
});
document.querySelector("#clear-filters").addEventListener("click", () => {
  selectedLanguage = ""; selectedArtist = ""; favoritesOnly = false; activeCategory = null;
  document.querySelector("#filter-artist-search").value = "";
  populateArtistFilter();
  refreshFilteredSearch();
  collapseFiltersPanel();
});

function setBrowseMode(browse) {
  els.browseView.hidden = !browse;
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

function createCoverFallback(song) {
  const el = document.createElement("div");
  el.className = "cover-fallback";
  el.style.background = colorFromCode(song.code);
  el.textContent = initials(song.artist, song.title);
  return el;
}

function createSongRow(song) {
  const row = document.createElement("article");
  row.className = "song-row";
  row.dataset.code = song.code;
  row.dataset.metaState = "idle";
  row.setAttribute("role", "listitem");

  const coverWrap = document.createElement("button");
  coverWrap.type = "button";
  coverWrap.className = "song-cover";
  coverWrap.setAttribute("aria-label", `Ver código: ${displayTitle(song.title)}`);
  coverWrap.addEventListener("click", () => showSongToDJ(song));
  const catalogMeta = metaFromCatalog(song);
  if (catalogMeta.cover) {
    coverWrap.append(createCoverFallback(song));
    setCoverImage(coverWrap, song, catalogMeta.cover);
    row.dataset.metaState = "done";
  } else {
    coverWrap.append(createCoverFallback(song));
  }

  const info = document.createElement("div");
  info.className = "song-info";
  const title = document.createElement("h3");
  title.textContent = displayTitle(song.title);
  const artist = document.createElement("button");
  artist.type = "button";
  artist.className = "artist-link";
  artist.textContent = cleanArtist(song.artist);
  artist.title = `Ver músicas de ${cleanArtist(song.artist)} e artistas relacionados`;
  artist.addEventListener("click", () => showArtistSongs(cleanArtist(song.artist)));
  const meta = document.createElement("p");
  meta.className = "song-meta";
  meta.textContent = `Código ${song.code} · ${LANG_LABELS[song.lang] || song.lang}`;
  info.append(title, artist, meta);

  const actions = document.createElement("div");
  actions.className = "song-actions";

  const spotify = document.createElement("a");
  spotify.className = "action-link action-secondary";
  spotify.href = spotifySearchUrl(song.artist.replace(/\.\.\.$/, ""), displayTitle(song.title));
  spotify.target = "_blank";
  spotify.rel = "noopener noreferrer";
  spotify.textContent = "Spotify";
  spotify.setAttribute("aria-label", `Ouvir no Spotify: ${displayTitle(song.title)}`);

  const previewBtn = document.createElement("button");
  previewBtn.type = "button";
  previewBtn.className = "action-btn preview-btn action-secondary";
  previewBtn.textContent = "Preview";
  previewBtn.hidden = true;
  if (catalogMeta.previewUrl) {
    previewBtn.hidden = false;
    previewBtn.dataset.preview = catalogMeta.previewUrl;
  }
  previewBtn.addEventListener("click", () => togglePreview(song, previewBtn));

  const djBtn = document.createElement("button");
  djBtn.type = "button";
  djBtn.className = "action-btn dj-btn";
  djBtn.textContent = "Código";
  djBtn.setAttribute("aria-label", `Código ao DJ: ${song.code}`);
  djBtn.addEventListener("click", () => showSongToDJ(song));

  const favoriteBtn = document.createElement("button");
  favoriteBtn.type = "button";
  favoriteBtn.className = "action-btn favorite-btn";
  favoriteBtn.dataset.code = song.code;
  const isFavorite = favoriteCodes.has(song.code);
  favoriteBtn.textContent = isFavorite ? "Salva" : "Favoritar";
  favoriteBtn.classList.toggle("is-favorite", isFavorite);
  favoriteBtn.setAttribute("aria-pressed", String(isFavorite));
  favoriteBtn.setAttribute("aria-label", `${isFavorite ? "Remover das favoritas" : "Adicionar às favoritas"}: ${displayTitle(song.title)}`);
  favoriteBtn.addEventListener("click", () => toggleFavorite(song));

  // Código + Favoritar lead; Spotify/Preview are secondary (dialog also has listen actions).
  actions.append(djBtn, favoriteBtn, previewBtn, spotify);
  if (favoritesOnly && favoritesTabView && favoriteCodes.has(song.code)) actions.append(createMoveSelect(song));
  row.append(coverWrap, info, actions);
  return row;
}

function setCoverImage(coverWrap, song, coverUrl) {
  if (!coverWrap || !coverUrl) return;
  const existing = coverWrap.querySelector("img");
  if (existing?.dataset?.coverUrl === coverUrl) return;
  const img = document.createElement("img");
  img.alt = "";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  img.dataset.coverUrl = coverUrl;
  img.src = coverUrl;
  img.addEventListener("error", () => {
    if (coverWrap.isConnected && song) coverWrap.replaceChildren(createCoverFallback(song));
  }, { once: true });
  coverWrap.replaceChildren(img);
}

function applySongMeta(row, meta) {
  if (!meta || !row.isConnected) return;
  const coverWrap = row.querySelector(".song-cover");
  // Mirror the dialog: put the <img> in the DOM immediately. Waiting for load on an
  // off-DOM (or lazy) image left the search list stuck on initials while the modal worked.
  // Replace whenever the URL changes so dialog sync can repair a missing/failed cover.
  if (meta.cover && coverWrap) {
    setCoverImage(coverWrap, songByCode.get(row.dataset.code), meta.cover);
  }
  const previewBtn = row.querySelector(".preview-btn");
  if (meta.previewUrl && previewBtn) {
    previewBtn.hidden = false;
    previewBtn.dataset.preview = meta.previewUrl;
  }
}

/** Applies cached/fetched Deezer meta to every visible search row for this code. */
function syncSongMetaToList(song, meta) {
  if (!song?.code || !meta) return;
  document.querySelectorAll(`.song-row[data-code="${CSS.escape(String(song.code))}"]`).forEach((row) => {
    if (!row.isConnected) return;
    if (meta.cover || meta.previewUrl) row.dataset.metaState = "done";
    applySongMeta(row, meta);
    if (meta.cover) observer?.unobserve(row);
  });
}

function finishRowMeta(row, meta) {
  if (!row?.isConnected || !meta) return;
  applySongMeta(row, meta);
  if (meta.cover || meta.previewUrl) {
    row.dataset.metaState = "done";
    if (meta.cover) observer?.unobserve(row);
  } else {
    row.dataset.metaState = "idle";
  }
}

async function enrichRow(row) {
  if (!row?.isConnected) return;
  if (row.dataset.metaState === "done" || row.dataset.metaState === "loading") return;
  const code = row.dataset.code;
  const song = songByCode.get(code);
  if (!song) return;

  // Catalog already has cover linked to this karaoke code — skip Deezer.
  const catalogMeta = metaFromCatalog(song);
  if (catalogMeta.cover) {
    finishRowMeta(row, catalogMeta);
    return;
  }

  const generation = String(Number(row.dataset.metaGen || "0") + 1);
  row.dataset.metaGen = generation;
  row.dataset.metaState = "loading";

  try {
    const meta = await fetchDeezerMeta(song);
    if (!row.isConnected) return;
    // After scroll-away cancel, still paint useful meta onto the mounted row.
    if (row.dataset.metaGen !== generation) {
      if (meta && (meta.cover || meta.previewUrl)) finishRowMeta(row, meta);
      else if (row.dataset.metaState === "cancelled") row.dataset.metaState = "idle";
      return;
    }
    if (row.dataset.metaState === "cancelled") {
      if (meta && (meta.cover || meta.previewUrl)) finishRowMeta(row, meta);
      else row.dataset.metaState = "idle";
      return;
    }
    if (!meta) {
      row.dataset.metaState = "idle";
      return;
    }
    finishRowMeta(row, meta);
  } catch {
    if (row.isConnected && row.dataset.metaGen === generation) {
      row.dataset.metaState = "idle";
    }
  }
}

function abandonRowMeta(row) {
  if (!row || row.dataset.metaState !== "loading") return;
  row.dataset.metaState = "cancelled";
  row.dataset.metaGen = String(Number(row.dataset.metaGen || "0") + 1);
  cancelPendingDeezerMeta(row.dataset.code);
}

function setupObserver() {
  if (observer) observer.disconnect();
  if (typeof IntersectionObserver !== "function") {
    observer = null;
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const row = entry.target;
        if (entry.isIntersecting) {
          enrichRow(row);
        } else {
          abandonRowMeta(row);
        }
      }
    },
    { rootMargin: META_ROOT_MARGIN, threshold: 0 }
  );
}

function renderResults() {
  const slice = filtered.slice(0, visibleCount);
  const rows = slice.map(createSongRow);
  els.songsList.replaceChildren(...rows);
  applyResultsView();
  setupObserver();
  if (observer) rows.forEach((row) => observer.observe(row));
  else rows.forEach((row) => enrichRow(row));

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
    ? (favoritesTabView && activeTab().id !== DRAFT_TAB_ID
      ? "Esta aba ainda está vazia. Use “Mover para…” nas músicas do Rascunho."
      : "Você ainda não salvou músicas. Use “Descobrir minha música” ou Favoritar nas que quiser cantar.")
    : "Nenhuma música encontrada com esta busca e os filtros ativos. Tente menos palavras ou use Limpar filtros.";
  els.loadMore.hidden = visibleCount >= total;
  els.clearButton.hidden = q.length === 0;
  updateFavoriteControls();
}

function stopPreview() {
  els.previewAudio.pause();
  els.previewAudio.removeAttribute("src");
  previewCode = null;
  document.querySelectorAll(".preview-btn.is-playing").forEach((btn) => {
    btn.classList.remove("is-playing");
    btn.textContent = btn.dataset.idleLabel || "Preview";
  });
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
  if (meta.previewUrl && els.dialogPreview) {
    els.dialogPreview.hidden = false;
    els.dialogPreview.dataset.preview = meta.previewUrl;
    if (previewCode === song.code && !els.previewAudio.paused) {
      els.dialogPreview.classList.add("is-playing");
      els.dialogPreview.textContent = "Pausar";
    }
  }
  // Keep search results in sync when the dialog is the first place the cover arrives.
  syncSongMetaToList(song, meta);
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

function togglePreview(song, button) {
  const url = button.dataset.preview;
  if (!url) return;
  if (previewCode === song.code && !els.previewAudio.paused) {
    stopPreview();
    return;
  }
  stopPreview();
  previewCode = song.code;
  els.previewAudio.src = url;
  els.previewAudio.play().catch(() => stopPreview());
  button.classList.add("is-playing");
  button.textContent = "Pausar";
}

els.previewAudio.addEventListener("ended", stopPreview);

function showSongToDJ(song) {
  activeSong = song;
  recordSongOpen(song.code);
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
  if (livePreview && els.dialogPreview) {
    els.dialogPreview.hidden = false;
    els.dialogPreview.dataset.preview = livePreview;
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

  if (typeof IntersectionObserver === "function") {
    const observer = new IntersectionObserver(([entry]) => {
      els.dialog.classList.toggle("copy-sticky-visible", !entry.isIntersecting);
    }, { root: els.dialog });
    observer.observe(els.copyCode);
    els.dialog.addEventListener("close", () => observer.disconnect(), { once: true });
  }
  if (typeof els.dialog.showModal === "function") els.dialog.showModal();
}

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
  if (!songs.length) return;
  const matches = filteredCatalog(q);
  const options = [];
  if (q) {
    for (const song of matches) {
      const artist = cleanArtist(song.artist);
      if (normalize(artist).includes(normalize(q)) && !options.some((item) => item.artist === artist)) options.push({ artist });
      if (options.length === 2) break;
    }
  }
  for (const song of matches.slice(0, q ? 3 : 4)) options.push({ song });
  const label = document.createElement("p");
  label.textContent = q ? (matches.length ? "Você está procurando…" : "Tente menos palavras, confira o nome ou remova um filtro.") : "Experimente buscar:";
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

  if (POPULARITY_ENABLED) tiles.push(createCategoryTile({ id: "popular", title: "Mais populares", color: "#1e3264", artLabel: "★", onClick: showPopular }));

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
els.startDiscovery.addEventListener("click", () => startDiscovery());
els.skipArtistPicker.addEventListener("click", () => startDiscovery([]));
els.changeArtists.addEventListener("click", () => showDiscoverStep("genres"));
els.discoverFab.hidden = !DISCOVERY_ENABLED;
els.discoverFab.addEventListener("click", openDiscover);
els.closeDiscover.addEventListener("click", closeDiscover);
els.discoverBack.addEventListener("click", discoverBack);
els.discoverDialog.addEventListener("close", () => {
  stopPreview();
  document.documentElement.classList.remove("discover-open");
});
els.goToFavorites.addEventListener("click", () => {
  closeDiscover();
  favoritesOnly = false;
  favoritesState = setActiveTab(favoritesState, DRAFT_TAB_ID);
  persistFavorites();
  showFavorites();
});
els.newFavoriteTab.addEventListener("click", promptNewFavoriteTab);
els.renameFavoriteTab.addEventListener("click", promptRenameFavoriteTab);
els.deleteFavoriteTab.addEventListener("click", confirmDeleteFavoriteTab);
els.clearFavoriteTab.addEventListener("click", confirmClearFavoriteTab);
els.passSong.addEventListener("click", () => animateDiscovery("pass"));
els.chooseSong.addEventListener("click", () => animateDiscovery("choose"));
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
  els.discoveryCard.style.removeProperty("--swipe-strength");
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
  els.discoveryCard.style.setProperty("--swipe-strength", "1");
  els.discoveryCard.style.transform = `translateX(${direction * (els.discoveryCard.offsetWidth + 80)}px) rotate(${direction * 18}deg)`;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.setTimeout(() => {
    resetCardDrag();
    if (currentDiscoverySong()?.code === committedCode) moveDiscovery(action);
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
  els.discoveryCard.style.setProperty("--swipe-strength", String(swipeStrength(dx)));
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
  els.discoveryCard.style.removeProperty("--swipe-strength");
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
  discovery.queue = [...discovery.passed];
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
els.favoritesButton.addEventListener("click", showFavorites);
els.mobileFavoritesButton?.addEventListener("click", showFavorites);
initializeTheme();
initSongRequests();
els.spotifyButton.hidden = !spotifyConfigured;
els.spotifyStatus.hidden = !spotifyConfigured;
if (spotifyConfigured) {
  els.spotifyStatus.textContent = "Com sua autorização, usamos suas músicas mais ouvidas para sugerir opções disponíveis no karaokê.";
}
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
    return;
  }

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
  const topTracks = spotifyConfigured ? await completeSpotifyConnection() : null;
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
  }
}

hideExpiredEventNav();
void initializeAccountMenu();
init();
