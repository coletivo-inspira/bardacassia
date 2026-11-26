import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPersona, musicSuggestions, personaLabel, rankedTracks, scoreArtists,
  styleForSpotifyGenre, stylesForArtist, hasListeningData,
} from "../src/lib/music-persona.js";
import { artistMatchKey, matchSpotifyTracks } from "../src/lib/catalog.js";

const catalog = [
  { code: "1", artist: "Marília Mendonça", title: "INFIEL" },
  { code: "2", artist: "Marília Mendonça", title: "TODO MUNDO VAI SOFRER" },
  { code: "3", artist: "Marília Mendonça", title: "SUPERA" },
  { code: "4", artist: "Marília Mendonça", title: "AMANTE NÃO TEM LAR" },
  { code: "5", artist: "Djavan", title: "OCEANO" },
  { code: "6", artist: "Beatles (The)", title: "HEY JUDE" },
  { code: "7", artist: "Bruno e Marrone", title: "DORMI NA PRAÇA" },
  { code: "8", artist: "Jorge e Mateus", title: "FLORES EM VIDA" },
];

const track = (id, name, artist) => ({ id, name, artists: [{ id: `a-${artist}`, name: artist }] });

const profile = {
  top_tracks: {
    long_term: [track("t1", "Infiel", "Marília Mendonça"), track("t2", "Oceano", "Djavan")],
    medium_term: [track("t2", "Oceano", "Djavan"), track("t1", "Infiel", "Marília Mendonça")],
    short_term: [track("t3", "Hey Jude - Remastered 2015", "The Beatles")],
  },
  top_artists: {
    long_term: [
      { id: "a1", name: "Marília Mendonça", genres: ["sertanejo", "sertanejo universitario"] },
      { id: "a2", name: "Djavan", genres: ["mpb"] },
      { id: "a3", name: "Bruno & Marrone", genres: [] },
    ],
    medium_term: [{ id: "a1", name: "Marília Mendonça", genres: ["sertanejo"] }],
    short_term: [],
  },
  recent_tracks: [track("t9", "Música fora do catálogo", "Alguém")],
};

test("artistMatchKey aproxima 'Beatles (The)' de 'The Beatles' e '&' de 'e'", () => {
  assert.equal(artistMatchKey("Beatles (The)"), artistMatchKey("The Beatles"));
  assert.equal(artistMatchKey("Bruno & Marrone"), artistMatchKey("Bruno e Marrone"));
});

test("matchSpotifyTracks aceita artista com artigo invertido", () => {
  const matched = matchSpotifyTracks(catalog, [track("x", "Hey Jude", "The Beatles")]);
  assert.deepEqual(matched.map((song) => song.code), ["6"]);
});

test("gêneros do Spotify viram estilos curados", () => {
  assert.equal(styleForSpotifyGenre("sertanejo universitario"), "sertanejo");
  assert.equal(styleForSpotifyGenre("funk carioca"), "funk");
  assert.equal(styleForSpotifyGenre("pop rock brasileiro"), "rock-nacional");
  assert.equal(styleForSpotifyGenre("album rock"), "rock-internacional");
  assert.equal(styleForSpotifyGenre("forró"), "forro-axe");
  assert.equal(styleForSpotifyGenre("dance pop"), "pop");
  assert.equal(styleForSpotifyGenre("vaporwave"), null);
});

test("estilo do artista vem primeiro da curadoria e depois dos gêneros", () => {
  assert.deepEqual(stylesForArtist({ name: "Djavan", genres: ["rock"] }), ["mpb"]);
  assert.deepEqual(stylesForArtist({ name: "Desconhecido", genres: ["brazilian gospel"] }), ["gospel"]);
  assert.deepEqual(stylesForArtist({ name: "Desconhecido", genres: [] }), []);
});

test("artistas mais ouvidos no ano e em vários períodos pontuam mais", () => {
  const [first, second] = scoreArtists(profile);
  assert.equal(first.name, "Marília Mendonça");
  assert.equal(second.name, "Djavan");
});

test("faixas repetidas entre períodos aparecem uma vez", () => {
  const ids = rankedTracks(profile).map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids[0], "t1");
});

test("persona resume estilos dominantes com rótulo", () => {
  const persona = buildPersona(profile, catalog);
  assert.equal(persona.topGenres[0].id, "sertanejo");
  assert.ok(persona.topGenres.some((genre) => genre.id === "mpb"));
  const shares = persona.topGenres.reduce((sum, genre) => sum + genre.share, 0);
  assert.ok(shares <= 1.0001);
  assert.equal(persona.topArtists[0].catalogName, "Marília Mendonça");
  assert.match(persona.label, /sertanejo/i);
});

test("rótulo da persona", () => {
  assert.equal(personaLabel([]), "Gosto eclético");
  assert.equal(personaLabel([{ label: "Sertanejo", share: 0.7 }]), "Coração sertanejo");
  assert.equal(personaLabel([{ label: "Sertanejo", share: 0.5 }, { label: "MPB", share: 0.3 }]), "Sertanejo com pitada de MPB");
});

test("sugestões: ouvidas, depois mais do artista, depois estilo, sem repetir", () => {
  const items = musicSuggestions(catalog, profile, { perArtist: 2 });
  const codes = items.map((item) => item.song.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.deepEqual(codes.slice(0, 3), ["1", "5", "6"]);
  assert.equal(items[0].reason, "Você ouve muito");
  const artistItems = items.filter((item) => item.kind === "artist");
  assert.deepEqual(artistItems.slice(0, 2).map((item) => item.song.code), ["2", "3"]);
  assert.equal(artistItems[0].reason, "Você ouve Marília Mendonça");
  assert.ok(artistItems.some((item) => item.song.code === "7"));
  const styleItems = items.filter((item) => item.kind === "style");
  assert.ok(styleItems.some((item) => item.song.code === "8" && item.reason === "Seu estilo: Sertanejo"));
});

test("sugestões respeitam limite e códigos excluídos", () => {
  const items = musicSuggestions(catalog, profile, { limit: 2, excludeCodes: ["1"] });
  assert.equal(items.length, 2);
  assert.ok(!items.some((item) => item.song.code === "1"));
});

test("perfil vazio não quebra", () => {
  assert.equal(hasListeningData({}), false);
  assert.equal(hasListeningData(profile), true);
  assert.deepEqual(musicSuggestions(catalog, {}), []);
  assert.equal(buildPersona({}, catalog).label, "Gosto eclético");
});
