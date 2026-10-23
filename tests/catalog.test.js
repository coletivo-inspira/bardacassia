import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeText, searchCatalog, matchSpotifyTracks, curatedArtistSuggestions, filtersForArtistSelection, filterCatalog,
} from "../src/lib/catalog.js";
import { buildDiscoveryQueue, catalogArtists, filterArtists, sanitizeDiscoveryState } from "../src/lib/discovery.js";

const catalog = [
  { code: "101", artist: "Marília Mendonça", title: "Infiel", lyricStart: "Isso não é uma disputa", lang: "BRA" },
  { code: "102", artist: "Queen", title: "Bohemian Rhapsody", lyricStart: "Is this the real life", lang: "EUA" },
  { code: "103", artist: "Marília Mendonça", title: "Eu Sei de Cor", lyricStart: "É, já tá ficando chato", lang: "BRA" },
  { code: "104", artist: "ABBA", title: "Dancing Queen", lyricStart: "You can dance", lang: "EUA" },
];

test("normaliza acentos, caixa e pontuação", () => {
  assert.equal(normalizeText("  MARÍLIA & MENDONÇA! "), "marilia e mendonca");
});

test("encontra por artista, código e trecho da letra", () => {
  assert.deepEqual(searchCatalog(catalog, "marilia").map((s) => s.code), ["101", "103"]);
  assert.equal(searchCatalog(catalog, "102")[0].title, "Bohemian Rhapsody");
  assert.equal(searchCatalog(catalog, "real life")[0].code, "102");
});

test("prioriza correspondência exata sobre correspondência parcial", () => {
  assert.equal(searchCatalog(catalog, "Infiel")[0].code, "101");
  assert.deepEqual(searchCatalog(catalog, "não existe"), []);
});

test("importação do Spotify só adiciona músicas do catálogo e sem duplicação", () => {
  const tracks = [
    { name: "Infiel", artists: [{ name: "Marília Mendonça" }] },
    { name: "Infiel", artists: [{ name: "Marília Mendonça" }] },
    { name: "Infiel", artists: [{ name: "Outro Artista" }] },
    { name: "Bohemian Rhapsody", artists: [{ name: "Queen" }] },
    { name: "Música inexistente", artists: [{ name: "Queen" }] },
  ];
  assert.deepEqual(matchSpotifyTracks(catalog, tracks).map((s) => s.code), ["101", "102"]);
});

test("sugestões editoriais usam somente artistas presentes no catálogo", () => {
  const packs = [{ artists: ["Marília Mendonça", "ABBA", "Artista inexistente"] }];
  assert.deepEqual(curatedArtistSuggestions(catalog, "Marília Mendonça", packs), ["ABBA"]);
});

test("seleciona e filtra artistas sem acentos, sem duplicar grafias equivalentes", () => {
  const artists = catalogArtists(catalog);
  assert.equal(artists.filter(({ key }) => key === "marilia mendonca").length, 1);
  assert.deepEqual(filterArtists(artists, "marilia").map(({ name }) => name), ["Marília Mendonça"]);
});

test("intercala duas músicas dos artistas escolhidos com uma popular e não repete códigos", () => {
  const queue = buildDiscoveryQueue(catalog, ["Marília Mendonça", "ABBA"], [catalog[0], catalog[2], catalog[1]]);
  assert.deepEqual(queue.map(({ code }) => code), ["101", "104", "103", "102"]);
});

test("usa sugestões editoriais somente quando o ranking está vazio", () => {
  const queue = buildDiscoveryQueue(catalog, [], [], ["Queen", "ABBA"]);
  assert.deepEqual(queue.map(({ code, source }) => [code, source]), [["102", "Sugestão da casa"], ["104", "Sugestão da casa"]]);
});

test("recupera estado de descoberta validado contra os códigos ativos", () => {
  const state = sanitizeDiscoveryState({ version: 1, artists: ["Queen"], queue: ["102", "missing"], index: 99, list: ["102", "104"], seen: ["102"], passed: ["102", "missing"], history: [{ action: "pass", code: "102", index: 0 }] }, ["101", "102"]);
  assert.equal(state.index, 1);
  assert.deepEqual(state.queue, ["102"]);
  assert.deepEqual(state.list, ["102", "104"]);
  assert.deepEqual(state.passed, ["102"]);
  assert.deepEqual(state.history, [{ action: "pass", code: "102", index: 0 }]);
});

test('combina idioma, artista, favoritas e texto, preservando códigos', () => {
  const options = { language: 'BRA', artist: 'marilia mendonca', favoritesOnly: true, favoriteCodes: new Set(['103']) };
  assert.deepEqual(filterCatalog(catalog, { ...options, query: 'cor' }).map(s => s.code), ['103']);
  assert.deepEqual(filterCatalog(catalog, { ...options, query: 'Infiel' }), []);
  assert.deepEqual(filterCatalog(catalog, { ...options, language: 'EUA' }), []);
  assert.deepEqual(filterCatalog(catalog, { favoritesOnly: true }), []);
  assert.deepEqual(filterCatalog(catalog, { query: 'Infiel' }).map(s => s.code), ['101']);
  assert.equal(filterCatalog([{ ...catalog[0], code: '001' }], { query: '001' })[0].code, '001');
});

test("seleção de artista limpa idioma/favoritas/query que esconderiam o catálogo do artista", () => {
  assert.deepEqual(filterCatalog(catalog, { language: "BRA", artist: "Queen" }), []);
  const next = filtersForArtistSelection("Queen");
  assert.equal(next.language, "");
  assert.equal(next.favoritesOnly, false);
  assert.equal(next.query, "");
  assert.equal(next.artist, "Queen");
  assert.equal(next.category?.type, "artist");
  assert.deepEqual(filterCatalog(catalog, next).map((s) => s.code), ["102"]);
});

test("cancelPendingDeezerMeta ignora códigos que não estão na fila", async () => {
  const { cancelPendingDeezerMeta } = await import("../src/integrations/deezer.js");
  assert.equal(cancelPendingDeezerMeta("codigo-inexistente"), false);
});
