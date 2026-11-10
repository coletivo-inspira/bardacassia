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

test("catalog and favorites page share one song-row module", () => {
  for (const file of ["src/main.js", "src/favorites-page.js"]) {
    const source = read(file);
    assert.match(source, /from "\.\/lib\/song-row\.js"/, file);
    assert.doesNotMatch(source, /function createSongRow\(/, file);
  }
  assert.doesNotMatch(read("src/main.js"), /openFavoritesScreen|favoritesTabView/);
});
