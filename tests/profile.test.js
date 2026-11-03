import test from "node:test";
import assert from "node:assert/strict";
import { DATA_CONSENT_VERSION, profileInitials, validateBirthDate } from "../src/lib/profile.js";

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
