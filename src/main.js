import "./styles.css";
import { searchCatalog, matchSpotifyTracks, curatedArtistSuggestions, normalizeText, cleanArtist } from "./lib/catalog.js";
import { fetchDeezerMeta, fetchRelatedArtists } from "./integrations/deezer.js";
import { spotifyConfigured, connectSpotify, completeSpotifyConnection } from "./integrations/spotify.js";

const BASE = import.meta.env.BASE_URL || "/";
const PAGE_SIZE = 40;

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
  spotifyButton: document.querySelector("#spotify-connect"),
  spotifyStatus: document.querySelector("#spotify-status"),
  relatedSection: document.querySelector("#related-artists"),
  relatedTitle: document.querySelector("#related-title"),
  relatedList: document.querySelector("#related-list"),
};

/** @type {Array<{code:string,artist:string,title:string,lyricStart:string,lang:string}>} */
let songs = [];
let filtered = [];
let visibleCount = PAGE_SIZE;
let activeCategory = null;
let previewCode = null;
let favoriteCodes = loadFavorites();
let favoritesOnly = false;
let relatedRequest = 0;
let songByCode = new Map();
let observer = null;

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

const FAVORITES_KEY = "bdc-favorites-v1";

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
    els.spotifyStatus.textContent = "Não foi possível salvar suas favoritas neste navegador.";
  }
}

function updateFavoriteControls() {
  els.favoritesCount.textContent = favoriteCodes.size.toLocaleString("pt-BR");
  els.favoritesButton.setAttribute("aria-pressed", String(favoritesOnly));
  els.favoritesButton.classList.toggle("is-active", favoritesOnly);
}

function addFavorites(newSongs) {
  for (const song of newSongs) favoriteCodes.add(String(song.code));
  persistFavorites();
  updateFavoriteControls();
}

function toggleFavorite(song) {
  if (favoriteCodes.has(song.code)) favoriteCodes.delete(song.code);
  else favoriteCodes.add(song.code);
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
  favoritesOnly = false;
  activeCategory = { type: "artist", value: artist, label: `Artista: ${artist}` };
  els.searchInput.value = "";
  els.clearButton.hidden = true;
  els.activeFilter.textContent = activeCategory.label;
  setBrowseMode(false);
  updateFavoriteControls();
  applyFilters();
  renderRelatedArtists(artist);
  els.resultsView.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showFavorites() {
  if (favoritesOnly) {
    backToBrowse();
    return;
  }
  favoritesOnly = true;
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

function applyFilters() {
  const q = els.searchInput.value.trim();
  let list = favoritesOnly ? songs.filter((s) => favoriteCodes.has(s.code)) : songs;

  if (activeCategory) {
    if (activeCategory.type === "lang") {
      list = list.filter((s) => s.lang === activeCategory.value);
    } else if (activeCategory.type === "letter") {
      list = list.filter((s) => normalize(s.artist).startsWith(normalize(activeCategory.value)));
    } else if (activeCategory.type === "artist") {
      list = list.filter((s) => normalize(cleanArtist(s.artist)) === normalize(activeCategory.value));
    } else if (activeCategory.type === "artists") {
      const names = activeCategory.value.map(normalize);
      list = list.filter((s) => names.some((name) => {
        const artist = normalize(cleanArtist(s.artist));
        return artist === name || artist.includes(name) || name.includes(artist);
      }));
    }
  }

  filtered = searchCatalog(list, q);
  visibleCount = PAGE_SIZE;
  renderResults();
}

function setBrowseMode(browse) {
  els.browseView.hidden = !browse;
  els.resultsView.hidden = browse;
}

function showCategory(category) {
  favoritesOnly = false;
  updateFavoriteControls();
  hideRelatedArtists();
  activeCategory = category;
  els.searchInput.value = "";
  els.clearButton.hidden = true;
  setBrowseMode(false);
  els.activeFilter.textContent = category.label;
  applyFilters();
  els.resultsView.scrollIntoView({ behavior: "smooth", block: "start" });
}

function backToBrowse() {
  activeCategory = null;
  favoritesOnly = false;
  hideRelatedArtists();
  updateFavoriteControls();
  els.searchInput.value = "";
  els.clearButton.hidden = true;
  setBrowseMode(true);
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
  row.setAttribute("role", "listitem");

  const coverWrap = document.createElement("div");
  coverWrap.className = "song-cover";
  coverWrap.append(createCoverFallback(song));

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
  spotify.className = "action-link";
  spotify.href = spotifySearchUrl(song.artist.replace(/\.\.\.$/, ""), displayTitle(song.title));
  spotify.target = "_blank";
  spotify.rel = "noopener noreferrer";
  spotify.textContent = "Ouvir no Spotify";

  const previewBtn = document.createElement("button");
  previewBtn.type = "button";
  previewBtn.className = "action-btn preview-btn";
  previewBtn.textContent = "Preview";
  previewBtn.hidden = true;
  previewBtn.addEventListener("click", () => togglePreview(song, previewBtn));

  const djBtn = document.createElement("button");
  djBtn.type = "button";
  djBtn.className = "action-btn dj-btn";
  djBtn.textContent = "Código ao DJ";
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

  actions.append(favoriteBtn, spotify, previewBtn, djBtn);
  row.append(coverWrap, info, actions);
  return row;
}

async function enrichRow(row) {
  const code = row.dataset.code;
  const song = songByCode.get(code);
  if (!song) return;
  try {
    const meta = await fetchDeezerMeta(song);
    if (!meta) return;
    const coverWrap = row.querySelector(".song-cover");
    if (meta.cover && coverWrap && !coverWrap.querySelector("img")) {
      const img = document.createElement("img");
      img.alt = "";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.src = meta.cover;
      const show = () => {
        if (row.isConnected) coverWrap.replaceChildren(img);
      };
      img.addEventListener("error", () => {
        /* keep initials fallback */
      });
      if (img.complete && img.naturalWidth > 0) show();
      else img.addEventListener("load", show, { once: true });
    }
    const previewBtn = row.querySelector(".preview-btn");
    if (meta.previewUrl && previewBtn) {
      previewBtn.hidden = false;
      previewBtn.dataset.preview = meta.previewUrl;
    }
  } catch {
    /* keep fallback */
  }
}

function setupObserver() {
  if (observer) observer.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          observer.unobserve(entry.target);
          enrichRow(entry.target);
        }
      }
    },
    { rootMargin: "120px" }
  );
}

function renderResults() {
  const slice = filtered.slice(0, visibleCount);
  const rows = slice.map(createSongRow);
  els.songsList.replaceChildren(...rows);
  setupObserver();
  rows.forEach((row) => observer.observe(row));

  const total = filtered.length;
  const q = els.searchInput.value.trim();
  if (activeCategory || q) {
    els.resultsCount.textContent =
      total === 1 ? "1 música encontrada" : `${total.toLocaleString("pt-BR")} músicas encontradas`;
  } else {
    els.resultsCount.textContent = `${songs.length.toLocaleString("pt-BR")} músicas no catálogo`;
  }

  els.emptyState.hidden = total !== 0;
  els.emptyState.textContent = favoritesOnly && !q
    ? "Você ainda não salvou músicas. Volte às categorias e use Favoritar nas que quiser cantar."
    : "Nenhuma música encontrada. Tente outro título, artista, código ou trecho da letra.";
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
    btn.textContent = "Preview";
  });
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
  document.querySelector("#dialog-song").textContent = `${displayTitle(song.title)} — ${song.artist.replace(/\.\.\.$/, "")}`;
  document.querySelector("#dialog-code").textContent = song.code;
  if (typeof els.dialog.showModal === "function") els.dialog.showModal();
}

function tileArtLetter(label) {
  return (label || "?").trim().charAt(0).toUpperCase();
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
  art.textContent = artLabel || tileArtLetter(title);

  btn.append(name, art);
  btn.addEventListener("click", onClick);
  return btn;
}

function buildCategories() {
  const tiles = [];

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
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

const onSearchInput = debounce(() => {
  const q = els.searchInput.value.trim();
  if (q) {
    setBrowseMode(false);
    if (favoritesOnly) els.activeFilter.textContent = `Suas favoritas · “${q}”`;
    else if (!activeCategory) els.activeFilter.textContent = `Busca: “${q}”`;
    else els.activeFilter.textContent = `${activeCategory.label} · “${q}”`;
  } else if (!activeCategory && !favoritesOnly) {
    setBrowseMode(true);
    els.resultsCount.textContent = `${songs.length.toLocaleString("pt-BR")} músicas no catálogo`;
    return;
  } else {
    els.activeFilter.textContent = favoritesOnly ? "Suas favoritas" : activeCategory.label;
  }
  applyFilters();
}, 160);

els.searchInput.addEventListener("input", onSearchInput);
els.clearButton.addEventListener("click", () => {
  els.searchInput.value = "";
  els.clearButton.hidden = true;
  if (activeCategory || favoritesOnly) {
    els.activeFilter.textContent = favoritesOnly ? "Suas favoritas" : activeCategory.label;
    applyFilters();
  } else {
    backToBrowse();
  }
  els.searchInput.focus();
});
els.backToBrowse.addEventListener("click", backToBrowse);
els.favoritesButton.addEventListener("click", showFavorites);
els.spotifyButton.hidden = !spotifyConfigured;
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
els.dialog.addEventListener("click", (event) => {
  if (event.target === els.dialog) els.dialog.close();
});

async function init() {
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
  updateFavoriteControls();
  els.resultsCount.textContent = `${songs.length.toLocaleString("pt-BR")} músicas no catálogo`;

  try {
    const topTracks = await completeSpotifyConnection();
    if (topTracks) {
      const matches = matchSpotifyTracks(songs, topTracks);
      addFavorites(matches);
      els.spotifyStatus.textContent = `${matches.length} de ${topTracks.length} músicas mais ouvidas encontradas no karaokê e salvas nas favoritas.`;
      if (matches.length) showFavorites();
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

init();
