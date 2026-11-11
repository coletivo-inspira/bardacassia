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
  assert.equal(dom.meta.content, "#141414");

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

test("account menu leaves theme toggling to initializeTheme", () => {
  const site = readFileSync(new URL("../src/site.js", import.meta.url), "utf8");
  assert.doesNotMatch(site, /toggleTheme\(/, "a second click handler on [data-theme-toggle] cancels the first");
  assert.match(site, /data-action="theme" data-theme-toggle/);
});

for (const page of ["index.html", "evento.html", "o-bar.html", "favoritos.html", "conta.html"]) {
  test(`${page} header shows the night-mode button beside the account menu`, () => {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
    const header = html.match(/<header class="site-header">([\s\S]*?)<\/header>/)?.[1];
    assert.ok(header, "site header not found");
    assert.match(header, /id="theme-toggle"[^>]*data-theme-toggle/);
    assert.match(header, /class="theme-toggle-label">Modo noturno</);
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

test("login.html keeps its own header theme toggle (it has no account menu)", () => {
  const html = readFileSync(new URL("../login.html", import.meta.url), "utf8");
  assert.match(html, /id="theme-toggle"/);
});

test("signed-out menu offers Entrar and the theme; signed-in adds favoritos and conta", () => {
  const site = readFileSync(new URL("../src/site.js", import.meta.url), "utf8");
  const signedOut = site.match(/const SIGNED_OUT_ITEMS = `([\s\S]*?)`;/)?.[1];
  const signedIn = site.match(/const SIGNED_IN_ITEMS = `([\s\S]*?)`;/)?.[1];
  assert.ok(signedOut && signedIn, "menu item templates not found");
  assert.match(signedOut, /role="menuitem"[^>]*href="login\.html"[^>]*>\$\{ENTER_ICON\}<span>Entrar<\/span></);
  assert.match(signedOut, /href="o-bar\.html">\$\{BAR_ICON\}<span>O bar<\/span></);
  assert.match(signedOut, /\$\{THEME_MENU_ITEM\}/);
  assert.doesNotMatch(signedOut, /signout/);
  assert.match(signedIn, /href="favoritos\.html">\$\{HEART_ICON\}<span>Meus favoritos<\/span></);
  assert.match(signedIn, /href="login\.html#conta">\$\{USER_ICON\}<span>Minha conta<\/span></);
  assert.match(signedIn, /href="o-bar\.html">\$\{BAR_ICON\}<span>O bar<\/span></);
  assert.match(signedIn, /\$\{THEME_MENU_ITEM\}/);
  assert.match(signedIn, /data-action="signout"/);
  assert.doesNotMatch(site, /is-in-account-menu|setHeaderThemeVisible/);
});
