import test from "node:test";
import assert from "node:assert/strict";
import { KNOWN_AUTH_PROVIDERS, parseAuthProviders } from "../src/lib/auth-validation.js";

test("KNOWN_AUTH_PROVIDERS inclui Google, Facebook, Apple e Spotify", () => {
  assert.deepEqual(KNOWN_AUTH_PROVIDERS, ["google", "facebook", "apple", "spotify"]);
});

test("parseAuthProviders normaliza, deduplica e ignora desconhecidos", () => {
  assert.deepEqual(parseAuthProviders(" Google,APPLE, google ,instagram,spotify "), [
    "google",
    "apple",
    "spotify",
  ]);
  assert.deepEqual(parseAuthProviders(""), []);
  assert.deepEqual(parseAuthProviders("facebook"), ["facebook"]);
});
