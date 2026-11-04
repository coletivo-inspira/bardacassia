import test from "node:test";
import assert from "node:assert/strict";
import { artistGenreIndex, buildSongConnections, relatedCodesFor } from "../src/lib/connections.js";
import { relatedSongsFromConnections, buildDiscoveryQueue } from "../src/lib/discovery.js";

const genres = [
  { id: "sertanejo", artists: ["Jorge e Mateus", "Henrique e Juliano"] },
  { id: "rock", artists: ["Queen"] },
];

const catalog = [
  { code: "201", artist: "Jorge e Mateus", title: "Sosseguei", lang: "BRA" },
  { code: "202", artist: "Henrique e Juliano", title: "Até Você Voltar", lang: "BRA" },
  { code: "203", artist: "Jorge e Mateus", title: "Logo Eu", lang: "BRA" },
  { code: "204", artist: "Queen", title: "Bohemian Rhapsody", lang: "EUA" },
  { code: "205", artist: "Anitta", title: "Envolver", lang: "BRA" },
];

test("índice de artista → estilos curados", () => {
  const index = artistGenreIndex(genres);
  assert.deepEqual(index.get("jorge e mateus"), ["sertanejo"]);
  assert.deepEqual(index.get("queen"), ["rock"]);
});

test("conexões priorizam mesmo artista e depois o estilo", () => {
  const connections = buildSongConnections(catalog, { limit: 4, genres });
  assert.deepEqual(connections["201"], ["203", "202", "205"]);
  // Queen só tem a si no estilo/idioma deste fixture — sem arestas.
  assert.equal(connections["204"], undefined);
  assert.equal(relatedCodesFor(connections, "201", { limit: 2 }).length, 2);
});

test("fila de descoberta intercala relacionadas offline", () => {
  const connections = buildSongConnections(catalog, { limit: 8, genres });
  const queue = buildDiscoveryQueue(
    catalog,
    { artists: ["Queen"], genreArtists: ["Queen"] },
    [],
    [],
    { connections, seedCodes: ["201"] },
  );
  assert.equal(queue[0].code, "204");
  assert.ok(queue.some((song) => song.source === "Relacionada" && ["202", "203", "205"].includes(song.code)));
});

test("relatedSongsFromConnections ranqueia por sementes", () => {
  const connections = { 201: ["203", "202"], 204: ["205"] };
  const related = relatedSongsFromConnections(catalog, connections, ["201"], { limit: 5 });
  assert.deepEqual(related.map((song) => song.code), ["203", "202"]);
});
