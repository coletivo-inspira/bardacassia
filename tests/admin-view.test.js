import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ADMIN_TABS,
  INSPECTABLE_TABLE_IDS,
  adminDbHealthItems,
  adminErrorMessage,
  adminKpiCards,
  adminMetricsRange,
  adminTabHash,
  auditActionSummary,
  auditCategoryLabel,
  consentBadgeInfo,
  defaultStaffNameForUser,
  formatAuditDetails,
  formatSaoPauloDate,
  formatSaoPauloDateTime,
  formatTableCell,
  isInspectableTable,
  isStaffCapableRole,
  maskPhone,
  requestStatusBadge,
  resolveAdminTab,
  resolveDataSubtab,
  shortUuid,
  tableLabelOf,
} from "../src/lib/admin-view.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("resolveAdminTab sincroniza as 5 abas pela URL e cai em visao quando inválida", () => {
  assert.deepEqual(
    ADMIN_TABS.map((t) => t.hash),
    ["#visao", "#config", "#aparencia", "#acessos", "#banco-logs"],
  );
  assert.equal(resolveAdminTab(""), "visao");
  assert.equal(resolveAdminTab("#visao"), "visao");
  assert.equal(resolveAdminTab("#CONFIG"), "config");
  assert.equal(resolveAdminTab("#aparencia?pv=dark"), "aparencia");
  assert.equal(resolveAdminTab("acessos"), "acessos");
  assert.equal(resolveAdminTab("#banco-logs"), "banco-logs");
  assert.equal(resolveAdminTab("#desconhecida"), "visao");
  assert.equal(adminTabHash("banco-logs"), "#banco-logs");
  assert.equal(adminTabHash("invalida"), "#visao");
});

test("resolveDataSubtab valida sub-abas de Pedidos, Tabelas e Logs", () => {
  assert.equal(resolveDataSubtab("requests"), "requests");
  assert.equal(resolveDataSubtab("TABELAS"), "tabelas");
  assert.equal(resolveDataSubtab("logs"), "logs");
  assert.equal(resolveDataSubtab("outra"), "requests");
});

test("adminMetricsRange calcula a noite atual a partir das 18h em America/Sao_Paulo", () => {
  // 20:00 em Brasília (23:00Z) de 11/11/2026 -> início em 11/11/2026 18:00 -03:00 (21:00Z)
  const evening = new Date("2026-11-11T23:00:00.000Z");
  const r1 = adminMetricsRange("hoje", evening);
  assert.equal(r1.from.toISOString(), "2026-11-11T21:00:00.000Z");
  assert.equal(r1.to.toISOString(), evening.toISOString());

  // 02:00 da madrugada em Brasília (05:00Z de 12/11) ainda pertence à noite iniciada em 11/11 às 18:00
  const lateNight = new Date("2026-11-12T05:00:00.000Z");
  const r2 = adminMetricsRange("hoje", lateNight);
  assert.equal(r2.from.toISOString(), "2026-11-11T21:00:00.000Z");

  // Períodos de 7, 30 e 90 dias delegam para metricsRange
  const week = adminMetricsRange("7d", evening);
  assert.equal(week.from.toISOString(), "2026-11-04T23:00:00.000Z");
});

test("adminKpiCards e adminDbHealthItems formatam indicadores e saúde do banco", () => {
  const kpis = adminKpiCards(
    {
      requests: 38,
      played: 31,
      cancelled: 2,
      avg_wait_minutes: 14,
      customers: 24,
      visitors: 95,
      song_opens: 210,
      accounts_new: 5,
      accounts_total: 120,
    },
    { song_requests: { na_fila: 6 } },
  );
  assert.equal(kpis.length, 9);
  const byId = Object.fromEntries(kpis.map((item) => [item.id, item.value]));
  assert.equal(byId.requests, "38");
  assert.equal(byId["queue-now"], "6");
  assert.equal(byId.played, "31");
  assert.equal(byId.cancelled, "2");
  assert.equal(byId.wait, "14 min");
  assert.equal(byId["accounts-new"], "5 (120 total)");

  const health = adminDbHealthItems({
    catalog_codes: { total: 6500, active: 6480 },
    song_interactions: { total: 900, opens: 700, favorites: 200 },
    profiles: { total: 50, admin: 2, dono: 1, garcom: 4, cliente: 43 },
    write_limits: { active_10m: 3, writes_10m: 28 },
    admin_audit_logs: { total: 40, last_24h: 9 },
  });
  assert.equal(health.length, 4);
  assert.equal(health[0].id, "catalog");
  assert.match(health[3].detail, /28 gravações/);
  assert.deepEqual(adminDbHealthItems(null), []);
});

test("maskPhone protege o telefone mantendo DDD e últimos 4 dígitos", () => {
  assert.equal(maskPhone("31998761234"), "(31) *****-1234");
  assert.equal(maskPhone("+55 (11) 98888-4321"), "(11) *****-4321");
  assert.equal(maskPhone("3132225678"), "(31) ****-5678");
  assert.equal(maskPhone("123456"), "****-3456");
  assert.equal(maskPhone(""), "");
  assert.equal(maskPhone(null), "");
});

test("formatação em America/Sao_Paulo, papéis e LGPD", () => {
  const iso = "2026-11-11T21:30:00.000Z"; // 18:30 em Brasília
  assert.match(formatSaoPauloDateTime(iso), /11\/11\/2026.*18:30/);
  assert.equal(formatSaoPauloDate(iso), "11/11/2026");
  assert.equal(formatSaoPauloDateTime(null), "—");
  assert.equal(shortUuid("ce41376c-203e-4355-95fa-2626ec37c024"), "ce41376c");

  assert.equal(isStaffCapableRole("cliente"), false);
  assert.equal(isStaffCapableRole("garcom"), true);
  assert.equal(isStaffCapableRole("dono"), true);
  assert.equal(isStaffCapableRole("admin"), true);

  assert.equal(defaultStaffNameForUser({ staff_name: "Marina", display_name: "Marina Silva" }), "Marina");
  assert.equal(defaultStaffNameForUser({ staff_name: "", display_name: "Rafa" }), "Rafa");
  assert.equal(defaultStaffNameForUser({ email: "nanda@bar.com" }), "nanda");

  assert.equal(consentBadgeInfo({}).ok, false);
  assert.equal(
    consentBadgeInfo({ data_consent_at: iso, data_consent_version: "2026-11" }).label,
    "LGPD 2026-11",
  );
});

test("whitelist de tabelas do inspetor rejeita segredos e tabelas externas", () => {
  assert.deepEqual(INSPECTABLE_TABLE_IDS, [
    "song_requests",
    "song_interactions",
    "profiles",
    "staff",
    "catalog_codes",
    "bar_settings",
    "site_features",
    "write_limits",
    "admin_audit_logs",
  ]);
  for (const tbl of INSPECTABLE_TABLE_IDS) {
    assert.equal(isInspectableTable(tbl), true);
    assert.ok(tableLabelOf(tbl).includes(tbl));
  }
  assert.equal(isInspectableTable("profile_secrets"), false);
  assert.equal(isInspectableTable("private.profile_secrets"), false);
  assert.equal(isInspectableTable("auth.users"), false);

  assert.equal(formatTableCell("active", true), "Sim");
  assert.equal(formatTableCell("active", false), "Não");
  assert.equal(formatTableCell("customer_phone", "11999998888"), "(11) *****-8888");
  assert.equal(formatTableCell("id", "ce41376c-203e-4355-95fa-2626ec37c024"), "ce41376c…");
});

test("logs de auditoria, badges de pedido e mensagens de erro", () => {
  assert.equal(auditCategoryLabel("config"), "Configuração");
  assert.equal(auditCategoryLabel("acesso"), "Acessos");
  assert.match(
    auditActionSummary({ action: "atualizar_acesso", target: "Marina" }),
    /Atualizou papel e acesso na equipe · Marina/,
  );
  assert.equal(formatAuditDetails({ ok: true }), '{\n  "ok": true\n}');

  assert.equal(requestStatusBadge("na_fila").label, "Na fila");
  assert.equal(requestStatusBadge("aguardando_pagamento").tone, "amber");

  assert.match(adminErrorMessage({ hint: "ultimo_admin" }), /último administrador/);
  assert.match(adminErrorMessage({ code: "42501" }), /administrador/);
});

test("admin.html, src/admin.css e migração 012 expõem as 5 abas glass e auditoria segura", () => {
  const html = read("admin.html");
  assert.match(html, /noindex, nofollow/);
  for (const hash of ["#visao", "#config", "#aparencia", "#acessos", "#banco-logs"]) {
    assert.ok(html.includes(`href="${hash}"`), `missing tab link ${hash}`);
  }
  assert.match(html, /role="switch"/);
  assert.doesNotMatch(html, /glass-island/);

  const css = read("src/admin.css");
  assert.match(css, /@import "\.\/styles\.css"/);
  assert.match(css, /blur\(22px\)\s+saturate\(165%\)/);
  assert.match(css, /border-radius:\s*24px/);

  const sql = read("supabase/migrations/012_admin_console_logs.sql");
  assert.match(sql, /create table if not exists public\.admin_audit_logs/);
  assert.match(sql, /function private\.log_admin_event/);
  assert.match(sql, /function public\.admin_set_runtime_params/);
  assert.match(sql, /function public\.admin_db_overview/);
  assert.match(sql, /function public\.admin_list_users/);
  assert.match(sql, /function public\.admin_update_user_access/);
  assert.match(sql, /function public\.admin_list_requests/);
  assert.match(sql, /function public\.admin_inspect_table/);
  assert.match(sql, /function public\.admin_list_audit_logs/);
  assert.doesNotMatch(sql, /profile_secrets/);
  assert.doesNotMatch(sql, /anonymous session required/);
});
