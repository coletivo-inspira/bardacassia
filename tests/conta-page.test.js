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
  assert.match(js, /o-bar\.html/);
  assert.match(js, /title: "O bar"/);
  assert.match(js, /data-theme-toggle/);
  assert.match(js, /signOut/);
  assert.match(js, /initializeAccountMenu/);
  assert.match(js, /createAccountEditor/);
  assert.doesNotMatch(js, /createUser|signUp\(|password/);
});

test("Minha conta is no longer a menu row; the hero opens Perfil, dados e privacidade", () => {
  const js = read("src/conta-page.js");
  assert.doesNotMatch(js, /login\.html#conta|title: "Minha conta"/);
  assert.match(js, /const PROFILE_HASH = "#perfil";/);
  assert.match(js, /"Editar perfil, dados e privacidade"/);
  const html = read("conta.html");
  const hero = html.slice(html.indexOf('<header class="account-hero">'), html.indexOf("</header>", html.indexOf('id="account-details"')));
  assert.match(hero, /data-account-hero-hint hidden>Perfil, dados e privacidade</);
  assert.match(hero, /aria-controls="account-details"/);
  const details = hero.slice(hero.indexOf('id="account-details"'));
  const order = ['id="conta-avatar-input"', ">Seus dados<", 'id="conta-birth-date"', 'id="conta-phone"', 'id="conta-consent"', 'id="conta-editor-status"', 'id="conta-profile-save"', ">Senha e conta<", 'href="login.html#nova-senha"', 'id="conta-delete"'];
  let last = -1;
  for (const marker of order) {
    const at = details.indexOf(marker);
    assert.ok(at > last, `${marker} fora de ordem ou ausente na edição do perfil`);
    last = at;
  }
  assert.match(details, /<form id="conta-profile-form"[\s\S]*id="conta-profile-save"[^>]*type="submit"[\s\S]*<\/form>/);
  assert.match(details, /<summary>Como usamos seus dados<\/summary>/);
  assert.match(html, /<dialog id="conta-avatar-crop"/);
  assert.match(html, /<dialog id="conta-unsaved"/);
});

test("the hero editor keeps every save action from login.html#conta", () => {
  const js = read("src/account-editor.js");
  for (const call of ["getMyProfile", "getMyPhone", "updateMyProfile", "setMyPhone", "uploadMyAvatar", "compressAvatarFile", "deleteAccount", "hasCurrentConsent"]) {
    assert.match(js, new RegExp(`\\b${call}\\(`), call);
  }
  assert.match(js, /birth_date/);
  assert.match(js, /\$\("#conta-unsaved"\)/);
  assert.match(js, /window\.addEventListener\("beforeunload"/);
  // Auth refreshes re-render Conta; they must not wipe what the person is typing.
  assert.match(js, /if \(user && nextUser && user\.id === nextUser\.id && hasUnsavedChanges\(\)\) return;/);
  assert.match(read("src/conta-page.js"), /if \(editor\) editor\.confirmLeave\(run\);/);
});

test("login.html#conta and signed-in login visits land on Conta", () => {
  const html = read("login.html");
  assert.match(html, /if \(location\.hash\.toLowerCase\(\) === "#conta"\) location\.replace\("conta\.html#perfil"\);/);
  assert.doesNotMatch(html, /id="auth-account"|id="auth-profile-form"|id="auth-unsaved"|id="auth-avatar-crop"/);
  const js = read("src/login.js");
  assert.match(js, /const ACCOUNT_EDITOR_PAGE = "conta\.html#perfil";/);
  assert.match(js, /if \(next === "conta"\) \{\s*leaveForAccount\(ACCOUNT_EDITOR_PAGE\);/);
  assert.match(js, /const PASSWORD_SAVED_PAGE = "conta\.html\?senha=salva#perfil";/);
  assert.doesNotMatch(js, /renderAccount|uploadMyAvatar|deleteAccount/);
});

test("Modo claro is the first row of the Conta menu, signed in or not", () => {
  const js = read("src/conta-page.js");
  assert.match(js, /const rows = \[\];\s*if \(showThemeToggle\(features\)\) rows\.push\(themeRow\(\)\);\s*if \(!signedIn && publicAuthEnabled\(\)\)/);
  const html = read("conta.html");
  const menu = html.slice(html.indexOf("data-account-menu"));
  assert.ok(menu.indexOf("data-theme-toggle") < menu.indexOf('href="login.html"'), "static fallback also starts with the theme");
});

test("management rows live in their own Gestão do bar panel, id gestao", () => {
  const html = read("conta.html");
  assert.match(html, /<nav id="gestao" class="account-menu-panel account-staff-panel" aria-labelledby="account-staff-title" data-account-staff hidden>/);
  assert.match(html, /<h2 id="account-staff-title">Gestão do bar<\/h2>/);
  const js = read("src/conta-page.js");
  assert.match(js, /const rows = role \? rolePanelRows\(role, getFeatures\(\)\) : \[\];/);
  assert.match(js, /panel\.hidden = rows\.length === 0;/);
  const customer = js.slice(js.indexOf("function customerRows"), js.indexOf("function renderStaffPanel"));
  assert.doesNotMatch(customer, /rolePanelRows|admin\.html|gerente\.html|garcom\.html|cartaz\.html/);
  assert.match(js, /const STAFF_HASH = "#gestao";/);
});

test("conta-page.js builds role menus from existing routes and real profile fields", () => {
  const js = read("src/conta-page.js");
  assert.match(js, /getMyRole/);
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

test("desktop header account button is a plain link to conta.html, not a dropdown", () => {
  const site = read("src/site.js");
  assert.match(site, /function renderHeaderAccountLink/);
  assert.match(site, /link\.className = "theme-toggle header-account";\s*link\.href = "conta\.html";/);
  assert.doesNotMatch(site, /aria-haspopup|role="menu"|header-account-list|buildMenu/);
  assert.doesNotMatch(read("src/styles.css"), /header-account-menu/);
});

test("Conta lists Meus favoritos and Meus pedidos with count badges, signed in or not", () => {
  const js = read("src/conta-page.js");
  assert.match(js, /title: "Meus favoritos"[\s\S]*?count: favoritesCount\(\)/);
  assert.match(js, /href: `index\.html\$\{REQUESTS_HASH\}`[\s\S]*?title: "Meus pedidos"[\s\S]*?countKey: "requests"/);
  assert.match(js, /rows\.push\(\.\.\.songListRows\(features\)\);/);
  // QR mode keeps nothing on the phone, and counting without a session would create an anonymous one.
  assert.match(js, /requestsConfigured\(\) && requestMode\(\) === "remoto"/);
  assert.match(js, /if \(!showMyRequests\(\) \|\| !hasStoredAuthSession\(\)\) return;/);
  assert.match(read("src/lib/requests.js"), /export const REQUESTS_HASH = "#meus-pedidos";/);
});

test("the catalog opens Meus pedidos from the #meus-pedidos deep link", () => {
  const js = read("src/song-requests.js");
  assert.match(js, /REQUESTS_HASH/);
  assert.match(js, /if \(isRequestsHash\(\)\) openRequestsDialog\(\);/);
  assert.match(js, /window\.addEventListener\("hashchange", openFromHash\);/);
  assert.doesNotMatch(js, /#open-requests|#requests-count/);
  const html = read("index.html");
  assert.doesNotMatch(html, /night-list-access|id="open-requests"|id="requests-count"/);
  assert.match(html, /<dialog id="requests-dialog"/);
  assert.doesNotMatch(read("src/styles.css"), /night-list-access/);
});

test("vite build includes conta.html", () => {
  const vite = read("vite.config.js");
  assert.match(vite, /conta: resolve\(__dirname, "conta\.html"\)/);
});
