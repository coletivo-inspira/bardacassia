import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  PANEL_RETURN_KEY, firstName, panelLinksForRole, panelRoleLabel, resolvePanelReturn, returnPageName, returnTargetFromReferrer,
} from "../src/lib/panel-nav.js";
import { failedPartsMessage, liveManagerSnapshot } from "../src/lib/manager-board.js";
import { splitStaffRequests } from "../src/lib/requests.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const ORIGIN = "https://cacia.inspira.dev.br";

const PANEL_PAGES = {
  "admin.html": { title: "Console do administrador", css: "src/admin.css" },
  "gerente.html": { title: "Painel do gerente", css: "src/gerente.css" },
  "garcom.html": { title: "Painel do garçom", css: "src/garcom.css" },
};

test("panelLinksForRole lists only the panels each role opens, current one marked", () => {
  const on = { manager_panel: true, staff_panel: true };
  const ids = (role, options = {}) => panelLinksForRole(role, { features: on, ...options }).map((panel) => panel.id);
  assert.deepEqual(ids("admin"), ["admin", "gerente", "garcom"]);
  assert.deepEqual(ids("dono"), ["gerente", "garcom"]);
  assert.deepEqual(ids("garcom"), ["garcom"]);
  assert.deepEqual(ids("cliente"), []);
  assert.deepEqual(ids("cliente", { current: "gerente" }), ["gerente"]);
  assert.deepEqual(ids("admin", { features: { manager_panel: false, staff_panel: false } }), ["admin"]);
  assert.deepEqual(ids("admin", { current: "gerente", features: { manager_panel: false, staff_panel: true } }), ["admin", "gerente", "garcom"]);
  const current = panelLinksForRole("admin", { current: "garcom", features: on }).filter((panel) => panel.current);
  assert.deepEqual(current.map((panel) => panel.href), ["garcom.html"]);
});

test("panelRoleLabel and firstName speak Portuguese for the header chip", () => {
  assert.equal(panelRoleLabel("admin"), "Administrador");
  assert.equal(panelRoleLabel("dono"), "Dono");
  assert.equal(panelRoleLabel("garcom"), "Garçom");
  assert.equal(panelRoleLabel("x"), "");
  assert.equal(firstName("  Felipe Atene "), "Felipe");
  assert.equal(firstName(""), "");
});

test("returnTargetFromReferrer keeps same-origin site pages as relative links", () => {
  assert.equal(returnTargetFromReferrer(`${ORIGIN}/conta.html`, ORIGIN), "conta.html");
  assert.equal(returnTargetFromReferrer(`${ORIGIN}/`, ORIGIN), "index.html");
  assert.equal(returnTargetFromReferrer(`${ORIGIN}/index.html#buscar`, ORIGIN), "index.html#buscar");
  assert.equal(returnTargetFromReferrer(`${ORIGIN}/bardacassia/favoritos.html?x=1`, ORIGIN), "favoritos.html?x=1");
  assert.equal(returnTargetFromReferrer("https://evil.example/conta.html", ORIGIN), "");
  for (const page of ["admin.html", "gerente.html", "garcom.html", "login.html?next=admin.html"]) {
    assert.equal(returnTargetFromReferrer(`${ORIGIN}/${page}`, ORIGIN), "", page);
  }
  assert.equal(returnTargetFromReferrer("", ORIGIN), "");
});

test("resolvePanelReturn remembers the page that opened management across panel hops", () => {
  assert.equal(resolvePanelReturn({ referrer: `${ORIGIN}/conta.html`, origin: ORIGIN, stored: "index.html" }), "conta.html");
  assert.equal(resolvePanelReturn({ referrer: `${ORIGIN}/admin.html`, origin: ORIGIN, stored: "conta.html" }), "conta.html");
  assert.equal(resolvePanelReturn({ referrer: "", origin: ORIGIN, stored: "o-bar.html#horario" }), "o-bar.html#horario");
  assert.equal(resolvePanelReturn({ referrer: "", origin: ORIGIN, stored: "" }), "index.html");
  for (const stored of ["javascript:alert(1)", "https://evil.example/", "//evil.example/conta.html", "gerente.html", "nada.html"]) {
    assert.equal(resolvePanelReturn({ origin: ORIGIN, stored }), "index.html", stored);
  }
  assert.equal(PANEL_RETURN_KEY, "bdc-panel-return-v1");
});

test("returnPageName names the destination of Voltar ao site", () => {
  assert.equal(returnPageName("conta.html"), "a Conta");
  assert.equal(returnPageName("index.html#buscar"), "o catálogo");
  assert.equal(returnPageName("favoritos.html?x=1"), "as Favoritas");
  assert.equal(returnPageName(""), "o catálogo");
});

for (const [page, { title, css }] of Object.entries(PANEL_PAGES)) {
  test(`${page} uses the shared panel header with identity slot, back control and breadcrumb`, () => {
    const html = read(page);
    assert.match(html, /<body class="[^"]*\bpanel-page\b[^"]*">/);
    assert.match(html, /<div class="panel-ambient" aria-hidden="true">/);
    const header = html.match(/<header class="panel-header glass-card" data-panel-header>([\s\S]*?)<\/header>/)?.[1];
    assert.ok(header, "shared panel header not found");
    assert.match(header, new RegExp(`<a class="panel-brand" href="${page.replace(".", "\\.")}">`));
    assert.match(header, /<div class="panel-account" data-panel-account hidden><\/div>/);
    assert.match(header, /<a class="panel-back" href="index\.html" data-panel-back>[\s\S]*?Voltar ao site[\s\S]*?<\/a>/);
    const crumbs = header.match(/<nav class="panel-crumbs" aria-label="Você está em">\s*<ol>([\s\S]*?)<\/ol>/)?.[1] || "";
    const items = [...crumbs.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((match) => match[1].trim());
    assert.deepEqual(items, [
      '<a href="index.html">Site</a>',
      '<a href="conta.html">Conta</a>',
      '<a href="conta.html#gestao">Gestão</a>',
      `<span aria-current="page">${title}</span>`,
    ]);
    assert.doesNotMatch(header, /id="(admin|mgr|staff)-logout"/, "Sair now lives in the account menu");
    assert.match(read(css), /@import "\.\/panel-shell\.css";/);
  });
}

test("garcom.html keeps Ler QR, the four tabs and the scanner on the shared glass", () => {
  const html = read("garcom.html");
  assert.match(html, /<button id="staff-scan" class="btn btn-primary btn-sm staff-scan"/);
  const tabs = [...html.matchAll(/<button id="(tab-[a-z]+)" class="panel-tab staff-tab"/g)].map((match) => match[1]);
  assert.deepEqual(tabs, ["tab-queue", "tab-pending", "tab-results", "tab-round"]);
  assert.match(html, /<div class="panel-tabs staff-tabs" role="tablist"/);
  for (const id of ["ticket-card", "next-card", "round-form", "night-form", "scan-dialog", "manual-form", "results-cards"]) {
    assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
  }
  assert.doesNotMatch(html, /class="staff-header"/);
});

test("gerente.html shares the admin glass cards, pills and bars", () => {
  const html = read("gerente.html");
  assert.match(html, /<p id="source-badge" class="badge source-badge"/);
  assert.match(html, /<div class="segmented-pills range-switch" role="group" aria-label="Período">/);
  assert.equal((html.match(/class="pill-btn range-button"/g) || []).length, 3);
  assert.match(html, /<div id="board-alert" class="glass-card live-strip board-alert" role="alert" hidden>/);
  assert.match(html, /<button id="board-retry"[^>]*>Tentar de novo<\/button>/);
  assert.doesNotMatch(html, /class="glass panel/);
  assert.doesNotMatch(read("src/gerente.css"), /\.glass \{/);
});

test("liveManagerSnapshot keeps what loaded and names what failed", () => {
  const ok = (value) => ({ status: "fulfilled", value });
  const fail = (reason) => ({ status: "rejected", reason });
  const requests = [
    { id: 1, status: "na_fila", paid_at: "2026-11-11T22:00:00Z", created_at: "2026-11-11T21:00:00Z" },
    { id: 2, status: "aguardando_pagamento", paid_at: null, created_at: "2026-11-11T21:10:00Z" },
  ];
  const full = liveManagerSnapshot("7d", [ok({ requests: 3 }), ok({ queue_open: true }), ok(null), ok(requests), ok([])], splitStaffRequests);
  assert.deepEqual(full.failed, []);
  assert.equal(full.snapshot.floor.queue.length, 1);
  assert.equal(full.snapshot.floor.pending.length, 1);
  assert.deepEqual(full.snapshot.floor.night, { required: false, code: "" });
  assert.equal(full.snapshot.rangeId, "7d");

  const broken = new Error("column reference \"id\" is ambiguous");
  const partial = liveManagerSnapshot("30d", [ok({ requests: 3 }), ok({ queue_open: false }), ok({ required: true, code: "ABC" }), fail(broken), ok([])], splitStaffRequests);
  assert.deepEqual(partial.failed, ["requests"]);
  assert.deepEqual(partial.errors, [broken]);
  assert.deepEqual(partial.snapshot.floor.queue, []);
  assert.equal(partial.snapshot.metrics.requests, 3);
  assert.equal(partial.snapshot.floor.queue_open, false);
  assert.equal(failedPartsMessage(partial.failed), "Não deu para carregar fila e pedidos a pagar. O resto do painel está atualizado.");

  const none = liveManagerSnapshot("30d", [], splitStaffRequests);
  assert.equal(none.failed.length, 5);
  assert.equal(none.snapshot.metrics, null);
  assert.equal(none.snapshot.floor.queue_open, undefined);
  assert.equal(failedPartsMessage(["metrics", "played"]), "Não deu para carregar números do período e músicas que já tocaram. O resto do painel está atualizado.");
  assert.equal(failedPartsMessage([]), "");
});

test("the latest staff_list_requests qualifies site_features.id (no ambiguous id with its output column)", () => {
  const dir = new URL("../supabase/migrations/", import.meta.url);
  const files = readdirSync(dir).filter((file) => file.endsWith(".sql")).sort();
  const latest = files.filter((file) => read(`supabase/migrations/${file}`).includes("function public.staff_list_requests(")).at(-1);
  assert.ok(latest, "staff_list_requests not found");
  const sql = read(`supabase/migrations/${latest}`);
  const body = sql.slice(sql.lastIndexOf("create or replace function public.staff_list_requests("));
  const fn = body.slice(0, body.indexOf("$$;") + 3);
  assert.match(fn, /returns table\(id bigint/);
  assert.doesNotMatch(fn, /site_features\s+where\s+id\b/);
  assert.match(fn, /from public\.site_features f where f\.id/);
});
