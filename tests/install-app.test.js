import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  INSTALL_DISMISS_KEY,
  INSTALL_REMIND_AFTER_MS,
  detectInstallPlatform,
  isStandaloneDisplay,
  nextInstallNoticeRecord,
  shouldShowInstallNotice,
} from "../src/lib/install-app.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));

const PUBLIC_PAGES = ["index", "conta", "favoritos", "evento", "o-bar", "login", "cartaz"];
const PANEL_PAGES = ["admin", "garcom", "gerente"];

test("manifest names the bar, stays relative to the Vite base and lists any + maskable icons", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest"));
  assert.equal(manifest.name, "Bar da Cácia");
  assert.equal(manifest.short_name, "Bar da Cácia");
  assert.equal(manifest.lang, "pt-BR");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.background_color, "#1a2218");
  assert.equal(manifest.theme_color, "#1a2218");
  // Relative URLs resolve against the manifest, so the root domain and /bardacassia/ both work.
  for (const url of [manifest.start_url, manifest.scope, ...manifest.icons.map((icon) => icon.src)]) {
    assert.doesNotMatch(url, /^\/|^https?:/, `${url} must be relative`);
  }
  assert.deepEqual(manifest.icons.map((icon) => `${icon.sizes} ${icon.purpose}`), ["192x192 any", "512x512 any", "512x512 maskable"]);
  for (const icon of manifest.icons) assert.ok(exists(`public/${icon.src}`), `${icon.src} missing`);
  for (const file of ["apple-touch-icon.png", "favicon-32.png"]) assert.ok(exists(`public/icons/${file}`), `${file} missing`);
});

test("public pages link the manifest and home-screen icon; staff panels are left alone", () => {
  for (const page of PUBLIC_PAGES) {
    const head = read(`${page}.html`).split("</head>")[0];
    assert.match(head, /<link rel="manifest" href="%BASE_URL%manifest\.webmanifest" \/>/, page);
    assert.match(head, /<link rel="apple-touch-icon" href="%BASE_URL%icons\/apple-touch-icon\.png" \/>/, page);
    assert.match(head, /<link rel="icon" type="image\/png" sizes="32x32" href="%BASE_URL%icons\/favicon-32\.png" \/>/, page);
    assert.match(head, /<meta name="apple-mobile-web-app-title" content="Bar da Cácia" \/>/, page);
    assert.match(head, /<meta name="apple-mobile-web-app-capable" content="yes" \/>/, page);
    assert.match(head, /<meta name="mobile-web-app-capable" content="yes" \/>/, page);
  }
  for (const page of PANEL_PAGES) assert.doesNotMatch(read(`${page}.html`), /rel="manifest"|apple-touch-icon/, page);
});

test("service worker is network-first and never touches other origins or the API", () => {
  const sw = read("public/sw.js");
  assert.match(sw, /url\.origin !== self\.location\.origin/);
  assert.match(sw, /\/api\//);
  assert.ok(sw.indexOf("await fetch(request)") < sw.indexOf("caches.match"), "network before cache");
  const headers = read("public/_headers");
  assert.match(headers, /\/manifest\.webmanifest\n\s+Content-Type: application\/manifest\+json/);
  assert.match(headers, /\/sw\.js\n\s+Cache-Control: no-cache/);
  const site = read("src/site.js");
  assert.match(site, /registerServiceWorker\(\);/);
  assert.match(site, /export function watchVirtualKeyboard\(\)/);
});

test("platform detection covers iPhone, iPadOS-as-Mac, iOS Chrome, in-app browsers and Android", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
  assert.deepEqual(detectInstallPlatform({ userAgent: iphone }), { os: "ios", device: "iPhone", browser: "safari" });
  const ipad = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
  assert.deepEqual(detectInstallPlatform({ userAgent: ipad, platform: "MacIntel", maxTouchPoints: 5 }), { os: "ios", device: "iPad", browser: "safari" });
  assert.equal(detectInstallPlatform({ userAgent: ipad, platform: "MacIntel", maxTouchPoints: 0 }).os, "desktop");
  assert.equal(detectInstallPlatform({ userAgent: iphone.replace("Version/18.1", "CriOS/131.0") }).browser, "chrome");
  assert.equal(detectInstallPlatform({ userAgent: `${iphone} Instagram 350.0` }).browser, "in-app");
  assert.equal(detectInstallPlatform({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/131.0 Mobile" }).os, "android");
});

test("standalone means installed: display-mode or iOS navigator.standalone", () => {
  const win = (modes, standalone) => ({ navigator: { standalone }, matchMedia: (q) => ({ matches: modes.some((m) => q.includes(m)) }) });
  assert.equal(isStandaloneDisplay(win([], undefined)), false);
  assert.equal(isStandaloneDisplay(win(["standalone"], undefined)), true);
  assert.equal(isStandaloneDisplay(win([], true)), true);
});

test("notice shows on the first visit, once more after 30 days, then never", () => {
  assert.equal(INSTALL_DISMISS_KEY, "bdc-install-dismissed-v1");
  const now = Date.UTC(2026, 10, 22);
  assert.equal(shouldShowInstallNotice(null, now), true);
  assert.equal(shouldShowInstallNotice("not json", now), true);
  const seen = nextInstallNoticeRecord(null, now);
  assert.deepEqual(JSON.parse(seen), { at: now, count: 1 });
  assert.equal(shouldShowInstallNotice(seen, now + INSTALL_REMIND_AFTER_MS - 1), false);
  assert.equal(shouldShowInstallNotice(seen, now + INSTALL_REMIND_AFTER_MS), true);
  // Closing keeps the count and restarts the 30 days.
  const closed = nextInstallNoticeRecord(seen, now + 1000, { bump: false });
  assert.deepEqual(JSON.parse(closed), { at: now + 1000, count: 1 });
  const again = nextInstallNoticeRecord(seen, now + INSTALL_REMIND_AFTER_MS);
  assert.equal(shouldShowInstallNotice(again, now + 10 * INSTALL_REMIND_AFTER_MS), false);
});

test("Conta offers Instalar o app only while the site is not installed; the notice skips Conta", () => {
  const js = read("src/conta-page.js");
  assert.match(js, /if \(installAvailable\(\)\) \{\n\s+rows\.push\(menuRow\(\{ action: "install"[^}]*title: "Instalar o app"/);
  assert.match(js, /openInstallSheet\(\{ returnFocusTo: row \}\)/);
  const site = read("src/site.js");
  assert.match(site, /if \(slug !== "conta"\) scheduleInstallNotice\(\);/);
  const lib = read("src/lib/install-app.js");
  assert.match(lib, /"Instalar no \$\{info\.device\}"|`Instalar no \$\{info\.device\}`/);
  assert.match(lib, /Adicionar à Tela de Início/);
  assert.match(lib, /Entendi/);
  assert.match(lib, /Instale o Bar da Cácia na sua tela de início/);
  assert.match(lib, /is-keyboard-open/);
  const css = read("src/styles.css");
  assert.match(css, /\.is-keyboard-open \.install-notice/);
  assert.match(css, /bottom: calc\(var\(--dock-bottom, 12px\) \+ var\(--island-h\) \+ 10px\);/);
});
