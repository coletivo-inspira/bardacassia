import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { metricCards, nightLabel } from "../src/lib/metrics.js";
import { filterTopSongs, funnelRows, localManagerSnapshot, periodHasActivity, saoPauloISODate, shiftISODate } from "../src/lib/manager-board.js";

const NOW = new Date("2026-11-11T15:00:00Z");

test("saoPauloISODate usa o calendário de Brasília", () => {
  assert.equal(saoPauloISODate(NOW), "2026-11-11");
  assert.equal(shiftISODate("2026-11-11", -1), "2026-11-10");
  assert.equal(shiftISODate("ruim", 1), "");
});

test("exemplo local com movimento fecha a conta do período", () => {
  const snap = localManagerSnapshot("30d", { now: NOW });
  assert.equal(snap.source, "local");
  assert.equal(snap.variant, "cheio");
  assert.equal(snap.metrics.by_night.at(-1).night, "2026-11-11");
  assert.equal(snap.metrics.by_night[0].night, "2026-10-13");
  const total = snap.metrics.by_night.reduce((sum, night) => sum + night.requests, 0);
  assert.equal(snap.metrics.requests, total);
  assert.ok(total > 0);
  assert.equal(snap.metrics.by_staff.reduce((sum, person) => sum + person.requests, 0), total);
  assert.ok(snap.metrics.top_songs.every((song) => song.requests > 0));
  assert.ok(snap.metrics.top_songs.reduce((sum, song) => sum + song.requests, 0) <= total);
  assert.equal(snap.metrics.by_weekday.reduce((sum, day) => sum + day.requests, 0), total);
  assert.equal(nightLabel(snap.metrics.by_night.at(-1).night), "qua 11/11");
  assert.equal(metricCards(snap.metrics).length, 6);
  assert.equal(snap.floor.queue_open, true);
  assert.equal(snap.floor.queue.length, 3);
  assert.ok(periodHasActivity(snap.metrics));
  assert.ok(funnelRows(snap.metrics).length > 0);
});

test("90 dias tem mais pedidos que 7 dias e o período desconhecido cai em 30", () => {
  const week = localManagerSnapshot("7d", { now: NOW });
  const quarter = localManagerSnapshot("90d", { now: NOW });
  const fallback = localManagerSnapshot("ano", { now: NOW });
  assert.equal(week.metrics.by_night.length, 7);
  assert.equal(quarter.metrics.by_night.length, 90);
  assert.ok(quarter.metrics.requests > week.metrics.requests);
  assert.equal(fallback.rangeId, "30d");
});

test("exemplo sem pedidos esvazia fila, gráficos e funil", () => {
  const snap = localManagerSnapshot("30d", { variant: "vazio", now: NOW });
  assert.equal(snap.variant, "vazio");
  assert.equal(snap.metrics.requests, 0);
  assert.equal(snap.metrics.avg_wait_minutes, null);
  assert.deepEqual(snap.metrics.by_night, []);
  assert.deepEqual(snap.metrics.top_songs, []);
  assert.equal(snap.floor.queue_open, false);
  assert.deepEqual(snap.floor.queue, []);
  assert.equal(snap.floor.night.code, "");
  assert.equal(periodHasActivity(snap.metrics), false);
  assert.deepEqual(funnelRows(snap.metrics), []);
  assert.equal(metricCards(snap.metrics).find((card) => card.id === "per-night").value, "—");
});

test("filtro de músicas ignora acento e código", () => {
  const songs = localManagerSnapshot("7d", { now: NOW }).metrics.top_songs;
  assert.ok(filterTopSongs(songs, "sao").some((song) => song.code === "6549"));
  assert.ok(filterTopSongs(songs, "4574").some((song) => song.title.includes("DANCING")));
  assert.deepEqual(filterTopSongs(songs, "zzzz"), []);
  assert.equal(filterTopSongs(songs, "  ").length, songs.length);
});

test("gerente.html é o painel em português, sem marca d'água", () => {
  const html = readFileSync(new URL("../gerente.html", import.meta.url), "utf8");
  assert.match(html, /lang="pt-BR"/);
  assert.match(html, /Painel do gerente/);
  assert.match(html, /noindex, nofollow/);
  assert.match(html, /src="\/src\/gerente\.js"/);
  assert.match(html, /id="variant-vazio"/);
  assert.match(html, /id="song-search"/);
  assert.doesNotMatch(html, /watermark|getty|shutterstock/i);
  const vite = readFileSync(new URL("../vite.config.js", import.meta.url), "utf8");
  assert.match(vite, /gerente\.html/);
});
