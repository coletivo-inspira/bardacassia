import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migrations = readdirSync(new URL("../supabase/migrations/", import.meta.url))
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => read(`supabase/migrations/${file}`));

function latestBody(marker) {
  const sql = migrations.filter((text) => text.includes(marker)).at(-1);
  assert.ok(sql, `${marker} not found`);
  const body = sql.slice(sql.lastIndexOf(marker));
  return body.slice(0, body.indexOf("$$;") + 3);
}

test("the latest create_song_request rejects requests when site_features.requests is off", () => {
  const fn = latestBody("create or replace function public.create_song_request(");
  assert.match(fn, /coalesce\(f\.requests, true\)/);
  assert.match(fn, /if not coalesce\(v_requests_on, true\) then\s+raise exception 'Os pedidos de música estão desligados/);
  assert.match(fn, /hint = 'pedidos_desligados'/);
  assert.ok(fn.indexOf("pedidos_desligados") < fn.indexOf("insert into public.song_requests"));
  assert.doesNotMatch(fn, /site_features\s+where\s+id\b/);
});

test("the latest profiles_birth_date_range requires 10 years, not 10 days", () => {
  const sql = migrations.filter((text) => text.includes("add constraint profiles_birth_date_range")).at(-1);
  const check = sql.slice(sql.lastIndexOf("add constraint profiles_birth_date_range"));
  assert.match(check, /current_date - interval '10 years'/);
  assert.doesNotMatch(check.slice(0, check.indexOf(";")), /current_date - 10\)/);
  assert.match(check, /\) not valid;/);
  assert.match(check, /validate constraint profiles_birth_date_range/);
  assert.match(read("src/lib/profile.js"), /setFullYear\(minAdult\.getFullYear\(\) - 10\)/);
});

test("the Supabase workflow pooler host defaults to aws-0-<region> and can be overridden", () => {
  const workflow = read(".github/workflows/supabase.yml");
  assert.match(workflow, /SUPABASE_POOLER_HOST: \$\{\{ vars\.SUPABASE_POOLER_HOST \}\}/);
  const line = workflow.split("\n").find((row) => row.includes("POOLER_HOST=")).trim();
  const host = (override) => execFileSync("bash", ["-c", `set -u; REGION=sa-east-1; ${line}; printf %s "$POOLER_HOST"`], {
    env: { ...process.env, SUPABASE_POOLER_HOST: override },
  }).toString();
  assert.equal(host(""), "aws-0-sa-east-1.pooler.supabase.com");
  assert.equal(host("aws-1-sa-east-1.pooler.supabase.com"), "aws-1-sa-east-1.pooler.supabase.com");
});
