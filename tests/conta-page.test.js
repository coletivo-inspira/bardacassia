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
  assert.match(html, /href="o-bar\.html"/);
  assert.match(html, /<strong>O bar<\/strong>/);
  assert.match(html, /<script type="module" src="\/src\/conta-page\.js"><\/script>/);
  assert.match(html, /class="mobile-tabbar glass-island"/);
});

test("conta hero is expandable with accessible toggle and details panel", () => {
  const html = read("conta.html");
  assert.match(html, /data-account-hero-toggle/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-controls="account-details"/);
  assert.match(html, /id="account-details"[^>]*data-account-details/);
  assert.match(html, /account-hero-chevron/);
  const header = html.match(/<header class="site-header">([\s\S]*?)<\/header>/)?.[1];
  assert.ok(header);
  assert.doesNotMatch(header, /id="theme-toggle"/);
});

test("conta-page.js wires existing account actions without inventing auth", () => {
  const js = read("src/conta-page.js");
  assert.match(js, /favoritos\.html/);
  assert.match(js, /login\.html#conta/);
  assert.match(js, /o-bar\.html/);
  assert.match(js, /title: "O bar"/);
  assert.match(js, /data-theme-toggle/);
  assert.match(js, /signOut/);
  assert.match(js, /initializeAccountMenu/);
  assert.doesNotMatch(js, /createUser|signUp\(|password/);
});

test("conta-page.js builds role menus from existing routes and real profile fields", () => {
  const js = read("src/conta-page.js");
  assert.match(js, /getMyRole/);
  assert.match(js, /getMyPhone/);
  assert.match(js, /getMyProfile/);
  assert.match(js, /birth_date/);
  assert.match(js, /admin\.html/);
  assert.match(js, /gerente\.html/);
  assert.match(js, /garcom\.html/);
  assert.match(js, /cartaz\.html/);
  assert.match(js, /Painel do administrador/);
  assert.match(js, /Painel do gerente/);
  assert.match(js, /Painel do garçom/);
  assert.match(js, /role === "admin"/);
  assert.match(js, /role === "garcom"/);
  assert.doesNotMatch(js, /painel-de-ativos|ativos\.html|ltp/i);
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
