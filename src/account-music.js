/** Conta: "Seu gosto musical", o Spotify ligado à conta e a persona musical. */
import { disconnectSpotify, getMyMusicProfile, syncSpotify } from "./integrations/music-profile.js";
import { completeSpotifyConnection, connectSpotify, spotifyConfigured } from "./integrations/spotify.js";
import { buildPersona, hasListeningData, musicSuggestions } from "./lib/music-persona.js";

const BASE = import.meta.env.BASE_URL || "/";
let catalogPromise = null;

function loadCatalog() {
  catalogPromise ??= fetch(`${BASE}data/songs.json`)
    .then((response) => (response.ok ? response.json() : []))
    .catch(() => []);
  return catalogPromise;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createAccountMusic({ notify = () => {} } = {}) {
  const panel = document.querySelector("[data-account-music]");
  if (!panel) return { render: async () => {}, handleCallback: async () => {} };
  const $ = (selector) => panel.querySelector(selector);
  const intro = $("[data-music-intro]");
  const personaBox = $("[data-music-persona]");
  const label = $("[data-music-label]");
  const genres = $("[data-music-genres]");
  const artistsTitle = $("[data-music-artists-title]");
  const artists = $("[data-music-artists]");
  const matches = $("[data-music-matches]");
  const cta = $("[data-music-suggestions]");
  const meta = $("[data-music-meta]");
  const status = $("[data-music-status]");
  const connectBtn = $("[data-music-connect]");
  const syncBtn = $("[data-music-sync]");
  const disconnectBtn = $("[data-music-disconnect]");
  let user = null;
  let paintToken = 0;

  const setStatus = (message, tone = "info") => {
    status.textContent = message || "";
    status.dataset.tone = tone;
  };

  const setBusy = (busy) => {
    [connectBtn, syncBtn, disconnectBtn].forEach((button) => { button.disabled = busy; });
    panel.toggleAttribute("aria-busy", busy);
  };

  async function paint(profile) {
    const token = ++paintToken;
    const connected = Boolean(profile);
    connectBtn.hidden = connected;
    syncBtn.hidden = !connected;
    disconnectBtn.hidden = !connected;
    intro.textContent = connected
      ? "Seu perfil musical, calculado com o que você ouve no Spotify."
      : "Conecte o Spotify e a gente sugere músicas do karaokê com a sua cara.";
    meta.hidden = !connected;
    if (connected) {
      const name = profile.source_display_name ? `Conectado como ${profile.source_display_name}` : "Spotify conectado";
      const when = formatDate(profile.synced_at);
      meta.textContent = when ? `${name} · atualizado em ${when}` : name;
    }
    if (!connected) {
      personaBox.hidden = true;
      return;
    }
    personaBox.hidden = false;
    if (!hasListeningData(profile)) {
      label.textContent = "Ainda não há histórico suficiente no seu Spotify.";
      genres.replaceChildren();
      artists.replaceChildren();
      artistsTitle.hidden = true;
      matches.textContent = "Ouça mais um pouco e toque em Atualizar.";
      cta.hidden = true;
      return;
    }
    const catalog = await loadCatalog();
    if (token !== paintToken) return;
    const persona = buildPersona(profile, catalog);
    label.textContent = persona.label;
    genres.replaceChildren(...persona.topGenres.map((genre) => {
      const percent = Math.round(genre.share * 100);
      const item = element("li", "account-music-genre");
      const bar = element("span", "account-music-bar");
      const fill = element("span", "account-music-bar-fill");
      fill.style.width = `${percent}%`;
      bar.append(fill);
      item.append(element("span", "account-music-genre-name", genre.label), bar, element("span", "account-music-genre-share", `${percent}%`));
      return item;
    }));
    artistsTitle.hidden = persona.topArtists.length === 0;
    artists.replaceChildren(...persona.topArtists.map((artist) => {
      const item = element("li", "account-music-artist");
      if (artist.image) {
        const img = element("img");
        img.src = artist.image;
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        img.referrerPolicy = "no-referrer";
        img.addEventListener("error", () => img.remove(), { once: true });
        item.append(img);
      }
      item.append(element("span", "", artist.name));
      if (artist.catalogName) item.title = "Tem músicas no karaokê";
      return item;
    }));
    const suggestions = catalog.length ? musicSuggestions(catalog, profile, { persona }) : [];
    const heard = suggestions.filter((item) => item.kind === "track").length;
    matches.textContent = !catalog.length
      ? ""
      : heard
        ? `${heard.toLocaleString("pt-BR")} ${heard === 1 ? "música que você ouve está" : "músicas que você ouve estão"} no karaokê, e separamos ${suggestions.length.toLocaleString("pt-BR")} sugestões para cantar.`
        : `Nenhuma das suas mais ouvidas está no catálogo, mas separamos ${suggestions.length.toLocaleString("pt-BR")} sugestões no seu estilo.`;
    cta.hidden = suggestions.length === 0;
  }

  async function render(nextUser) {
    user = nextUser;
    panel.hidden = !user || !spotifyConfigured();
    if (panel.hidden) return;
    const profile = await getMyMusicProfile().catch(() => null);
    if (user?.id !== nextUser?.id) return;
    await paint(profile);
  }

  /** Spotify returns to conta.html with ?code=…; runs once per visit. */
  async function handleCallback() {
    try {
      setBusy(true);
      const result = await completeSpotifyConnection();
      if (!result) return;
      if (result.kind === "linked") {
        await paint(result.profile);
        setStatus("Spotify conectado! Seu gosto musical já está no seu perfil.", "success");
        panel.scrollIntoView({ block: "start" });
        return;
      }
      const message = "Lemos suas mais ouvidas, mas a conexão do Spotify com a conta ainda não está ativa neste site. As sugestões aparecem no catálogo nesta visita.";
      if (panel.hidden) notify(message);
      else setStatus(message);
    } catch (error) {
      if (panel.hidden) notify(error.message, "error");
      else setStatus(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  connectBtn.addEventListener("click", async () => {
    try {
      setStatus("Redirecionando para o Spotify…");
      await connectSpotify();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  syncBtn.addEventListener("click", async () => {
    setBusy(true);
    setStatus("Atualizando com o Spotify…");
    try {
      const profile = await syncSpotify();
      await paint(profile);
      setStatus("Pronto! Seu gosto musical foi atualizado.", "success");
    } catch (error) {
      setStatus(error.message, "error");
      if (error.code === "spotify_revoked" || error.code === "not_connected") await paint(null);
    } finally {
      setBusy(false);
    }
  });

  disconnectBtn.addEventListener("click", async () => {
    if (!window.confirm("Desconectar o Spotify e apagar o resumo do seu gosto musical desta conta?")) return;
    setBusy(true);
    try {
      await disconnectSpotify();
      await paint(null);
      setStatus("Spotify desconectado. Apagamos os dados que estavam na sua conta.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      setBusy(false);
    }
  });

  return { render, handleCallback };
}
