import test from "node:test";
import assert from "node:assert/strict";
import { buildDiscoveryQueue, catalogArtists, sanitizeDiscoveryState, emptyDiscoveryState } from "../src/lib/discovery.js";
import { GENRES, artistsForGenres, genreForSong } from "../src/lib/genres.js";

const catalog = [
  { code: "201", artist: "Jorge e Mateus", title: "Sosseguei", lang: "BRA" },
  { code: "202", artist: "Henrique e Juliano", title: "Até Você Voltar", lang: "BRA" },
  { code: "203", artist: "Jorge e Mateus", title: "Logo Eu", lang: "BRA" },
  { code: "204", artist: "Queen", title: "Bohemian Rhapsody", lang: "EUA" },
  { code: "205", artist: "Anitta", title: "Envolver", lang: "BRA" },
];

test("estilos trazem somente artistas que existem no catálogo, sem repetir", () => {
  const artists = artistsForGenres(["sertanejo", "pop", "sertanejo"], catalogArtists(catalog));
  assert.deepEqual(artists.map(({ name }) => name), ["Jorge e Mateus", "Henrique e Juliano", "Anitta"]);
});

test("cada estilo tem id único e lista de artistas", () => {
  const ids = GENRES.map((genre) => genre.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const genre of GENRES) assert.ok(genre.artists.length > 0, genre.id);
});

test("fila começa pelos artistas escolhidos e segue com os artistas dos estilos", () => {
  const queue = buildDiscoveryQueue(catalog, { artists: ["Queen"], genreArtists: ["Jorge e Mateus", "Henrique e Juliano", "Queen"] });
  assert.deepEqual(queue.map(({ code, source }) => [code, source]), [
    ["204", "Artista escolhido"],
    ["201", "Do estilo escolhido"],
    ["202", "Do estilo escolhido"],
    ["203", "Do estilo escolhido"],
  ]);
});

test("pular artistas ainda gera sugestões a partir dos estilos", () => {
  const queue = buildDiscoveryQueue(catalog, { artists: [], genreArtists: ["Anitta"] });
  assert.deepEqual(queue.map(({ code }) => code), ["205"]);
});

test("identifica o estilo de uma música entre os estilos escolhidos", () => {
  assert.equal(genreForSong(catalog[0], ["pop", "sertanejo"])?.id, "sertanejo");
  assert.equal(genreForSong(catalog[3], ["sertanejo"]), null);
});

test("estado v1 migra para v2 sem limite de três artistas", () => {
  const artists = ["Queen", "Anitta", "Jorge e Mateus", "Henrique e Juliano", "Adele"];
  const state = sanitizeDiscoveryState({ version: 1, artists, queue: ["204"], list: ["201"] }, ["204"]);
  assert.equal(state.version, 2);
  assert.deepEqual(state.genres, []);
  assert.deepEqual(state.artists, artists);
  assert.deepEqual(state.list, ["201"]);
  assert.deepEqual(sanitizeDiscoveryState({ genres: ["pop", 3, "pop"] }, []).genres, ["pop"]);
  assert.deepEqual(emptyDiscoveryState().genres, []);
});

test("histórico guarda se o Quero cantar adicionou a música às favoritas", () => {
  const state = sanitizeDiscoveryState({ queue: ["204"], history: [{ action: "choose", code: "204", index: 0, added: true }] }, ["204"]);
  assert.deepEqual(state.history, [{ action: "choose", code: "204", index: 0, added: true }]);
});
