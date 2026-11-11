import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("index.html sends old #favoritas links to favoritos.html before the app loads", () => {
  const html = read("index.html");
  const redirect = html.indexOf('location.hash.toLowerCase().startsWith("#favoritas")');
  assert.ok(redirect > 0 && redirect < html.indexOf("</head>"));
  assert.match(html, /location\.replace\("favoritos\.html"\)/);
  assert.doesNotMatch(html, /id="favoritas-intro"|id="favorite-tabs"/);
  assert.match(html, /id="show-favorites" class="discovery-button" href="favoritos\.html"/);
  assert.match(html, /id="filter-favorites" type="checkbox" \/> Somente favoritas/);
});

test("favoritos.html has the tabs, the song list and its own script", () => {
  const html = read("favoritos.html");
  assert.match(html, /<h1 id="favoritos-title">Meus favoritos<\/h1>/);
  assert.match(html, /id="favorite-tab-list"/);
  assert.match(html, /id="songs-list" class="songs-list" role="list"/);
  assert.match(html, /Você ainda não favoritou nenhuma música\./);
  assert.match(html, /<script type="module" src="\/src\/favorites-page\.js"><\/script>/);
  assert.match(read("vite.config.js"), /favoritos: resolve\(__dirname, "favoritos\.html"\)/);
});

test("tab names use an inline form, not window.prompt (ignored by embedded browsers)", () => {
  const html = read("favoritos.html");
  assert.match(html, /<form id="favorite-tab-form"[^>]*hidden>/);
  assert.match(html, /<input id="favorite-tab-name"[^>]*maxlength="40"[^>]*required/);
  assert.match(html, /id="favorite-tab-submit"[^>]*type="submit"/);
  const page = read("src/favorites-page.js");
  assert.doesNotMatch(page, /window\.prompt/);
  assert.match(page, /els\.newTab\.addEventListener\("click", \(\) => openTabForm\(\{ mode: "new" \}\)\)/);
  assert.match(page, /onNewTab: \(target\) => openTabForm\(\{ mode: "move", code: target\.code \}\)/);
});

test("Limpar aba keeps favorites and is disabled on Rascunho", () => {
  const page = read("src/favorites-page.js");
  assert.match(page, /els\.clearTab\.disabled = !canClearTab\(favoritesState, current\.id\)/);
  assert.match(page, /continuam nas suas favoritas/);
  const clearHandler = page.slice(page.indexOf("function confirmClearTab"), page.indexOf("function stopPreview"));
  assert.doesNotMatch(clearHandler, /setSongFavorite/);
});

test("catalog and favorites page share one song-row module", () => {
  for (const file of ["src/main.js", "src/favorites-page.js"]) {
    const source = read(file);
    assert.match(source, /from "\.\/lib\/song-row\.js"/, file);
    assert.doesNotMatch(source, /function createSongRow\(/, file);
  }
  assert.doesNotMatch(read("src/main.js"), /openFavoritesScreen|favoritesTabView/);
});
