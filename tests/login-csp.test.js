import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

test("login CSP hash matches the inline theme script", () => {
  const html = readFileSync(new URL("../login.html", import.meta.url), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, "inline script not found");
  const hash = createHash("sha256").update(script).digest("base64");
  const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] || "";
  assert.ok(csp.includes(`'sha256-${hash}'`), `CSP must allow 'sha256-${hash}'`);
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
});
