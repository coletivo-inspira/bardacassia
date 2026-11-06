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
