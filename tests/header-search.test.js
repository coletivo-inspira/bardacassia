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

test("the #buscar section opens with the catalog, count and artist hint", () => {
  const section = html.match(/<section class="search-portal" id="buscar"[\s\S]*?<\/section>\n\n    <\/main>/)?.[0] || "";
  assert.ok(section, "search section not found");
  assert.doesNotMatch(section, /spotify-search-chrome|id="song-search"/);
  assert.doesNotMatch(section, /Buscar música|No catálogo do karaokê|Digite o nome da música|search-guidance/);
  assert.match(section, /aria-labelledby="catalog-title"/);
  const order = ['id="catalog-title"', 'id="results-count"', 'class="search-help"', 'id="category-grid"', 'id="songs-list"'].map((needle) => section.indexOf(needle));
  assert.ok(order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1])), `section order ${order}`);
  assert.doesNotMatch(html, /aria-describedby="search-guidance"/);
});

test("idle search shows no example chips; typed queries open the list", () => {
  const main = read("src/main.js");
  assert.doesNotMatch(main, /Experimente buscar/);
  assert.match(main, /if \(songs\.length && q\) \{/);
  assert.match(main, /setSuggestionsOpen\(document\.activeElement === els\.searchInput && Boolean\(q\)\);/);
  assert.match(main, /els\.catalogTitle\.hidden = !browse;/);
});

test("suggestions are a listbox under the top-bar field, not chips in the catalog", () => {
  const chrome = header.match(/<div class="spotify-search-chrome header-search">[\s\S]*?<nav class="desktop-nav"/)?.[0] || "";
  assert.match(chrome, /<div id="search-suggestions" class="search-suggest" role="listbox" aria-label="Sugestões de busca" hidden><\/div>/);
  const section = html.match(/<section class="search-portal" id="buscar"[\s\S]*?<\/section>/)?.[0] || "";
  assert.doesNotMatch(section, /search-suggestions/);
  assert.match(section, /id="results-count"/, "the result count stays in the catalog");
  const input = header.match(/<input\s+id="song-search"[\s\S]*?\/>/)?.[0] || "";
  for (const attr of ['role="combobox"', 'aria-autocomplete="list"', 'aria-controls="search-suggestions"', 'aria-expanded="false"']) {
    assert.ok(input.includes(attr), `input has ${attr}`);
  }
});

test("suggestion list keyboard, close rules and Filtros exclusivity", () => {
  const main = read("src/main.js");
  const keydown = main.match(/els\.searchInput\.addEventListener\("keydown"[\s\S]*?\n\}\);/)?.[0] || "";
  assert.match(keydown, /"ArrowDown"/);
  assert.match(keydown, /"ArrowUp"/);
  assert.match(keydown, /event\.key === "Enter"[\s\S]*pickSuggestion\(suggestionOptions\(\)\[suggestIndex\]\)/);
  assert.match(keydown, /event\.key === "Escape" && open[\s\S]*event\.preventDefault\(\);[\s\S]*closeSuggestions\(\);/);
  assert.match(main, /els\.searchInput\.setAttribute\("aria-activedescendant", active\.id\)/);
  assert.match(main, /document\.addEventListener\("pointerdown"[\s\S]{0,120}closeSuggestions\(\)/, "outside tap closes");
  assert.match(main, /function pickSuggestion[\s\S]*?closeSuggestions\(\);[\s\S]*?pick\(\);/, "picking closes first");
  assert.match(main, /function setFiltersPanelOpen\(open\) \{\n  if \(open\) closeSuggestions\(\);/, "Filtros closes suggestions");
  assert.match(main, /function setSuggestionsOpen[\s\S]*?if \(show\) setFiltersPanelOpen\(false\);/, "suggestions close Filtros");
  assert.match(main, /hint\.textContent = "Tente menos palavras, confira o nome ou remova um filtro\.";/);
  assert.match(main, /window\.visualViewport\?\.addEventListener\("resize", fitSuggestions\)/, "fits above the on-screen keyboard");
});

test("suggestion panel is anchored to the pill and respects reduced motion", () => {
  assert.match(css, /\.site-header \.header-search \.search-suggest \{\n  position: absolute;\n  top: calc\(100% \+ 8px\);\n  left: 0;\n  right: 0;/);
  assert.match(css, /:root\[data-theme="light"\] \.site-header \.header-search \.search-suggest \{ background: var\(--paper\); \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n  \.site-header \.header-search \.search-suggest \{ animation: none; \}/);
  assert.doesNotMatch(css, /\.search-suggestions \{/);
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
