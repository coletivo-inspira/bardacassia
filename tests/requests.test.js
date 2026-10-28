import test from "node:test";
import assert from "node:assert/strict";
import {
  aheadLabel, filterStaffRequests, firstName, formatClock, formatPhone, nextOccurrence, readCustomer,
  requestErrorMessage, requestStatusLabel, roundSlotsLeft, roundSummary, saveCustomer, splitStaffRequests,
  validateCustomer,
} from "../src/lib/requests.js";

const staffRequests = [
  { id: 3, status: "na_fila", paid_at: "2026-10-31T02:10:00Z", created_at: "2026-10-31T02:00:00Z", customer_name: "Bruno", customer_phone: "31911112222", code: "19019", title: "Talking to the Moon", artist: "Bruno Mars" },
  { id: 1, status: "aguardando_pagamento", created_at: "2026-10-31T02:05:00Z", customer_name: "Alice Souza", customer_phone: "31987654321", code: "1234", title: "Infiel", artist: "Marília Mendonça" },
  { id: 2, status: "na_fila", paid_at: "2026-10-31T02:01:00Z", created_at: "2026-10-31T01:50:00Z", customer_name: "Cássia", customer_phone: "31933334444", code: "5678", title: "Evidências", artist: "Chitãozinho & Xororó" },
];

function memoryStorage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
}

test("validateCustomer normaliza nome e telefone", () => {
  const result = validateCustomer({ name: "  Alice   Souza ", phone: "(11) 98765-4321" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { name: "Alice Souza", phone: "11987654321" });
});

test("validateCustomer rejeita nome curto e telefone sem DDD", () => {
  const result = validateCustomer({ name: "A", phone: "98765-4321" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.name);
  assert.ok(result.errors.phone);
});

test("formatPhone formata celular, fixo e código do país", () => {
  assert.equal(formatPhone("11987654321"), "(11) 98765-4321");
  assert.equal(formatPhone("1133334444"), "(11) 3333-4444");
  assert.equal(formatPhone("5511987654321"), "(11) 98765-4321");
});

test("firstName expõe só o primeiro nome", () => {
  assert.equal(firstName(" Alice  Souza "), "Alice");
});

test("aheadLabel descreve a posição na fila", () => {
  assert.equal(aheadLabel(0), "A sua é a próxima!");
  assert.equal(aheadLabel(1), "Falta 1 música antes da sua.");
  assert.equal(aheadLabel(3), "Faltam 3 músicas antes da sua.");
  assert.equal(aheadLabel(null), "");
});

test("requestStatusLabel cobre todos os estados", () => {
  assert.match(requestStatusLabel({ status: "aguardando_pagamento" }), /pagar/);
  assert.equal(requestStatusLabel({ status: "na_fila", ahead: 2 }), "Pago, na fila. Faltam 2 músicas antes da sua.");
  assert.equal(requestStatusLabel({ status: "tocou" }), "Já tocou.");
  assert.match(requestStatusLabel({ status: "cancelado" }), /Cancelado/);
});

test("roundSummary mostra vagas e horário da próxima rodada", () => {
  const opts = { timeZone: "America/Sao_Paulo" };
  assert.equal(roundSummary({ queue_open: true, round_limit: 13, round_used: 10 }, opts), "Fila aberta · faltam 3 vagas nesta rodada");
  assert.equal(roundSummary({ queue_open: true, round_limit: 13, round_used: 12 }, opts), "Fila aberta · falta 1 vaga nesta rodada");
  assert.equal(roundSummary({ queue_open: true, round_limit: 0, round_used: 5 }, opts), "Fila aberta");
  assert.equal(
    roundSummary({ queue_open: false, next_round_at: "2026-10-31T05:00:00Z" }, opts),
    "Fila fechada · próxima rodada às 02:00",
  );
  assert.equal(roundSummary({ queue_open: false, next_round_at: null }, opts), "Fila fechada");
});

test("roundSlotsLeft nunca fica negativo", () => {
  assert.equal(roundSlotsLeft({ round_limit: 13, round_used: 20 }), 0);
  assert.equal(roundSlotsLeft({ round_limit: 0 }), null);
});

test("formatClock ignora valores inválidos", () => {
  assert.equal(formatClock(""), "");
  assert.equal(formatClock("não é data"), "");
});

test("nextOccurrence usa o dia seguinte quando o horário já passou", () => {
  const now = new Date(2026, 9, 30, 23, 15);
  const next = nextOccurrence("02:00", now);
  assert.equal(next.getDate(), 31);
  assert.equal(next.getHours(), 2);
  const later = nextOccurrence("23:45", now);
  assert.equal(later.getDate(), 30);
  assert.equal(nextOccurrence("25:00", now), null);
  assert.equal(nextOccurrence("", now), null);
});

test("requestErrorMessage traduz dicas do servidor", () => {
  assert.match(requestErrorMessage({ hint: "fila_fechada" }), /fechada/);
  assert.match(requestErrorMessage({ status: 401 }), /permissão/);
  assert.match(requestErrorMessage(new Error("offline")), /conexão/);
});

test("saveCustomer e readCustomer guardam os dados do cliente", () => {
  const storage = memoryStorage();
  assert.deepEqual(readCustomer(storage), { name: "", phone: "" });
  saveCustomer({ name: " Alice ", phone: "(11) 98765-4321" }, storage);
  assert.deepEqual(readCustomer(storage), { name: "Alice", phone: "11987654321" });
});

test("splitStaffRequests ordena a fila pelo pagamento e os pendentes pela chegada", () => {
  const { queue, pending } = splitStaffRequests(staffRequests);
  assert.deepEqual(queue.map((request) => request.id), [2, 3]);
  assert.deepEqual(pending.map((request) => request.id), [1]);
});

test("filterStaffRequests busca por nome sem acento, telefone e código", () => {
  assert.deepEqual(filterStaffRequests(staffRequests, "cassia").map((request) => request.id), [2]);
  assert.deepEqual(filterStaffRequests(staffRequests, "4321").map((request) => request.id), [1]);
  assert.deepEqual(filterStaffRequests(staffRequests, "19019").map((request) => request.id), [3]);
  assert.deepEqual(filterStaffRequests(staffRequests, "bruno mars").map((request) => request.id), [3]);
  assert.equal(filterStaffRequests(staffRequests, "  ").length, 3);
});
