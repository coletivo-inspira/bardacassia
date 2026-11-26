import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EVENT_EXPIRES, eventActive, isBeforeExpiry } from "../src/lib/event.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("isBeforeExpiry compares the local day with the expiry date", () => {
  assert.equal(isBeforeExpiry("", new Date(2030, 0, 1)), true);
  assert.equal(isBeforeExpiry("2026-11-01", new Date(2026, 9, 31, 23, 59)), true);
  assert.equal(isBeforeExpiry("2026-11-01", new Date(2026, 10, 1, 0, 0)), false);
  assert.equal(isBeforeExpiry("2026-11-01", new Date(2026, 10, 22)), false);
});

test("eventActive follows EVENT_EXPIRES", () => {
  const [y, m, d] = EVENT_EXPIRES.split("-").map(Number);
  assert.equal(eventActive(new Date(y, m - 1, d - 1)), true);
  assert.equal(eventActive(new Date(y, m - 1, d)), false);
});

test("the conta admin Evento row is hidden once the event has expired", () => {
  const conta = read("src/conta-page.js");
  assert.match(conta, /import \{ eventActive \} from "\.\/lib\/event\.js";/);
  assert.match(conta, /isAdmin && showPageFile\(features, "evento\.html"\) && eventActive\(\)/);
});

test("evento.js redirects with the same expiry the menus use", () => {
  const evento = read("src/evento.js");
  assert.match(evento, /if \(!eventActive\(\)\)/);
  assert.doesNotMatch(evento, /const EVENT_EXPIRES/);
  for (const page of ["index.html", "login.html", "conta.html", "favoritos.html", "o-bar.html", "evento.html"]) {
    for (const [, date] of read(page).matchAll(/data-expires="([^"]+)"/g)) {
      assert.equal(date, EVENT_EXPIRES, `${page} data-expires matches EVENT_EXPIRES`);
    }
  }
});
