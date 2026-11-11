import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("conta.html is a dedicated account page with landmarks and menu shell", () => {
  const html = read("conta.html");
  assert.match(html, /<title>Conta — Bar da Cácia<\/title>/);
  assert.match(html, /<main id="conteudo" class="account-main">/);
  assert.match(html, /aria-labelledby="account-title"/);
  assert.match(html, /<nav class="account-menu-panel" aria-label="Opções da conta">/);
  assert.match(html, /data-account-menu/);
  assert.match(html, /<script type="module" src="\/src\/conta-page\.js"><\/script>/);
  assert.match(html, /class="mobile-tabbar glass-island"/);
});

test("conta-page.js wires existing account actions without inventing auth", () => {
  const js = read("src/conta-page.js");
  assert.match(js, /favoritos\.html/);
  assert.match(js, /login\.html#conta/);
  assert.match(js, /data-theme-toggle/);
  assert.match(js, /signOut/);
  assert.match(js, /initializeAccountMenu/);
  assert.doesNotMatch(js, /createUser|signUp\(|password/);
});

test("island Conta control navigates to conta.html instead of a menu", () => {
  const site = read("src/site.js");
  assert.match(site, /function renderIslandAccountLink/);
  assert.match(site, /href="conta\.html"/);
  assert.doesNotMatch(site, /island-account-menu/);
});

test("vite build includes conta.html", () => {
  const vite = read("vite.config.js");
  assert.match(vite, /conta: resolve\(__dirname, "conta\.html"\)/);
});
