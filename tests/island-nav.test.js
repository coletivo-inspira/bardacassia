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

  // `.site-footer:has(~ .glass-island)` pads the footer clear of the dock.
  test(`${page} places the island after the footer`, () => {
    const { html } = islandOf(page);
    const footer = html.indexOf("</footer>");
    const island = html.indexOf('<nav class="mobile-tabbar glass-island"');
    assert.ok(footer > 0 && footer < island);
  });
}

test("Match shrinks and grows back with the compact island", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const compact = css.match(/body:has\(> \.glass-island\.is-compact\) \.discover-fab \{([^}]*)\}/)?.[1];
  assert.ok(compact, "compact Match rule not found");
  assert.match(compact, /height: 52px;/);
  assert.match(css, /\.glass-island\.is-compact \{\s*--island-h: 52px;/);
  assert.match(css, /body:has\(> \.glass-island\) \.discover-fab \{[^}]*height 220ms/);
});

test("the island starts at the left edge now that the orb left the dock", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /body:has\(> \.glass-island\):has\(\.discover-fab\) \.mobile-tabbar\.glass-island \{\s*left: var\(--dock-side\);/);
});

for (const page of ["login.html", "garcom.html", "gerente.html", "cartaz.html", "admin.html", "public/404.html"]) {
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
