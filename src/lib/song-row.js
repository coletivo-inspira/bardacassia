import { cleanArtist, displayTitle } from "./catalog.js";
import { cancelPendingDeezerMeta, fetchDeezerMeta, metaFromCatalog } from "../integrations/deezer.js";
import { createTabWithSong, moveSong, tabOf } from "./favorites.js";
import { getFeatures } from "./feature-state.js";
import { showDeezer, showFavorites } from "./features.js";

const META_ROOT_MARGIN = "200px 0px";

export const LANG_LABELS = {
  BRA: "Brasileiras",
  EUA: "Internacionais",
  JAP: "Japonês",
  ITA: "Italiano",
  ESP: "Español",
  FRA: "Francês",
};

export function spotifySearchUrl(artist, title) {
  return `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${title}`)}`;
}

const ACTION_ICONS = {
  // Ticket with code lines — clearer than a bare hash at small sizes.
  code: {
    paths: [
      '<rect x="4.5" y="5" width="15" height="14" rx="2.5"/>',
      '<path d="M8 9.5h8M8 12.5h8M8 15.5h5"/>',
    ],
  },
  heart: {
    paths: ['<path d="M12 20S5 14.8 5 9.2A3.9 3.9 0 0 1 12 6.4 3.9 3.9 0 0 1 19 9.2C19 14.8 12 20 12 20z"/>'],
  },
  heartFilled: {
    fill: true,
    paths: ['<path d="M12 20S5 14.8 5 9.2A3.9 3.9 0 0 1 12 6.4 3.9 3.9 0 0 1 19 9.2C19 14.8 12 20 12 20z"/>'],
  },
  play: {
    fill: true,
    paths: ['<path d="M8.2 5.4v13.2L19.2 12 8.2 5.4z"/>'],
  },
  pause: {
    fill: true,
    paths: ['<path d="M7.5 5h3.2v14H7.5zm5.8 0H16.5v14h-3.2z"/>'],
  },
  spotify: {
    fill: true,
    paths: [
      '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.56 14.45a.72.72 0 0 1-.98.25c-2.68-1.64-6.06-2-10.04-1.1a.72.72 0 1 1-.32-1.4c4.35-.99 8.06-.57 11.09 1.28a.72.72 0 0 1 .25.97zm1.27-2.82a.9.9 0 0 1-1.23.3c-3.07-1.89-7.75-2.43-11.38-1.33a.9.9 0 1 1-.52-1.72c4.14-1.25 9.3-.64 12.84 1.53a.9.9 0 0 1 .29 1.22zm.11-2.95C14.67 8.95 8.64 8.77 5.55 9.7a1.07 1.07 0 1 1-.62-2.05c3.55-1.08 10.24-.87 14.26 1.53a1.07 1.07 0 0 1-1.12 1.83z"/>',
    ],
  },
  pass: { paths: ['<path d="M7 7l10 10M17 7 7 17"/>'] },
  bookmark: { paths: ['<path d="M7 4h10a1 1 0 0 1 1 1v16l-6-3.5L6 21V5a1 1 0 0 1 1-1z"/>'] },
  bookmarkFilled: {
    fill: true,
    paths: ['<path d="M7 4h10a1 1 0 0 1 1 1v16l-6-3.5L6 21V5a1 1 0 0 1 1-1z"/>'],
  },
};

export function createIcon(name) {
  const spec = ACTION_ICONS[name];
  if (!spec) return document.createTextNode("");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", "0 0 24 24");
  if (spec.fill) svg.classList.add("icon-fill");
  svg.innerHTML = spec.paths.join("");
  return svg;
}

export function setIconAction(el, iconName) {
  el.classList.add("icon-action");
  el.classList.remove("labeled-action");
  el.replaceChildren(createIcon(iconName));
}

export function setLabeledIconAction(el, iconName, label) {
  el.classList.remove("icon-action");
  el.classList.add("labeled-action");
  const text = document.createElement("span");
  text.textContent = label;
  el.replaceChildren(createIcon(iconName), text);
}

export function paintFavoriteButton(button, saved, title) {
  button.classList.toggle("is-favorite", saved);
  button.setAttribute("aria-pressed", String(saved));
  button.setAttribute("aria-label", `${saved ? "Remover das favoritas" : "Adicionar às favoritas"}: ${title}`);
  if (button.classList.contains("icon-action")) setIconAction(button, saved ? "heartFilled" : "heart");
  else button.textContent = saved ? "Salva" : "Favoritar";
}

export function paintPreviewButton(button, playing) {
  button.classList.toggle("is-playing", playing);
  if (button.classList.contains("icon-action")) {
    setIconAction(button, playing ? "pause" : "play");
    return;
  }
  button.textContent = playing ? "Pausar" : (button.dataset.idleLabel || "Preview");
}

function initials(artist, title) {
  const a = (artist || "?").trim().charAt(0);
  const t = (title || "?").trim().charAt(0);
  return (a + t).toUpperCase();
}

export function colorFromCode(code) {
  const colors = ["#e91429", "#148a08", "#509bf5", "#ba5d07", "#8d67ab", "#e1118c", "#477d95", "#b49bc8"];
  let n = 0;
  for (const ch of String(code)) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return colors[n % colors.length];
}

export function createCoverFallback(song) {
  const el = document.createElement("div");
  el.className = "cover-fallback";
  el.style.background = colorFromCode(song.code);
  el.textContent = initials(song.artist, song.title);
  return el;
}

export function setCoverImage(coverWrap, song, coverUrl) {
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

export function applySongMeta(row, meta, song) {
  if (!meta || !row.isConnected) return;
  const coverWrap = row.querySelector(".song-cover");
  // Mirror the dialog: put the <img> in the DOM immediately. Waiting for load on an
  // off-DOM (or lazy) image left the search list stuck on initials while the modal worked.
  // Replace whenever the URL changes so dialog sync can repair a missing/failed cover.
  if (meta.cover && coverWrap) {
    setCoverImage(coverWrap, song, meta.cover);
  }
  const previewBtn = row.querySelector(".preview-btn");
  if (meta.previewUrl && previewBtn && showDeezer(getFeatures())) {
    previewBtn.hidden = false;
    previewBtn.dataset.preview = meta.previewUrl;
  }
}

/**
 * Catalog list row. Pages pass the dialogs and favorites they own as callbacks;
 * `extra` (e.g. the move-to-tab select) is placed before the cover.
 */
export function createSongRow(song, { favorite, onShowCode, onShowArtist, onToggleFavorite, onTogglePreview, extra = null }) {
  const row = document.createElement("article");
  row.className = "song-row";
  row.dataset.code = song.code;
  row.dataset.metaState = "idle";
  row.setAttribute("role", "listitem");

  const coverWrap = document.createElement("button");
  coverWrap.type = "button";
  coverWrap.className = "song-cover";
  coverWrap.setAttribute("aria-label", `Ver código: ${displayTitle(song.title)}`);
  coverWrap.addEventListener("click", () => onShowCode(song));
  const catalogMeta = metaFromCatalog(song);
  coverWrap.append(createCoverFallback(song));
  if (catalogMeta.cover) {
    setCoverImage(coverWrap, song, catalogMeta.cover);
    row.dataset.metaState = "done";
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
  artist.addEventListener("click", () => onShowArtist(cleanArtist(song.artist)));
  const meta = document.createElement("p");
  meta.className = "song-meta";
  meta.textContent = `Código ${song.code} · ${LANG_LABELS[song.lang] || song.lang}`;
  info.append(title, artist, meta);

  const actions = document.createElement("div");
  actions.className = "song-actions";

  const secondary = document.createElement("div");
  secondary.className = "song-actions-secondary";

  const spotify = document.createElement("a");
  spotify.className = "action-link action-secondary icon-action";
  spotify.href = spotifySearchUrl(song.artist.replace(/\.\.\.$/, ""), displayTitle(song.title));
  spotify.target = "_blank";
  spotify.rel = "noopener noreferrer";
  setIconAction(spotify, "spotify");
  spotify.title = "Spotify";
  spotify.setAttribute("aria-label", `Ouvir no Spotify: ${displayTitle(song.title)}`);

  const previewBtn = document.createElement("button");
  previewBtn.type = "button";
  previewBtn.className = "action-btn preview-btn action-secondary icon-action";
  previewBtn.title = "Preview";
  previewBtn.setAttribute("aria-label", `Ouvir trecho: ${displayTitle(song.title)}`);
  setIconAction(previewBtn, "play");
  previewBtn.hidden = true;
  if (showDeezer(getFeatures()) && (catalogMeta.previewUrl || catalogMeta.deezerId)) {
    previewBtn.hidden = false;
    if (catalogMeta.previewUrl) previewBtn.dataset.preview = catalogMeta.previewUrl;
  }
  previewBtn.addEventListener("click", () => onTogglePreview(song, previewBtn));

  const djBtn = document.createElement("button");
  djBtn.type = "button";
  djBtn.className = "action-btn dj-btn";
  setLabeledIconAction(djBtn, "code", "Código");
  djBtn.title = "Código";
  djBtn.setAttribute("aria-label", `Código ao DJ: ${song.code}`);
  djBtn.addEventListener("click", () => onShowCode(song));

  const favoriteBtn = document.createElement("button");
  favoriteBtn.type = "button";
  favoriteBtn.className = "action-btn favorite-btn icon-action";
  favoriteBtn.dataset.code = song.code;
  favoriteBtn.title = "Favoritar";
  favoriteBtn.hidden = !showFavorites(getFeatures());
  paintFavoriteButton(favoriteBtn, favorite, displayTitle(song.title));
  favoriteBtn.addEventListener("click", () => onToggleFavorite(song));

  // Código leads; Favoritar / Preview / Spotify sit in an equal secondary row.
  secondary.append(favoriteBtn, previewBtn, spotify);
  actions.append(djBtn, secondary);
  if (extra) row.append(extra);
  row.append(coverWrap, info, actions);
  return row;
}

/**
 * "Mover para…" select; `onChange` receives the next favorites state after the move.
 * `onNewTab(song)` replaces the native prompt, which embedded browsers may not support.
 */
export function createMoveSelect(song, state, onChange, { onNewTab = null } = {}) {
  const label = document.createElement("label");
  label.className = "move-favorite";
  const text = document.createElement("span");
  text.className = "visually-hidden";
  text.textContent = `Mover ${displayTitle(song.title)} para outra aba`;
  const select = document.createElement("select");
  const current = tabOf(state, song.code);
  select.append(new Option("Mover para…", ""));
  for (const tab of state.tabs) {
    if (tab.id === current?.id) continue;
    select.append(new Option(tab.name, tab.id));
  }
  select.append(new Option("+ Nova aba…", "__new__"));
  select.addEventListener("change", () => {
    const value = select.value;
    if (value === "__new__" && onNewTab) {
      select.value = "";
      onNewTab(song);
    } else if (value === "__new__") {
      const name = window.prompt("Nome da nova aba:");
      if (!name?.trim()) { select.value = ""; return; }
      onChange(createTabWithSong(state, name, song.code));
    } else if (value) {
      onChange(moveSong(state, song.code, value));
    }
  });
  label.append(text, select);
  return label;
}

/**
 * Lazily paints covers and preview URLs on visible rows: catalog sidecar first,
 * Deezer only while the row is near the viewport.
 */
export function createRowMetaLoader({ songFor, ensureCovers }) {
  let observer = null;

  function finishRowMeta(row, meta) {
    if (!row?.isConnected || !meta) return;
    applySongMeta(row, meta, songFor(row.dataset.code));
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
    const song = songFor(row.dataset.code);
    if (!song) return;

    await ensureCovers();
    if (!row.isConnected) return;

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

  /** Replaces the previous observer: call once per render with the new rows. */
  function observe(rows) {
    observer?.disconnect();
    observer = typeof IntersectionObserver === "function"
      ? new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) enrichRow(entry.target);
          else abandonRowMeta(entry.target);
        }
      }, { rootMargin: META_ROOT_MARGIN, threshold: 0 })
      : null;
    if (observer) rows.forEach((row) => observer.observe(row));
    else rows.forEach((row) => enrichRow(row));
  }

  /** Applies cached/fetched Deezer meta to every mounted row for this code. */
  function syncSongMeta(song, meta) {
    if (!song?.code || !meta) return;
    document.querySelectorAll(`.song-row[data-code="${CSS.escape(String(song.code))}"]`).forEach((row) => {
      if (!row.isConnected) return;
      if (meta.cover || meta.previewUrl) row.dataset.metaState = "done";
      applySongMeta(row, meta, song);
      if (meta.cover) observer?.unobserve(row);
    });
  }

  return { observe, syncSongMeta };
}
