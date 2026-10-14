import "./styles.css";

const BASE = import.meta.env.BASE_URL || "/";
const PAGE_SIZE = 40;
const META_CACHE_KEY = "bdc-deezer-meta-v1";

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
};

/** @type {Array<{code:string,artist:string,title:string,lyricStart:string,lang:string}>} */
let songs = [];
let filtered = [];
let visibleCount = PAGE_SIZE;
let activeCategory = null;
let previewCode = null;
const metaCache = loadMetaCache();
const metaInflight = new Map();
let observer = null;

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
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

function loadMetaCache() {
  try {
    const raw = localStorage.getItem(META_CACHE_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw);
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

function persistMetaCache() {
  try {
    const obj = Object.fromEntries([...metaCache.entries()].slice(-800));
    localStorage.setItem(META_CACHE_KEY, JSON.stringify(obj));
  } catch {
    /* quota / private mode */
  }
}

function deezerJsonp(query) {
  return new Promise((resolve, reject) => {
    const cb = `dzcb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("timeout"));
    }, 8000);

    function cleanup() {
      clearTimeout(timer);
      delete window[cb];
      script.remove();
    }

    window[cb] = (data) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("script error"));
    };
    script.src = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=1&output=jsonp&callback=${cb}`;
    document.head.appendChild(script);
  });
}

async function deezerFetchProxy(query) {
  const url = `/api/deezer/search?q=${encodeURIComponent(query)}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("proxy fail");
  return res.json();
}

async function fetchDeezerMeta(song) {
  const key = song.code;
  if (metaCache.has(key)) return metaCache.get(key);
  if (metaInflight.has(key)) return metaInflight.get(key);

  const artist = song.artist.replace(/\.\.\.$/, "").trim();
  const title = displayTitle(song.title);
  const simpleQ = `${artist} ${title}`;
  const structuredQ = `artist:"${artist}" track:"${title}"`;

  const promise = (async () => {
    let data = null;

    async function tryQueries(runner) {
      for (const q of [simpleQ, structuredQ]) {
        try {
          const result = await runner(q);
          if (result?.data?.length) return result;
        } catch {
          /* try next */
        }
      }
      return null;
    }

    if (import.meta.env.DEV) {
      data = await tryQueries(deezerFetchProxy);
    }
    if (!data?.data?.length) {
      data = (await tryQueries(deezerJsonp)) || { data: [] };
    }

    const track = data?.data?.[0];
    const meta = track
      ? {
          cover: track.album?.cover_medium || track.album?.cover || null,
          previewUrl: track.preview || null,
          deezerTitle: track.title || null,
        }
      : { cover: null, previewUrl: null, deezerTitle: null };

    metaCache.set(key, meta);
    persistMetaCache();
    return meta;
  })();

  metaInflight.set(key, promise);
  try {
    return await promise;
  } finally {
    metaInflight.delete(key);
  }
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

function songMatchesQuery(song, q) {
  if (!q) return true;
  const haystack = normalize([song.title, song.artist, song.code, song.lyricStart].join(" "));
  // Support multi-word queries: every token must appear somewhere in the song fields
  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
}

function applyFilters() {
  const q = normalize(els.searchInput.value);
  let list = songs;

  if (activeCategory) {
    if (activeCategory.type === "lang") {
      list = list.filter((s) => s.lang === activeCategory.value);
    } else if (activeCategory.type === "letter") {
      list = list.filter((s) => normalize(s.artist).startsWith(normalize(activeCategory.value)));
    } else if (activeCategory.type === "artists") {
      const set = new Set(activeCategory.value.map(normalize));
      list = list.filter((s) => {
        const a = normalize(s.artist);
        return [...set].some((name) => a.includes(name) || name.includes(a));
      });
    }
  }

  filtered = q ? list.filter((s) => songMatchesQuery(s, q)) : list;
  visibleCount = PAGE_SIZE;
  renderResults();
}

function setBrowseMode(browse) {
  els.browseView.hidden = !browse;
  els.resultsView.hidden = browse;
}

function showCategory(category) {
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
  const artist = document.createElement("p");
  artist.textContent = song.artist.replace(/\.\.\.$/, "");
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

  actions.append(spotify, previewBtn, djBtn);
  row.append(coverWrap, info, actions);
  return row;
}

async function enrichRow(row) {
  const code = row.dataset.code;
  const song = songs.find((s) => s.code === code);
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
  els.loadMore.hidden = visibleCount >= total;
  els.clearButton.hidden = q.length === 0;
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
  const url = button.dataset.preview || metaCache.get(song.code)?.previewUrl;
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
    if (!activeCategory) els.activeFilter.textContent = `Busca: “${q}”`;
    else els.activeFilter.textContent = `${activeCategory.label} · “${q}”`;
  } else if (!activeCategory) {
    setBrowseMode(true);
    els.resultsCount.textContent = `${songs.length.toLocaleString("pt-BR")} músicas no catálogo`;
    return;
  } else {
    els.activeFilter.textContent = activeCategory.label;
  }
  applyFilters();
}, 160);

els.searchInput.addEventListener("input", onSearchInput);
els.clearButton.addEventListener("click", () => {
  els.searchInput.value = "";
  els.clearButton.hidden = true;
  if (activeCategory) {
    els.activeFilter.textContent = activeCategory.label;
    applyFilters();
  } else {
    backToBrowse();
  }
  els.searchInput.focus();
});
els.backToBrowse.addEventListener("click", backToBrowse);
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
  } catch (err) {
    els.resultsCount.textContent = "Não foi possível carregar o catálogo.";
    console.error(err);
    return;
  }

  buildCategories();
  els.resultsCount.textContent = `${songs.length.toLocaleString("pt-BR")} músicas no catálogo`;

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
