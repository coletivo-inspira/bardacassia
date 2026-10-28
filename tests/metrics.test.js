import test from "node:test";
import assert from "node:assert/strict";
import { barRows, formatMinutes, metricCards, metricsRange, nightLabel, weekdayLabel } from "../src/lib/metrics.js";

test("metricsRange volta o número de dias pedido", () => {
  const now = new Date("2026-10-28T22:00:00Z");
  assert.equal(metricsRange("7d", now).from.toISOString(), "2026-10-21T22:00:00.000Z");
  assert.equal(metricsRange("desconhecido", now).from.toISOString(), "2026-09-28T22:00:00.000Z");
});

test("formatMinutes mostra minutos e horas", () => {
  assert.equal(formatMinutes(12.4), "12 min");
  assert.equal(formatMinutes(75), "1h15");
  assert.equal(formatMinutes(120), "2h");
  assert.equal(formatMinutes(null), "—");
});

test("nightLabel e weekdayLabel em português", () => {
  assert.equal(nightLabel("2026-10-28"), "qua 28/10");
  assert.equal(nightLabel("x"), "");
  assert.equal(weekdayLabel(1), "Segunda");
});

test("barRows calcula a largura relativa ao maior valor", () => {
  const rows = barRows([{ label: "a", requests: 10 }, { label: "b", requests: 5 }, { label: "c", requests: 0 }]);
  assert.deepEqual(rows.map((row) => row.percent), [100, 50, 0]);
  assert.deepEqual(barRows([]), []);
});

test("metricCards resume os números principais", () => {
  const cards = metricCards({ requests: 42, nights: 3, customers: 30, avg_wait_minutes: 18, visitors: 120, accounts_total: 15, accounts_new: 4 });
  const byId = Object.fromEntries(cards.map((card) => [card.id, card.value]));
  assert.equal(byId["per-night"], "14");
  assert.equal(byId.wait, "18 min");
  assert.equal(byId.accounts, "15 (+4)");
  assert.equal(metricCards({ requests: 0, nights: 0 }).find((card) => card.id === "per-night").value, "—");
  assert.deepEqual(metricCards(null), []);
});
