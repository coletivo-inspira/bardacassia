import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  hasCurrentConsent,
  hasPendingConsent,
  PENDING_CONSENT_MAX_AGE_MS,
  PENDING_CONSENT_METADATA_KEY,
  pendingConsentRecord,
  shouldApplyPendingConsent,
  storedConsentIsPending,
} from "../src/lib/consent.js";
import { DATA_CONSENT_VERSION } from "../src/lib/profile.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const NOW = Date.UTC(2026, 10, 22, 12);

test("hasCurrentConsent exige data e a versão atual do texto", () => {
  assert.equal(hasCurrentConsent(null), false);
  assert.equal(hasCurrentConsent({ data_consent_at: null, data_consent_version: DATA_CONSENT_VERSION }), false);
  assert.equal(hasCurrentConsent({ data_consent_at: "2026-11-01T00:00:00Z", data_consent_version: "2020-01" }), false);
  assert.equal(hasCurrentConsent({ data_consent_at: "2026-11-01T00:00:00Z", data_consent_version: DATA_CONSENT_VERSION }), true);
});

test("o consentimento do cadastro por e-mail fica pendente no user_metadata", () => {
  assert.equal(hasPendingConsent({ metadata: { [PENDING_CONSENT_METADATA_KEY]: DATA_CONSENT_VERSION } }), true);
  assert.equal(hasPendingConsent({ metadata: { [PENDING_CONSENT_METADATA_KEY]: "2020-01" } }), false);
  assert.equal(hasPendingConsent({ metadata: { display_name: "Ana" } }), false);
  assert.equal(hasPendingConsent({}), false);
});

test("a marca do OAuth vale só para a versão atual e por pouco tempo", () => {
  const record = pendingConsentRecord(NOW);
  assert.equal(storedConsentIsPending(record, NOW), true);
  assert.equal(storedConsentIsPending(record, NOW + PENDING_CONSENT_MAX_AGE_MS), true);
  assert.equal(storedConsentIsPending(record, NOW + PENDING_CONSENT_MAX_AGE_MS + 1), false);
  assert.equal(storedConsentIsPending(record, NOW - 1), false);
  assert.equal(storedConsentIsPending(JSON.stringify({ version: "2020-01", at: NOW }), NOW), false);
  assert.equal(storedConsentIsPending("not json", NOW), false);
  assert.equal(storedConsentIsPending(null, NOW), false);
  assert.equal(hasPendingConsent({ stored: record, now: NOW }), true);
});

test("o consentimento pendente só é gravado em perfil ainda sem consentimento atual", () => {
  const consented = { data_consent_at: "2026-11-01T00:00:00Z", data_consent_version: DATA_CONSENT_VERSION };
  assert.equal(shouldApplyPendingConsent({ data_consent_at: null }, true), true);
  assert.equal(shouldApplyPendingConsent(null, true), true);
  assert.equal(shouldApplyPendingConsent(consented, true), false);
  assert.equal(shouldApplyPendingConsent({ data_consent_at: null }, false), false);
});

test("login: botões sociais no cadastro exigem o checkbox LGPD e guardam o consentimento", () => {
  const js = read("src/login.js");
  const click = js.match(/button\.addEventListener\("click", async \(\) => \{([\s\S]*?)\n    \}\);/)?.[1];
  assert.ok(click);
  assert.match(click, /^\s*if \(socialConsentMissing\(\)\) return;/);
  assert.match(click, /rememberPendingConsent\(mode === "cadastrar"\)/);
  assert.match(click, /catch[\s\S]*rememberPendingConsent\(false\)/);
  assert.match(js, /function socialConsentMissing\(\) \{\s*if \(mode !== "cadastrar" \|\| consentInput\?\.checked\) return false;/);
});

test("login: cadastro com confirmação envia o consentimento e o aplica ao entrar", () => {
  const js = read("src/login.js");
  assert.match(js, /signUp\(\{[^}]*consent: true \}\)/);
  assert.doesNotMatch(js, /updateMyProfile/);
  assert.match(js, /if \(currentUser\) await settlePendingConsent\(currentUser\);\s*if \(returnedFromProvider\)/);
  assert.match(js, /const user = await signIn\([\s\S]*?await settlePendingConsent\(user\);\s*goNext\(\);/);
  assert.match(js, /event === "SIGNED_IN"\) await settlePendingConsent/);
  const auth = read("src/integrations/auth.js");
  assert.match(auth, /if \(consent\) metadata\[PENDING_CONSENT_METADATA_KEY\] = DATA_CONSENT_VERSION;/);
});

test("applyPendingConsent grava o consentimento e limpa as duas marcas", () => {
  const js = read("src/integrations/profile.js");
  const body = js.match(/export async function applyPendingConsent\(user\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(body);
  assert.match(body, /shouldApplyPendingConsent\(profile, pending\)\) profile = await updateMyProfile\(\{ grantConsent: true \}\)/);
  assert.match(body, /rememberPendingConsent\(false\)/);
  assert.match(body, /updateUser\(\{ data: \{ \[PENDING_CONSENT_METADATA_KEY\]: null \} \}\)/);
});

test("Conta: foto segue a mesma regra de consentimento do Salvar", () => {
  const js = read("src/account-editor.js");
  assert.match(js, /function consentMissing\(\) \{\s*return !els\.consent\.checked && !hasCurrentConsent\(profile\);/);
  const save = js.match(/async function save\(\) \{([\s\S]*?)\n  \}\n/)?.[1];
  assert.ok(save);
  assert.match(save, /if \(consentMissing\(\)\) \{\s*requireConsent\(\);\s*return false;/);
  assert.match(js, /avatarInput\.addEventListener\("click", \(event\) => \{\s*if \(blockAvatarWithoutConsent\(\)\) event\.preventDefault\(\);/);
  assert.match(js, /els\.avatarStatus\.textContent = "";\s*if \(blockAvatarWithoutConsent\(\)\) return;/);
  const confirm = js.match(/cropConfirm\.addEventListener\("click", async \(\) => \{([\s\S]*?)\n    \}\);/)?.[1];
  assert.ok(confirm);
  assert.ok(confirm.indexOf("consentMissing()") < confirm.indexOf("uploadMyAvatar"));
  assert.match(confirm, /uploadMyAvatar\(blob, \{ compressed: true, grantConsent \}\)/);
  const profile = read("src/integrations/profile.js");
  assert.match(profile, /return updateMyProfile\(\{ avatarUrl: url, grantConsent \}\);/);
});
