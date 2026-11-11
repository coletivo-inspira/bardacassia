import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const html = read("index.html");
const css = read("src/styles.css");
const site = read("src/site.js");
const header = html.match(/<header class="site-header">([\s\S]*?)<\/header>/)?.[1] || "";

test("catalog top bar puts the search and Filtros beside the logo", () => {
  const brand = header.indexOf('class="brand"');
  const search = header.indexOf('class="spotify-search-chrome header-search"');
  const nav = header.indexOf('class="desktop-nav"');
  assert.ok(brand >= 0 && brand < search && search < nav, "logo, then search, then desktop nav");
  for (const id of ["song-search", "toggle-filters", "clear-search", "catalog-filters", "filter-language", "filter-artist", "filter-favorites", "clear-filters"]) {
    assert.match(header, new RegExp(`id="${id}"`), `${id} lives in the top bar`);
  }
  assert.match(header, /<label class="visually-hidden" for="song-search">/);
});

test("the #buscar section keeps guidance and results but no second search box", () => {
  const section = html.match(/<section class="search-portal" id="buscar"[\s\S]*?<\/section>\n\n    <\/main>/)?.[0] || "";
  assert.ok(section, "search section not found");
  assert.doesNotMatch(section, /spotify-search-chrome|id="song-search"/);
  assert.match(section, /id="search-guidance"/);
  assert.match(section, /id="songs-list"/);
});

test("hero no longer has the Escolher música button or its CSS", () => {
  assert.doesNotMatch(html, /hero-cta/);
  assert.doesNotMatch(html, /Escolher música/);
  assert.doesNotMatch(css, /\.hero-cta/);
  assert.match(css, /\.button-light \{/, "button-light is still used by dialogs and other pages");
});

test("top bar shares the island's compact-on-scroll state", () => {
  const watcher = site.match(/function watchIslandCompact[\s\S]*?\n}\n/)?.[0] || "";
  assert.match(site, /querySelector\("\.header-search"\)\?\.closest\("\.site-header"\)/);
  assert.match(watcher, /companions\.forEach\(\(el\) => el\.classList\.toggle\("is-compact", compact\)\)/);
  assert.match(watcher, /const nextCompact = delta > 0 && y > 48 && !reducedMotion\.matches;/, "compact only while scrolling down, never with reduced motion");
  assert.equal(watcher.match(/island\.classList\.(remove|toggle)\("is-compact"/g)?.length, 1, "only setCompact flips the island, so the bar follows");
});

test("compact bar shrinks logo and search without reflowing the page", () => {
  assert.match(css, /\.site-header\.is-compact:has\(\.header-search\):not\(:has\(#song-search:focus, \.is-filters-open\)\) \{[^}]*--bar-brand: 36px/);
  assert.match(css, /margin-bottom: calc\(var\(--header-h\) - var\(--bar-h\)\);/);
  const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{\n  body \.site-header:has\(\.header-search\),[\s\S]*?\}/)?.[0];
  assert.ok(reduced, "reduced motion drops the bar transitions");
  assert.match(reduced, /transition: none/);
});

test("filters open as a dropdown under the top bar", () => {
  assert.match(css, /\.site-header \.header-search \.catalog-filters \{\n  position: absolute;\n  top: calc\(100% \+ 10px\);/);
});

test("island Conta tab gives the avatar more room than the icon tabs", () => {
  assert.match(css, /\.glass-island \.island-account-trigger \{ gap: 0\.55rem;/);
  assert.match(css, /\.glass-island\.is-compact \.island-account-trigger \{ gap: 0\.45rem; \}/);
});
