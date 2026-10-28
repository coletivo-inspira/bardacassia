import test from "node:test";
import assert from "node:assert/strict";
import {
  TICKETS_KEY, buildTicketUrl, encodeTicketHash, isValidTicket, newTicketId, parseTicket, readTickets,
  rememberTicketStatus, ticketForSong, ticketName, ticketStatusLabel,
} from "../src/lib/qr-ticket.js";
import { posterUrl, readOrigin } from "../src/lib/origin.js";

const TICKET = "3f2b8c1e-4a5d-4e6f-9a7b-1c2d3e4f5a6b";

function memoryStorage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
}

test("newTicketId gera UUID v4 mesmo sem randomUUID", () => {
  const fallback = newTicketId({ getRandomValues: (bytes) => bytes.fill(171) });
  assert.match(fallback, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.ok(isValidTicket({ code: "1234", ticket: newTicketId() }));
});

test("ticketName usa só o primeiro nome e limita o tamanho", () => {
  assert.equal(ticketName("  Ana   Paula Souza "), "Ana");
  assert.equal(ticketName(""), "");
  assert.equal(ticketName("A".repeat(50)).length, 30);
});

test("buildTicketUrl aponta para garcom.html na mesma pasta do site", () => {
  const url = buildTicketUrl("https://coletivo-inspira.github.io/bardacassia/index.html?q=evid#x", { code: "5678", name: "Cássia Eller", ticket: TICKET });
  assert.equal(url, `https://coletivo-inspira.github.io/bardacassia/garcom.html#add=5678&t=${TICKET}&n=C%C3%A1ssia`);
});

test("parseTicket lê a URL completa ou só o hash", () => {
  const url = buildTicketUrl("https://bar.example/", { code: "19019", name: "Bruno", ticket: TICKET });
  assert.deepEqual(parseTicket(url), { code: "19019", name: "Bruno", ticket: TICKET });
  assert.deepEqual(parseTicket(`#${encodeTicketHash({ code: "4920", ticket: TICKET.toUpperCase() })}`), { code: "4920", name: "", ticket: TICKET });
});

test("parseTicket rejeita QR que não é de pedido", () => {
  assert.equal(parseTicket("https://instagram.com/bardacassia"), null);
  assert.equal(parseTicket(`#add=12ab&t=${TICKET}`), null);
  assert.equal(parseTicket("#add=1234&t=nao-e-uuid"), null);
  assert.equal(parseTicket(""), null);
  assert.equal(parseTicket("https://["), null);
});

test("ticketForSong reaproveita o ticket até a música tocar", () => {
  const storage = memoryStorage();
  let next = 0;
  const ids = [TICKET, "11111111-2222-4333-8444-555555555555"];
  const options = { storage, now: 1000, createId: () => ids[next++] };
  assert.equal(ticketForSong("1234", options), TICKET);
  assert.equal(ticketForSong("1234", options), TICKET);
  rememberTicketStatus("1234", TICKET, "na_fila", options);
  assert.equal(ticketForSong("1234", options), TICKET);
  rememberTicketStatus("1234", TICKET, "tocou", options);
  assert.equal(ticketForSong("1234", options), ids[1]);
});

test("readTickets descarta tickets antigos e dados inválidos", () => {
  const storage = memoryStorage();
  storage.setItem(TICKETS_KEY, JSON.stringify({
    1234: { ticket: TICKET, at: 0 },
    5678: { ticket: TICKET, at: 7 * 60 * 60 * 1000 },
    abc: { ticket: TICKET, at: 7 * 60 * 60 * 1000 },
  }));
  assert.deepEqual(Object.keys(readTickets(storage, 7 * 60 * 60 * 1000 + 1)), ["5678"]);
  storage.setItem(TICKETS_KEY, "{quebrado");
  assert.deepEqual(readTickets(storage), {});
});

test("ticketStatusLabel explica cada etapa ao cliente", () => {
  assert.match(ticketStatusLabel(null), /Mostre este QR ao garçom/);
  assert.match(ticketStatusLabel({ status: "na_fila", ahead: 0 }), /A sua é a próxima/);
  assert.match(ticketStatusLabel({ status: "na_fila", ahead: 1 }), /Falta 1 música/);
  assert.match(ticketStatusLabel({ status: "na_fila", ahead: 4 }), /Faltam 4 músicas/);
  assert.match(ticketStatusLabel({ status: "tocou" }), /já tocou/);
  assert.match(ticketStatusLabel({ status: "cancelado" }), /cancelou/);
});

test("readOrigin aceita só rótulos curtos e seguros", () => {
  assert.equal(readOrigin("?origem=Mesa"), "mesa");
  assert.equal(readOrigin("?origem=<script>"), "");
  assert.equal(readOrigin(""), "");
});

test("posterUrl limpa o endereço e marca a origem", () => {
  assert.equal(posterUrl("https://coletivo-inspira.github.io/bardacassia/index.html?x=1#a", "mesa"), "https://coletivo-inspira.github.io/bardacassia/?origem=mesa");
  assert.equal(posterUrl("https://bardacassia.com.br/", ""), "https://bardacassia.com.br/");
});
