import "./styles.css";

const songs = [
  { code: "04122", title: "Evidências", artist: "Chitãozinho & Xororó", genre: "Sertanejo", color: "pink" },
  { code: "03819", title: "Cheia de Manias", artist: "Raça Negra", genre: "Pagode", color: "peach" },
  { code: "07512", title: "Dormi na Praça", artist: "Bruno & Marrone", genre: "Sertanejo", color: "yellow" },
  { code: "09231", title: "Boate Azul", artist: "Joaquim & Manuel", genre: "Sertanejo", color: "blue" },
  { code: "05510", title: "Não Quero Dinheiro", artist: "Tim Maia", genre: "MPB", color: "green" },
  { code: "01944", title: "Anna Júlia", artist: "Los Hermanos", genre: "Rock / Pop", color: "mint" },
];

const searchInput = document.querySelector("#song-search");
const songsGrid = document.querySelector("#songs-grid");
const resultsCount = document.querySelector("#results-count");
const emptyState = document.querySelector("#empty-state");
const clearButton = document.querySelector("#clear-search");
const dialog = document.querySelector("#dj-dialog");

function normalize(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

function createSongCard(song) {
  const card = document.createElement("article");
  card.className = "song-card";
  const top = document.createElement("div");
  top.className = "song-top";
  const info = document.createElement("div");
  const genre = document.createElement("span");
  genre.className = `genre genre-${song.color}`;
  genre.textContent = song.genre;
  const title = document.createElement("h3");
  title.textContent = song.title;
  const artist = document.createElement("p");
  artist.className = "song-artist";
  artist.textContent = song.artist;
  info.append(genre, title, artist);
  const code = document.createElement("span");
  code.className = "song-code-small";
  code.innerHTML = `<small>CÓDIGO</small><strong></strong>`;
  code.querySelector("strong").textContent = song.code;
  top.append(info, code);
  const button = document.createElement("button");
  button.className = "button button-song";
  button.type = "button";
  button.textContent = "Mostrar código ao DJ";
  button.addEventListener("click", () => showSongToDJ(song));
  card.append(top, button);
  return card;
}

function renderSongs() {
  const query = normalize(searchInput.value);
  const filtered = songs.filter((song) =>
    normalize([song.title, song.artist, song.genre, song.code].join(" ")).includes(query)
  );
  songsGrid.replaceChildren(...filtered.map(createSongCard));
  resultsCount.textContent = `${filtered.length} ${filtered.length === 1 ? "música encontrada" : "músicas encontradas"}`;
  emptyState.hidden = filtered.length !== 0;
  clearButton.hidden = searchInput.value.length === 0;
}

function showSongToDJ(song) {
  document.querySelector("#dialog-song").textContent = `${song.title} — ${song.artist}`;
  document.querySelector("#dialog-code").textContent = song.code;
  if (typeof dialog.showModal === "function") dialog.showModal();
}

searchInput.addEventListener("input", renderSongs);
clearButton.addEventListener("click", () => {
  searchInput.value = "";
  renderSongs();
  searchInput.focus();
});
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && dialog.open) dialog.close();
});
renderSongs();
