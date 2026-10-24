import { filterCatalog, filtersForArtistSelection, countActiveFilterChips, filtersToggleLabel, searchCatalog, matchSpotifyTracks, curatedArtistSuggestions, normalizeText, cleanArtist } from "./lib/catalog.js";
import { fetchDeezerMeta, fetchRelatedArtists, cancelPendingDeezerMeta, metaFromCatalog } from "./integrations/deezer.js";
import { spotifyConfigured, connectSpotify, completeSpotifyConnection } from "./integrations/spotify.js";
import { buildDiscoveryQueue, catalogArtists, filterArtists, sanitizeDiscoveryState, emptyDiscoveryState } from "./lib/discovery.js";
import {
  resolveSwipeAxis,
  shouldCommitSwipe,
  swipeActionFromDx,
  swipeDelta,
  swipeStrength,
  isInteractiveSwipeTarget,
} from "./lib/discovery-swipe.js";
import { fetchPopularSongs, popularityNeedsUpdate, recordSongOpen, setSongFavorite } from "./integrations/popularity.js";
import { hideExpiredEventNav, initializeTheme } from "./site.js";

const BASE = import.meta.env.BASE_URL || "/";
const PAGE_SIZE = 40;
const DISCOVERY_ENABLED = String(import.meta.env.VITE_ENABLE_DISCOVERY || "true") !== "false";
const POPULARITY_ENABLED = String(import.meta.env.VITE_ENABLE_POPULARITY || "true") !== "false";
const FAVORITES_KEY = "bdc-favorites-v1";
const DISCOVERY_KEY = "bdc-discovery-v1";
const RESULTS_VIEW_KEY = "bdc-results-view-v1";
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
  discoveryView: document.querySelector("#discovery-view"),
  discoveryTitle: document.querySelector("#discovery-title"),
  discoveryDescription: document.querySelector("#discovery-description"),
  artistPicker: document.querySelector("#artist-picker"),
  artistSearch: document.querySelector("#artist-search"),
  artistOptions: document.querySelector("#artist-options"),
  artistSelectionCount: document.querySelector("#artist-selection-count"),
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
  popularView: document.querySelector("#popular-view"),
  popularList: document.querySelector("#popular-list"),
  nightListAccess: document.querySelector("#open-night-list"),
  nightListCount: document.querySelector("#night-list-count"),
  nightListDialog: document.querySelector("#night-list-dialog"),
  nightListItems: document.querySelector("#night-list-items"),
  nightListEmpty: document.querySelector("#night-list-empty"),
  closeNightList: document.querySelector("#close-night-list"),
  resetNight: document.querySelector("#reset-night"),
  artistSongsDialog: document.querySelector("#artist-songs-dialog"),
  artistSongsTitle: document.querySelector("#artist-songs-title"),
  artistSongsNote: document.querySelector("#artist-songs-note"),
  artistSongsItems: document.querySelector("#artist-songs-items"),
  artistSongsEmpty: document.querySelector("#artist-songs-empty"),
  closeArtistSongs: document.querySelector("#close-artist-songs"),
  backToNightList: document.querySelector("#back-to-night-list"),
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
let favoriteCodes = loadFavorites();
let favoritesOnly = false;
let relatedRequest = 0;
let songByCode = new Map();
let observer = null;
let discovery = loadDiscovery();
let artistOptions = [];
let popularSongs = [];
let spotifySuggestions = [];
let activeSong = null;
let dialogReturnFocus = null;
let copyTimer = null;
let resultsView = loadResultsView();
/** When artist songs dialog was opened from the night list, closing it returns there. */
let artistDialogFromNightList = false;

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

function displayTitle(title) {
  const t = String(title || "").trim();
  if (!t) return t;
  const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, "");
  const upperRatio = letters ? [...letters].filter((c) => c === c.toUpperCase()).length / letters.length : 0;
  if (upperRatio < 0.7) return t;
  return t
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|[\s\-–—/((])([\p{L}])/gu, (_, sep, ch) => sep + ch.toLocaleUpperCase("pt-BR"));
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
  renderNightList();
}

function renderNightList() {
  if (!els.nightListItems) return;
  const items = discovery.list.map((code) => songByCode.get(code) || { code, title: "Música indisponível no catálogo", artist: "Indisponível" });
  els.nightListCount.textContent = String(items.length);
  els.nightListItems.replaceChildren(...items.map((song) => {
    const row = document.createElement("article");
    row.className = "night-list-item";
    const unavailable = song.title === "Música indisponível no catálogo";
    const artistName = cleanArtist(song.artist);
    const heading = document.createElement("p");
    heading.className = "night-list-heading";
    const title = document.createElement("span");
    title.textContent = displayTitle(song.title);
    heading.append(title, document.createTextNode(" — "));
    const artist = document.createElement("button");
    artist.type = "button";
    artist.className = "artist-link night-list-artist";
    artist.textContent = artistName;
    artist.title = `Ver músicas de ${artistName}`;
    artist.setAttribute("aria-label", `Ver músicas de ${artistName}`);
    artist.disabled = unavailable || !artistName || artistName === "Indisponível";
    if (!artist.disabled) {
      artist.addEventListener("click", () => openArtistSongsDialog(artistName, { fromNightList: true }));
    }
    heading.append(artist);
    const code = document.createElement("span");
    code.className = "night-list-code";
    code.textContent = `Código ${song.code}`;
    const actions = document.createElement("div");
    actions.className = "night-list-item-actions";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "action-btn dj-btn";
    open.textContent = unavailable ? "Indisponível" : "Código";
    open.disabled = unavailable;
    if (!open.disabled) {
      open.setAttribute("aria-label", `Código ao DJ: ${song.code}`);
      open.addEventListener("click", () => showSongToDJ(song));
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "action-btn";
    remove.textContent = "Remover";
    remove.addEventListener("click", () => {
      discovery.list = discovery.list.filter((item) => item !== song.code);
      persistDiscovery();
    });
    actions.append(open, remove);
    row.append(heading, code, actions);
    return row;
  }));
  els.nightListEmpty.hidden = items.length > 0;
  els.resetNight.disabled = items.length === 0;
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
  if (els.backToNightList) els.backToNightList.hidden = !artistDialogFromNightList;
}

function openArtistSongsDialog(artist, { fromNightList = false } = {}) {
  const name = cleanArtist(artist);
  if (!name || !els.artistSongsDialog) return;
  artistDialogFromNightList = fromNightList;
  if (fromNightList && els.nightListDialog?.open) closeNightList();
  renderArtistSongsDialog(name);
  if (typeof els.artistSongsDialog.showModal === "function") els.artistSongsDialog.showModal();
}

function closeArtistSongsDialog() {
  if (els.artistSongsDialog?.open) els.artistSongsDialog.close();
}

function renderArtistOptions() {
  const selected = new Set(discovery.artists.map(normalize));
  const matches = filterArtists(artistOptions, els.artistSearch.value).slice(0, 100);
  els.artistOptions.replaceChildren(...matches.map(({ name, key }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "artist-option";
    button.textContent = `${selected.has(key) ? "✓ " : "+ "}${name}`;
    button.setAttribute("aria-pressed", String(selected.has(key)));
    button.disabled = !selected.has(key) && discovery.artists.length >= 3;
    button.addEventListener("click", () => {
      if (selected.has(key)) discovery.artists = discovery.artists.filter((artist) => normalize(artist) !== key);
      else if (discovery.artists.length < 3) discovery.artists.push(name);
      discovery.artists = [...new Map(discovery.artists.map((artist) => [normalize(artist), artist])).values()];
      persistDiscovery();
      renderArtistOptions();
    });
    return button;
  }));
  els.artistSelectionCount.textContent = `${discovery.artists.length} de 3 selecionados`;
  els.startDiscovery.disabled = discovery.artists.length !== 3;
}

function showDiscoveryPicker() {
  activeCategory = { type: "discovery", label: "Descobrir o que cantar" };
  favoritesOnly = false;
  hideRelatedArtists();
  updateFavoriteControls();
  setBrowseMode(false);
  els.searchInput.value = "";
  els.clearButton.hidden = true;
  els.activeFilter.textContent = activeCategory.label;
  els.discoveryView.hidden = false;
  els.popularView.hidden = true;
  els.songsList.hidden = true;
  els.emptyState.hidden = true;
  els.loadMore.hidden = true;
  const hasSavedSession = discovery.queue.length > 0 && discovery.index < discovery.queue.length;
  els.artistPicker.hidden = hasSavedSession;
  els.discoveryCards.hidden = !hasSavedSession;
  els.discoveryDescription.textContent = hasSavedSession ? "Continue escolhendo músicas para cantar." : "Escolha três artistas para receber sugestões do catálogo.";
  els.discoveryTitle.textContent = "Descobrir o que cantar";
  renderArtistOptions();
  if (hasSavedSession) renderDiscoveryCard();
  els.resultsView.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function startDiscovery(passedArtists = discovery.artists) {
  discovery.artists = passedArtists.slice(0, 3);
  if (POPULARITY_ENABLED && !popularSongs.length) popularSongs = (await fetchPopularSongs()).map((entry) => songByCode.get(String(entry.code))).filter(Boolean);
  if (popularityNeedsUpdate()) {
    els.spotifyStatus.hidden = false;
    els.spotifyStatus.textContent = "Ranking exibido com dados salvos; atualização pendente.";
  }
  const editorialArtists = CURATED.flatMap((pack) => pack.artists);
  const queue = buildDiscoveryQueue(songs, discovery.artists, [...spotifySuggestions, ...popularSongs], editorialArtists);
  const fallback = [...new Set(editorialArtists.map(normalize))];
  const fallbackSongs = queue.length ? queue : songs.filter((song) => fallback.includes(normalize(cleanArtist(song.artist))))
    .map((song) => ({ ...song, source: "Sugestão da casa" }));
  discovery.queue = fallbackSongs.map((song) => String(song.code));
  discovery.index = 0;
  discovery.seen = [];
  discovery.passed = [];
  discovery.history = [];
  persistDiscovery();
  els.artistPicker.hidden = true;
  els.discoveryCards.hidden = false;
  if (!queue.length) els.discoveryDescription.textContent = "Sugestões da casa para você começar. Você pode escolher seus artistas quando quiser.";
  renderDiscoveryCard();
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
    els.discoveryDescription.textContent = discovery.list.length
      ? `Você já escolheu ${discovery.list.length} música${discovery.list.length === 1 ? "" : "s"} para cantar.`
      : "Não encontramos mais músicas para estes artistas no catálogo.";
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
  record.textContent = isSpotify ? "Do seu Spotify" : popularSongs.some((item) => item.code === song.code) ? "Mais popular" : discovery.artists.some((name) => normalize(name) === normalize(cleanArtist(song.artist))) ? "Artista escolhido" : "Sugestão da casa";
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
  discovery.history.push({ action, code: song.code, index: discovery.index });
  discovery.history = discovery.history.slice(-1);
  discovery.seen = [...new Set([...discovery.seen, song.code])];
  if (action === "pass" && !discovery.passed.includes(song.code)) discovery.passed.push(song.code);
  if (action === "choose" && !discovery.list.includes(song.code)) discovery.list.push(song.code);
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
  if (last.action === "choose") discovery.list = discovery.list.filter((code) => code !== last.code);
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
  els.discoveryView.hidden = true;
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
    const codes = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    return new Set(Array.isArray(codes) ? codes.map(String) : []);
  } catch {
    return new Set();
  }
}

function persistFavorites() {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favoriteCodes]));
  } catch {
    els.spotifyStatus.hidden = false;
    els.spotifyStatus.textContent = "Não foi possível salvar suas favoritas neste navegador.";
  }
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

function addFavorites(newSongs) {
  for (const song of newSongs) favoriteCodes.add(String(song.code));
  persistFavorites();
  updateFavoriteControls();
}

function toggleFavorite(song) {
  if (favoriteCodes.has(song.code)) favoriteCodes.delete(song.code);
  else favoriteCodes.add(song.code);
  setSongFavorite(song.code, favoriteCodes.has(song.code));
  persistFavorites();
  if (favoritesOnly) {
    applyFilters();
  } else {
    document.querySelectorAll(".favorite-btn").forEach((button) => {
      if (button.dataset.code !== song.code) return;
      const saved = favoriteCodes.has(song.code);
      button.textContent = saved ? "Salva" : "Favoritar";
      button.setAttribute("aria-pressed", String(saved));
      button.setAttribute("aria-label", `${saved ? "Remover das favoritas" : "Adicionar às favoritas"}: ${displayTitle(song.title)}`);
      button.classList.toggle("is-favorite", saved);
    });
  }
  updateFavoriteControls();
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
  els.discoveryView.hidden = true;
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
  els.discoveryView.hidden = true;
  els.popularView.hidden = true;
  els.songsList.hidden = false;
  activeCategory = null;
  els.searchInput.value = "";
  els.clearButton.hidden = true;
  els.activeFilter.textContent = "Suas favoritas";
  hideRelatedArtists();
  setBrowseMode(false);
  applyFilters();
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
function refreshFilteredSearch() {
  if (["discovery", "popular"].includes(activeCategory?.type)) activeCategory = null;
  els.discoveryView.hidden = true;
  els.popularView.hidden = true;
  els.songsList.hidden = false;
  setBrowseMode(false);
  els.activeFilter.textContent = "Resultados da busca";
  applyFilters();
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
  els.discoveryView.hidden = true;
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
  els.discoveryView.hidden = true;
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
    ? "Você ainda não salvou músicas. Volte às categorias e use Favoritar nas que quiser cantar."
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
  if (dialogReturnFocus?.isConnected) dialogReturnFocus.focus({ preventScroll: true });
});

function openNightList() {
  renderNightList();
  els.nightListDialog.showModal();
}

function closeNightList() { els.nightListDialog.close(); }

function resetNight() {
  if (discovery.list.length && !window.confirm("Começar uma nova noite e limpar a lista de músicas?")) return;
  discovery.list = [];
  discovery.queue = [];
  discovery.index = 0;
  discovery.seen = [];
  discovery.passed = [];
  discovery.history = [];
  persistDiscovery();
  if (activeCategory?.type === "discovery") showDiscoveryPicker();
}

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

  if (DISCOVERY_ENABLED) tiles.push(createCategoryTile({ id: "discover", title: "Descobrir o que cantar", color: "#ba5d07", artLabel: "♫", onClick: showDiscoveryPicker }));
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
  els.discoveryView.hidden = true;
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
els.startDiscovery.addEventListener("click", () => startDiscovery());
els.skipArtistPicker.addEventListener("click", () => startDiscovery([]));
els.changeArtists.addEventListener("click", showDiscoveryPicker);
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
els.nightListAccess.addEventListener("click", openNightList);
els.closeNightList.addEventListener("click", closeNightList);
els.nightListDialog.addEventListener("click", (event) => { if (event.target === els.nightListDialog) closeNightList(); });
els.resetNight.addEventListener("click", resetNight);
els.closeArtistSongs?.addEventListener("click", closeArtistSongsDialog);
els.backToNightList?.addEventListener("click", closeArtistSongsDialog);
els.artistSongsDialog?.addEventListener("click", (event) => {
  if (event.target === els.artistSongsDialog) closeArtistSongsDialog();
});
els.artistSongsDialog?.addEventListener("close", () => {
  if (!artistDialogFromNightList) return;
  artistDialogFromNightList = false;
  queueMicrotask(() => openNightList());
});
els.favoritesButton.addEventListener("click", showFavorites);
els.mobileFavoritesButton?.addEventListener("click", showFavorites);
initializeTheme();
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
    favoriteCodes = new Set([...favoriteCodes].filter((code) => songByCode.has(code)));
  } catch (err) {
    els.resultsCount.textContent = "Não foi possível carregar o catálogo.";
    console.error(err);
    return;
  }

  buildCategories();
  const allArtists = catalogArtists(songs);
  const allByKey = new Map(allArtists.map((artist) => [artist.key, artist]));
  const preferred = CURATED.flatMap((pack) => pack.artists).map(normalize);
  const preferredArtists = preferred.map((key) => allByKey.get(key)).filter(Boolean);
  artistOptions = [...preferredArtists, ...allArtists.filter(({ key }) => !preferred.includes(key))];
  discovery = sanitizeDiscoveryState(discovery, songs.map((song) => String(song.code)));
  renderNightList();
  updateFavoriteControls();
  els.resultsCount.textContent = `${songs.length.toLocaleString("pt-BR")} músicas no catálogo`;

  try {
  const topTracks = spotifyConfigured ? await completeSpotifyConnection() : null;
    if (topTracks) {
      const matches = matchSpotifyTracks(songs, topTracks);
      spotifySuggestions = matches;
      els.spotifyStatus.textContent = `${matches.length} de ${topTracks.length} músicas mais ouvidas estão disponíveis para suas sugestões. Escolha “Quero cantar” para adicionar à lista.`;
      if (discovery.queue.length && discovery.index < discovery.queue.length) {
        const additions = matches.map((song) => String(song.code)).filter((code) => !discovery.queue.includes(code) && !discovery.seen.includes(code));
        discovery.queue.splice(discovery.index + 1, 0, ...additions);
        persistDiscovery();
        showDiscoveryPicker();
      } else if (discovery.artists.length === 3) {
        await startDiscovery();
        showDiscoveryPicker();
      } else showDiscoveryPicker();
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
init();
