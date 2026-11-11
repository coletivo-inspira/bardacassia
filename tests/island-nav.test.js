import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ISLAND_PAGES = {
  "index.html": { inicio: "#inicio", buscar: "#buscar" },
  "evento.html": { inicio: "index.html#inicio", buscar: "index.html#buscar" },
  "o-bar.html": { inicio: "index.html#inicio", buscar: "index.html#buscar" },
  "favoritos.html": { inicio: "index.html#inicio", buscar: "index.html#buscar" },
  "conta.html": { inicio: "index.html#inicio", buscar: "index.html#buscar" },
};

function islandOf(page) {
  const html = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
  return { html, island: html.match(/<nav class="mobile-tabbar glass-island"[^>]*>([\s\S]*?)<\/nav>/)?.[1] };
}

for (const [page, hrefs] of Object.entries(ISLAND_PAGES)) {
  test(`${page} has the floating island with Início, Buscar and Conta`, () => {
    const { island } = islandOf(page);
    assert.ok(island, "glass island not found");
    const tabs = [...island.matchAll(/data-mobile-tab="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(tabs, ["inicio", "buscar", "conta"]);
    assert.match(island, new RegExp(`href="${hrefs.inicio}" data-mobile-tab="inicio" aria-label="Início"`));
    assert.match(island, new RegExp(`href="${hrefs.buscar}" data-mobile-tab="buscar" aria-label="Buscar"`));
    assert.doesNotMatch(island, /data-mobile-tab="o-bar"/);
    // Conta opens the dedicated account page instead of a dropdown menu.
    assert.match(island, /<a class="mobile-tab island-account-trigger" href="conta\.html" aria-label="Conta"/);
    assert.doesNotMatch(island, /aria-haspopup="menu"/);
    assert.match(island, /class="glass-island-capsule" aria-hidden="true"/);
    assert.match(island, /class="mobile-tab-label">Início</);
    assert.match(island, /class="mobile-tab-label">Buscar</);
    assert.match(island, /class="mobile-tab-label">Conta</);
  });

  // The orb embed script styles a.inspira-orb as a sibling after the island.
  test(`${page} places the island after the footer and before the orb script`, () => {
    const { html } = islandOf(page);
    const footer = html.indexOf("</footer>");
    const island = html.indexOf('<nav class="mobile-tabbar glass-island"');
    const orb = html.indexOf("inspira-orb.js");
    assert.ok(footer < island && island < orb);
  });
}

for (const page of ["login.html", "garcom.html", "gerente.html", "cartaz.html", "public/404.html"]) {
  test(`${page} has no island`, () => {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
    assert.doesNotMatch(html, /glass-island/);
  });
}

test("favoritos.html, conta.html and o-bar.html mark Conta in the island without claiming a text tab", () => {
  const site = readFileSync(new URL("../src/site.js", import.meta.url), "utf8");
  assert.match(site, /const ISLAND_PAGE_TABS = \{[^}]*"o-bar": "conta"[^}]*favoritos: "conta"[^}]*conta: "conta"[^}]*\}/);
});

test("active island tabs reveal their label in CSS", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.glass-island :is\(\.mobile-tab\.is-active, \.mobile-tab-account\.is-active \.mobile-tab\) \.mobile-tab-label/);
});
