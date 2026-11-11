import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function fakeToggle({ id = "", dataThemeToggle = false } = {}) {
  const attributes = new Map();
  const listeners = [];
  const label = { textContent: "" };
  return {
    id,
    dataset: {},
    label,
    listeners,
    attributes,
    querySelector: (selector) => (selector === ".theme-toggle-label" ? label : null),
    matches: (selector) => selector.split(",").some((part) => {
      const s = part.trim();
      return (s === `#${id}` && Boolean(id)) || (s === "[data-theme-toggle]" && dataThemeToggle);
    }),
    setAttribute: (name, value) => attributes.set(name, String(value)),
    getAttribute: (name) => attributes.get(name) ?? null,
    addEventListener: (type, listener) => { if (type === "click") listeners.push(listener); },
    click() { listeners.forEach((listener) => listener({ type: "click", target: this })); },
  };
}

function installFakeDom({ theme = "light", saved = null } = {}) {
  const toggles = [];
  const storage = new Map(saved ? [["bdc-theme-v1", saved]] : []);
  const meta = { content: "" };
  globalThis.document = {
    documentElement: { dataset: { theme } },
    querySelectorAll: (selector) => toggles.filter((toggle) => toggle.matches(selector)),
    querySelector: (selector) => (selector === 'meta[name="theme-color"]' ? meta : null),
  };
  globalThis.window = {
    matchMedia: () => ({ matches: false, addEventListener() {} }),
  };
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
  };
  globalThis.getComputedStyle = (node) => ({
    getPropertyValue: (name) => (name === "--bg" ? (node.dataset.theme === "light" ? "#f7f1e1" : "#1a2218") : ""),
  });
  return {
    storage,
    meta,
    add(toggle) { toggles.push(toggle); return toggle; },
    theme: () => globalThis.document.documentElement.dataset.theme,
  };
}

let instance = 0;
const freshThemeModule = () => import(`../src/lib/theme.js?instance=${++instance}`);

test("account-menu theme item flips the theme once per tap after repeated initializeTheme calls", async () => {
  const dom = installFakeDom({ theme: "light" });
  const { initializeTheme } = await freshThemeModule();
  const header = dom.add(fakeToggle({ id: "theme-toggle" }));
  initializeTheme();

  // renderSignedIn adds the menu item later and calls initializeTheme again; so can other pages.
  const menuItem = dom.add(fakeToggle({ dataThemeToggle: true }));
  menuItem.dataset.themeBound = "1";
  initializeTheme();
  initializeTheme();

  assert.equal(menuItem.listeners.length, 1);
  assert.equal(header.listeners.length, 1);
  assert.equal(menuItem.getAttribute("aria-pressed"), "false");
  assert.equal(menuItem.getAttribute("aria-label"), "Ativar modo noturno");
  assert.equal(menuItem.label.textContent, "Modo noturno");

  menuItem.click();
  assert.equal(dom.theme(), "dark");
  assert.equal(dom.storage.get("bdc-theme-v1"), "dark");
  assert.equal(menuItem.getAttribute("aria-pressed"), "true");
  assert.equal(menuItem.getAttribute("aria-label"), "Ativar tema claro");
  assert.equal(menuItem.label.textContent, "Modo claro");
  assert.equal(header.label.textContent, "Modo claro");
  assert.equal(dom.meta.content, "#1a2218");

  menuItem.click();
  assert.equal(dom.theme(), "light");
  assert.equal(dom.storage.get("bdc-theme-v1"), "light");
  assert.equal(menuItem.getAttribute("aria-pressed"), "false");
  assert.equal(menuItem.label.textContent, "Modo noturno");

  header.click();
  assert.equal(dom.theme(), "dark");
  assert.equal(menuItem.getAttribute("aria-pressed"), "true");
  assert.equal(header.getAttribute("aria-pressed"), null);
});

test("saved theme wins over the page default on first initialization", async () => {
  const dom = installFakeDom({ theme: "dark", saved: "light" });
  const { initializeTheme } = await freshThemeModule();
  const menuItem = dom.add(fakeToggle({ dataThemeToggle: true }));
  initializeTheme();
  assert.equal(dom.theme(), "light");
  assert.equal(menuItem.getAttribute("aria-pressed"), "false");
});

test("applyDefaultTheme applies remote default_theme only when bdc-theme-v1 is not saved", async () => {
  const domNoSaved = installFakeDom({ theme: "dark" });
  const mod1 = await freshThemeModule();
  mod1.initializeTheme();
  mod1.applyDefaultTheme("light");
  assert.equal(domNoSaved.theme(), "light");
  assert.equal(domNoSaved.storage.get("bdc-theme-v1"), undefined);

  const domSaved = installFakeDom({ theme: "dark", saved: "dark" });
  const mod2 = await freshThemeModule();
  mod2.initializeTheme();
  mod2.applyDefaultTheme("light");
  assert.equal(domSaved.theme(), "dark");
  assert.equal(domSaved.storage.get("bdc-theme-v1"), "dark");
});

test("account links leave theme toggling to initializeTheme", () => {
  const site = readFileSync(new URL("../src/site.js", import.meta.url), "utf8");
  assert.doesNotMatch(site, /toggleTheme\(/, "a second click handler on [data-theme-toggle] cancels the first");
  assert.doesNotMatch(site, /<button[^>]*data-theme-toggle/, "the theme toggle lives on conta.html, not in the header");
});

for (const page of ["index.html", "evento.html", "o-bar.html", "favoritos.html", "conta.html"]) {
  test(`${page} header keeps account menu and no standalone theme toggle`, () => {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
    const header = html.match(/<header class="site-header">([\s\S]*?)<\/header>/)?.[1];
    assert.ok(header, "site header not found");
    assert.doesNotMatch(header, /id="theme-toggle"/);
    assert.doesNotMatch(header, /instagram\.com\/bardacaciaoficial/);
    assert.match(header, /<div id="header-account" class="header-account-slot"><\/div>/);
  });

  test(`${page} keeps Instagram in the footer, not the header`, () => {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
    const footer = html.match(/<footer class="site-footer">([\s\S]*?)<\/footer>/)?.[1];
    assert.ok(footer, "site footer not found");
    assert.match(footer, /class="site-instagram footer-instagram theme-toggle"/);
    assert.match(footer, /href="https:\/\/www\.instagram\.com\/bardacaciaoficial\/"/);
    assert.match(footer, /aria-label="Visitar o Instagram oficial do Bar da Cácia"/);
    assert.match(footer, /target="_blank"/);
  });
}

test("conta menu keeps the theme toggle after the header button is removed", () => {
  const js = readFileSync(new URL("../src/conta-page.js", import.meta.url), "utf8");
  assert.match(js, /data-theme-toggle/);
  assert.match(js, /Claro ou escuro na tela/);
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.account-menu-text \.theme-toggle-label \{ display: block; \}/);
});

test("login.html keeps its own header theme toggle (it has no account menu)", () => {
  const html = readFileSync(new URL("../login.html", import.meta.url), "utf8");
  assert.match(html, /id="theme-toggle"/);
});

test("Conta offers Entrar, favoritos, conta, O bar, the theme and Sair that the header menu used to", () => {
  const js = readFileSync(new URL("../src/conta-page.js", import.meta.url), "utf8");
  assert.match(js, /title: "Entrar"/);
  assert.match(js, /title: "Meus favoritos"/);
  assert.match(js, /href: "login\.html#conta"[^}]*title: "Minha conta"/);
  assert.match(js, /href: "o-bar\.html"[^}]*title: "O bar"/);
  assert.match(js, /themeRow\(\)/);
  assert.match(js, /action: "signout"[^}]*title: "Sair"/);
  const site = readFileSync(new URL("../src/site.js", import.meta.url), "utf8");
  assert.doesNotMatch(site, /SIGNED_(IN|OUT)_ITEMS|is-in-account-menu|setHeaderThemeVisible/);
});
