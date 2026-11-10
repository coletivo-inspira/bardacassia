import test from "node:test";
import assert from "node:assert/strict";
import {
  accountReturnUrl,
  authErrorMessage,
  normalizeEmail,
  passwordStrength,
  safeNextPath,
  validateDisplayName,
  validateEmail,
  validateLoginPassword,
  validateNewPassword,
} from "../src/lib/auth-validation.js";

test("normalizes and validates e-mails", () => {
  assert.equal(normalizeEmail("  Cacia@Bar.COM "), "cacia@bar.com");
  assert.equal(validateEmail("cacia@bar.com"), "");
  assert.equal(validateEmail(""), "Informe seu e-mail.");
  assert.equal(validateEmail("cacia@bar"), "Informe um e-mail válido.");
  assert.equal(validateEmail("ca cia@bar.com"), "Informe um e-mail válido.");
  assert.equal(validateEmail(`${"a".repeat(250)}@b.com`), "Informe um e-mail válido.");
});

test("login password only requires presence", () => {
  assert.equal(validateLoginPassword("x"), "");
  assert.equal(validateLoginPassword(""), "Informe sua senha.");
});

test("new passwords enforce length, letters and digits", () => {
  assert.match(validateNewPassword(""), /Crie/);
  assert.match(validateNewPassword("abc12"), /8 caracteres/);
  assert.match(validateNewPassword("somenteletras"), /letras e números/);
  assert.match(validateNewPassword("12345678"), /letras e números/);
  assert.match(validateNewPassword("a1".repeat(40)), /no máximo/);
  assert.equal(validateNewPassword("karaoke2026"), "");
});

test("new password cannot contain the e-mail name", () => {
  assert.match(validateNewPassword("cassia2026!", { email: "cassia@bar.com" }), /e-mail/);
  assert.equal(validateNewPassword("microfone42", { email: "cassia@bar.com" }), "");
});

test("password strength grows with variety and length", () => {
  assert.equal(passwordStrength(""), 0);
  assert.ok(passwordStrength("karaoke2026") < passwordStrength("Karaoke-2026!x"));
  assert.equal(passwordStrength("Karaoke-2026!x"), 4);
});

test("display name is required and bounded", () => {
  assert.equal(validateDisplayName(" Cácia "), "");
  assert.match(validateDisplayName("   "), /Informe/);
  assert.match(validateDisplayName("x".repeat(61)), /60/);
});

test("next path only allows same-site relative destinations", () => {
  assert.equal(safeNextPath("index.html#buscar"), "index.html#buscar");
  assert.equal(safeNextPath("/o-bar.html"), "o-bar.html");
  assert.equal(safeNextPath(""), "index.html");
  assert.equal(safeNextPath("https://evil.example"), "index.html");
  assert.equal(safeNextPath("//evil.example"), "index.html");
  assert.equal(safeNextPath("javascript:alert(1)"), "index.html");
  assert.equal(safeNextPath("/\\evil.example"), "index.html");
  assert.equal(safeNextPath("index.html\"><script>"), "index.html");
});

test("auth errors map to generic Portuguese messages", () => {
  assert.equal(authErrorMessage({ message: "Invalid login credentials" }), "E-mail ou senha inválidos.");
  assert.match(authErrorMessage({ code: "email_not_confirmed" }), /Confirme seu e-mail/);
  assert.doesNotMatch(authErrorMessage({ code: "user_already_exists" }), /já existe/);
  assert.match(authErrorMessage({ code: "over_request_rate_limit" }), /Muitas tentativas/);
  assert.match(authErrorMessage(new TypeError("Failed to fetch")), /conexão/);
  assert.equal(authErrorMessage({ message: "boom" }), "Não foi possível concluir agora. Tente novamente.");
});

test("accountReturnUrl prefers next, then a same-origin referrer, then the catalog", () => {
  const current = "https://cacia.example/login.html?next=o-bar.html#conta";
  assert.equal(accountReturnUrl({ next: "o-bar.html", referrer: "https://cacia.example/evento.html", current }), "https://cacia.example/o-bar.html");
  assert.equal(accountReturnUrl({ next: "https://evil.example/", referrer: "", current }), "https://cacia.example/index.html");
  const plain = "https://cacia.example/login.html#conta";
  assert.equal(accountReturnUrl({ next: null, referrer: "https://cacia.example/evento.html#agenda", current: plain }), "https://cacia.example/evento.html#agenda");
  assert.equal(accountReturnUrl({ next: "", referrer: "https://other.example/index.html", current: plain }), "https://cacia.example/index.html");
  assert.equal(accountReturnUrl({ next: "", referrer: "https://cacia.example/login.html#entrar", current: plain }), "https://cacia.example/index.html");
  assert.equal(accountReturnUrl({ next: undefined, referrer: "", current: plain }), "https://cacia.example/index.html");
});
