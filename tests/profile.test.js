import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AVATAR_JPEG_QUALITY,
  AVATAR_OUTPUT_SIZE,
  clampAvatarViewport,
  cropRectFromViewport,
  DATA_CONSENT_VERSION,
  defaultSquareCrop,
  formatPhoneMask,
  minCoverScale,
  normalizeSquareCrop,
  phoneDigits,
  profileInitials,
  toE164Phone,
  validateBirthDate,
  validatePhone,
} from "../src/lib/profile.js";

test("formatPhoneMask aplica (00) 00000-0000 progressivamente", () => {
  assert.equal(formatPhoneMask(""), "");
  assert.equal(formatPhoneMask("1"), "(1");
  assert.equal(formatPhoneMask("11"), "(11");
  assert.equal(formatPhoneMask("119"), "(11) 9");
  assert.equal(formatPhoneMask("119876"), "(11) 9876");
  assert.equal(formatPhoneMask("1198765"), "(11) 9876-5");
  assert.equal(formatPhoneMask("1132345678"), "(11) 3234-5678");
  assert.equal(formatPhoneMask("11987654321"), "(11) 98765-4321");
  assert.equal(formatPhoneMask("(11) 98765-43219999"), "(11) 98765-4321");
  assert.equal(formatPhoneMask("abc11 9 8765 4321"), "(11) 98765-4321");
});

test("formatPhoneMask e phoneDigits leem o E.164 salvo", () => {
  assert.equal(phoneDigits("+5511987654321"), "11987654321");
  assert.equal(formatPhoneMask("+5511987654321"), "(11) 98765-4321");
  assert.equal(formatPhoneMask("+553132345678"), "(31) 3234-5678");
  assert.equal(phoneDigits("+14155550123"), "");
});

test("validatePhone aceita vazio, celular e fixo do Brasil", () => {
  assert.equal(validatePhone(""), "");
  assert.equal(validatePhone("   "), "");
  assert.equal(validatePhone("(11) 98765-4321"), "");
  assert.equal(validatePhone("(31) 3234-5678"), "");
  assert.equal(validatePhone("+5521987654321"), "");
});

test("validatePhone recusa DDD inválido, tamanho e celular sem 9", () => {
  assert.match(validatePhone("(11) 9876-543"), /completo/);
  assert.match(validatePhone("(20) 98765-4321"), /DDD/);
  assert.match(validatePhone("(00) 98765-4321"), /DDD/);
  assert.match(validatePhone("(11) 88765-4321"), /começar com 9/);
  assert.match(validatePhone("(11) 9876-5432"), /9 dígitos/);
  assert.match(validatePhone("+14155550123"), /Brasil/);
});

test("toE164Phone devolve +55, vazio ou null", () => {
  assert.equal(toE164Phone("(11) 98765-4321"), "+5511987654321");
  assert.equal(toE164Phone("(31) 3234-5678"), "+553132345678");
  assert.equal(toE164Phone(""), "");
  assert.equal(toE164Phone("(20) 98765-4321"), null);
  assert.match(toE164Phone("(85) 99999-0000"), /^\+55\d{10,11}$/);
});

test("Minha conta: Perfil, Seus dados (aniversário, telefone, LGPD), Conta e Salvar no fim", () => {
  const html = readFileSync(new URL("../login.html", import.meta.url), "utf8");
  const account = html.slice(html.indexOf('id="auth-account"'), html.indexOf('class="auth-card-footer"'));
  const order = ['aria-label="Perfil"', ">Seus dados<", 'id="auth-birth-date"', 'id="auth-phone"', 'id="auth-account-consent"', ">Conta<", 'href="#nova-senha"', 'id="auth-signout"', 'id="auth-delete"', 'id="auth-profile-save"'];
  let last = -1;
  for (const marker of order) {
    const at = account.indexOf(marker);
    assert.ok(at > last, `${marker} fora de ordem ou ausente`);
    last = at;
  }
  assert.match(account, /Opcional\. Usamos só pra te lembrar da promoção de aniversariante do bar\./);
  assert.match(account, /Opcional\. Usado só pra contato do bar sobre seus pedidos e promoções\./);
  assert.match(account, /<summary>Como usamos seus dados<\/summary>/);
  assert.equal((account.match(/type="submit"/g) || []).length, 1);
  assert.doesNotMatch(account, /Atalhos|Meus favoritos|data-theme-toggle|auth-continue|Continuar para o site/);
  assert.match(account, /id="auth-profile-save"[^>]*form="auth-profile-form"/);
  assert.match(html, /id="theme-toggle"/);
  const footer = html.slice(html.indexOf('class="auth-card-footer"'), html.indexOf("</section>", html.indexOf('class="auth-card-footer"')));
  for (const [, modes] of footer.matchAll(/data-modes="([^"]+)"/g)) {
    assert.ok(!modes.split(" ").includes("conta"), "rodapé não aparece em Minha conta");
  }
});

test("modal de alterações não salvas é acessível", () => {
  const html = readFileSync(new URL("../login.html", import.meta.url), "utf8");
  const dialog = html.slice(html.indexOf('id="auth-unsaved"') - 8, html.indexOf("</dialog>", html.indexOf('id="auth-unsaved"')));
  assert.match(dialog, /^<dialog/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /aria-labelledby="auth-unsaved-title"/);
  assert.match(dialog, /id="auth-unsaved-title"[^>]*>Salvar as alterações\?</);
  assert.match(dialog, /id="auth-unsaved-save"[^>]*>Sim</);
  assert.match(dialog, /id="auth-unsaved-discard"[^>]*>Não</);
  assert.match(dialog, /id="auth-unsaved-close"[^>]*aria-label="Continuar editando"/);
});

test("validateBirthDate aceita vazio e data válida", () => {
  assert.equal(validateBirthDate(""), "");
  assert.equal(validateBirthDate("1990-05-20"), "");
});

test("validateBirthDate rejeita futuro, formato inválido e idade muito baixa", () => {
  assert.match(validateBirthDate("20/05/1990"), /AAAA-MM-DD/);
  assert.match(validateBirthDate("1899-12-31"), /válida/);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const future = tomorrow.toISOString().slice(0, 10);
  assert.match(validateBirthDate(future), /futuro/);
  const recent = new Date();
  recent.setFullYear(recent.getFullYear() - 5);
  const young = recent.toISOString().slice(0, 10);
  assert.match(validateBirthDate(young), /10 anos/);
});

test("profileInitials usa nome ou e-mail", () => {
  assert.equal(profileInitials("Felipe Atenesi"), "FA");
  assert.equal(profileInitials("", "pessoa@example.com"), "P");
  assert.equal(profileInitials("", ""), "?");
});

test("versão LGPD atual está definida", () => {
  assert.equal(DATA_CONSENT_VERSION, "2026-11");
});

test("avatar JPEG defaults are square 320 at ~0.72 quality", () => {
  assert.equal(AVATAR_OUTPUT_SIZE, 320);
  assert.equal(AVATAR_JPEG_QUALITY, 0.72);
});

test("defaultSquareCrop centers on the shortest side", () => {
  assert.deepEqual(defaultSquareCrop(800, 600), { sx: 100, sy: 0, sw: 600, sh: 600 });
  assert.deepEqual(defaultSquareCrop(400, 800), { sx: 0, sy: 200, sw: 400, sh: 400 });
  assert.deepEqual(defaultSquareCrop(320, 320), { sx: 0, sy: 0, sw: 320, sh: 320 });
});

test("normalizeSquareCrop clamps invalid or oversized regions", () => {
  assert.deepEqual(normalizeSquareCrop(800, 600, null), defaultSquareCrop(800, 600));
  assert.deepEqual(normalizeSquareCrop(800, 700, { sx: -40, sy: 10, sw: 600, sh: 600 }), {
    sx: 0,
    sy: 10,
    sw: 600,
    sh: 600,
  });
  assert.deepEqual(normalizeSquareCrop(500, 500, { sx: 200, sy: 200, sw: 400, sh: 400 }), {
    sx: 100,
    sy: 100,
    sw: 400,
    sh: 400,
  });
});

test("minCoverScale and viewport helpers keep the frame covered", () => {
  assert.equal(minCoverScale(800, 600, 280), 280 / 600);
  const clamped = clampAvatarViewport({
    imageWidth: 800,
    imageHeight: 600,
    viewportSize: 280,
    scale: 280 / 600,
    offsetX: 50,
    offsetY: -20,
  });
  assert.equal(clamped.scale, 280 / 600);
  assert.equal(clamped.offsetY, 0);
  assert.ok(clamped.offsetX <= 0);
  assert.ok(clamped.offsetX >= 280 - 800 * clamped.scale);

  const crop = cropRectFromViewport({
    imageWidth: 800,
    imageHeight: 600,
    viewportSize: 280,
    scale: 280 / 600,
    offsetX: (280 - 800 * (280 / 600)) / 2,
    offsetY: 0,
  });
  assert.equal(crop.sw, crop.sh);
  assert.ok(Math.abs(crop.sw - 600) < 1e-6);
  assert.ok(Math.abs(crop.sx - 100) < 1e-6);
  assert.equal(crop.sy, 0);
});
