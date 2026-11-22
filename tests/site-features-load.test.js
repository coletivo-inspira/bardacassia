import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createSiteFeaturesLoader,
  isEmptyPalette,
  shouldApplySiteDefaultTheme,
} from "../src/lib/site-features-load.js";

function fakeLoader(results) {
  const calls = { request: 0, adopt: [], clear: 0 };
  const queue = [...results];
  const load = createSiteFeaturesLoader({
    request: async () => {
      calls.request += 1;
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return next;
    },
    adopt: (data) => calls.adopt.push(data),
    clearPalette: () => { calls.clear += 1; },
    getFeatures: () => ({ requests: calls.adopt.at(-1)?.requests ?? true }),
  });
  return { load, calls };
}

function docWith(className) {
  const classes = new Set(className.split(/\s+/).filter(Boolean));
  return { body: { classList: { contains: (name) => classes.has(name) } } };
}

test("RPC failure keeps the cached palette", async () => {
  const { load, calls } = fakeLoader([{ status: "error" }]);
  await load();
  assert.equal(calls.clear, 0);
  assert.deepEqual(calls.adopt, []);
});

test("thrown request is treated as a failure, not as no palette", async () => {
  const { load, calls } = fakeLoader([new Error("offline")]);
  assert.deepEqual(await load(), { requests: true });
  assert.equal(calls.clear, 0);
});

test("failure is not cached: the next call retries and adopts the payload", async () => {
  const payload = { requests: false, palette: { dark: { amber: "#ff0000" } } };
  const { load, calls } = fakeLoader([{ status: "error" }, { status: "ok", data: payload }]);
  assert.deepEqual(await load(), { requests: true });
  assert.deepEqual(await load(), { requests: false });
  assert.equal(calls.request, 2);
  assert.deepEqual(calls.adopt, [payload]);
});

test("success is cached: concurrent and later calls share one request", async () => {
  const { load, calls } = fakeLoader([{ status: "ok", data: { requests: false } }]);
  const [a, b] = await Promise.all([load(), load()]);
  await load();
  assert.deepEqual(a, b);
  assert.equal(calls.request, 1);
});

test("without Supabase configured the palette cache is cleared once", async () => {
  const { load, calls } = fakeLoader([{ status: "off" }]);
  await load();
  await load();
  assert.equal(calls.clear, 1);
  assert.equal(calls.request, 1);
});

test("empty palette from the server means no palette", () => {
  assert.equal(isEmptyPalette({}), true);
  assert.equal(isEmptyPalette(null), true);
  assert.equal(isEmptyPalette(undefined), true);
  assert.equal(isEmptyPalette([]), true);
  assert.equal(isEmptyPalette({ dark: { amber: "#ff0000" } }), false);
});

test("site default theme is skipped on every staff panel", () => {
  assert.equal(shouldApplySiteDefaultTheme(docWith("admin-page panel-page")), false);
  assert.equal(shouldApplySiteDefaultTheme(docWith("manager-page panel-page")), false);
  assert.equal(shouldApplySiteDefaultTheme(docWith("staff-page panel-page")), false);
  assert.equal(shouldApplySiteDefaultTheme(docWith("manager-page")), false);
  assert.equal(shouldApplySiteDefaultTheme(docWith("staff-page")), false);
});

test("site default theme still applies on public pages", () => {
  assert.equal(shouldApplySiteDefaultTheme(docWith("")), true);
  assert.equal(shouldApplySiteDefaultTheme(docWith("account-page")), true);
  assert.equal(shouldApplySiteDefaultTheme(docWith("event-page")), true);
  assert.equal(shouldApplySiteDefaultTheme({}), true);
  assert.equal(shouldApplySiteDefaultTheme(undefined), true);
});

test("each panel HTML carries a class the theme gate recognizes", () => {
  for (const page of ["admin.html", "gerente.html", "garcom.html"]) {
    const body = readFileSync(new URL(`../${page}`, import.meta.url), "utf8").match(/<body class="([^"]*)"/);
    assert.ok(body, `${page} has a body class`);
    assert.equal(shouldApplySiteDefaultTheme(docWith(body[1])), false, page);
  }
});
