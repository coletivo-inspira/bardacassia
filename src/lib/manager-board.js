import { normalizeText } from "./catalog.js";
import { barRows } from "./metrics.js";

const RANGES = { "7d": 7, "30d": 30, "90d": 90 };
const WEEK_BASE = [14, 6, 9, 11, 16, 28, 32];
const SONGS = [
  { code: "4574", title: "DANCING QUEEN", artist: "Abba", weight: 18 },
  { code: "9072", title: "WHAT'S UP", artist: "4 Non Blondes", weight: 14 },
  { code: "1039", title: "BOLA DE MEIA BOLA DE GUDE", artist: "14 Bis", weight: 11 },
  { code: "6197", title: "TODO AZUL DO MAR", artist: "14 Bis", weight: 9 },
  { code: "19333", title: "FERNANDO", artist: "Abba", weight: 7 },
  { code: "6549", title: "SÃO PAULO", artist: "365", weight: 5 },
];
const STAFF = [
  { name: "Marina", weight: 46 },
  { name: "Rafa", weight: 31 },
  { name: "Nanda", weight: 18 },
];
const ACCOUNTS_NEW = { "7d": 2, "30d": 7, "90d": 19 };

/** Data civil em America/Sao_Paulo, no formato AAAA-MM-DD. */
export function saoPauloISODate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function shiftISODate(isoDate, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ""));
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekdayOf(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ""));
  if (!match) return 0;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
}

function distribute(total, weights) {
  const amount = Math.max(0, Math.round(Number(total) || 0));
  const safe = weights.map((weight) => Math.max(Number(weight) || 0, 0));
  const sum = safe.reduce((acc, weight) => acc + weight, 0);
  if (!amount || !sum) return safe.map(() => 0);
  const raw = safe.map((weight) => (amount * weight) / sum);
  const floors = raw.map((value) => Math.floor(value));
  let left = amount - floors.reduce((acc, value) => acc + value, 0);
  const order = raw
    .map((value, index) => ({ index, frac: value - floors[index] }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  for (const item of order) {
    if (left <= 0) break;
    floors[item.index] += 1;
    left -= 1;
  }
  return floors;
}

function nightCount(isoDate, indexFromEnd) {
  const dow = weekdayOf(isoDate);
  if (dow === 1 && indexFromEnd % 2 === 0) return 0;
  return WEEK_BASE[dow] + ((indexFromEnd * 3) % 5);
}

function buildNights(rangeId, now) {
  const span = RANGES[rangeId];
  const today = saoPauloISODate(now);
  const nights = [];
  for (let ago = span - 1; ago >= 0; ago -= 1) {
    const night = shiftISODate(today, -ago);
    nights.push({ night, requests: nightCount(night, ago) });
  }
  return nights;
}

function weekdayRows(nights) {
  const totals = new Map();
  for (const night of nights) {
    if (!night.requests) continue;
    const dow = weekdayOf(night.night);
    totals.set(dow, (totals.get(dow) || 0) + night.requests);
  }
  return [...totals.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([weekday, requests]) => ({ weekday, requests }));
}

function emptyFloor() {
  return {
    queue_open: false,
    round_limit: 40,
    round_used: 0,
    next_round_at: null,
    message: "",
    night: { required: false, code: "" },
    queue: [],
    pending: [],
    played: [],
  };
}

function busyFloor() {
  return {
    queue_open: true,
    round_limit: 40,
    round_used: 27,
    next_round_at: null,
    message: "Microfone aberto",
    night: { required: true, code: "CACIA" },
    queue: [
      { code: "4574", title: "DANCING QUEEN", artist: "Abba", customer_name: "Lia" },
      { code: "9072", title: "WHAT'S UP", artist: "4 Non Blondes", customer_name: "Pedro" },
      { code: "1039", title: "BOLA DE MEIA BOLA DE GUDE", artist: "14 Bis", customer_name: "Ana" },
    ],
    pending: [
      { code: "6549", title: "SÃO PAULO", artist: "365", customer_name: "Caio" },
      { code: "19333", title: "FERNANDO", artist: "Abba", customer_name: "Bia" },
    ],
    played: [
      { code: "6197", title: "TODO AZUL DO MAR", artist: "14 Bis", customer_name: "Duda" },
      { code: "9116", title: "I HAVE A DREAM", artist: "Abba", customer_name: "Léo" },
      { code: "7693", title: "ROMANCE", artist: "14 Bis", customer_name: "Nina" },
    ],
  };
}

/**
 * Recorte local do painel. `variant: "vazio"` zera pedidos e a fila
 * para o estado sem movimento. Não chama rede.
 */
export function localManagerSnapshot(rangeId, { variant = "cheio", now = new Date() } = {}) {
  const range = RANGES[rangeId] ? rangeId : "30d";
  const empty = variant === "vazio";
  const byNight = empty ? [] : buildNights(range, now);
  const requests = byNight.reduce((sum, night) => sum + night.requests, 0);
  const songShare = Math.min(requests, Math.round(requests * 0.62));
  const songCounts = distribute(songShare, SONGS.map((song) => song.weight));
  const staffCounts = distribute(requests, STAFF.map((person) => person.weight));
  return {
    source: "local",
    rangeId: range,
    variant: empty ? "vazio" : "cheio",
    metrics: {
      requests,
      played: Math.min(requests, Math.round(requests * 0.84)),
      cancelled: Math.round(requests * 0.04),
      unpaid: Math.round(requests * 0.08),
      via_qr: Math.min(requests, Math.round(requests * 0.71)),
      nights: byNight.filter((night) => night.requests > 0).length,
      avg_wait_minutes: requests ? 16.5 : null,
      customers: requests ? Math.max(1, Math.round(requests * 0.58)) : 0,
      visitors: requests ? Math.round(requests * 2.2) : 0,
      song_opens: requests ? Math.round(requests * 3.1) : 0,
      accounts_total: 128,
      accounts_new: empty ? 0 : ACCOUNTS_NEW[range],
      by_night: byNight,
      by_weekday: weekdayRows(byNight),
      top_songs: SONGS
        .map((song, index) => ({ code: song.code, title: song.title, artist: song.artist, requests: songCounts[index] }))
        .filter((song) => song.requests > 0),
      by_staff: STAFF
        .map((person, index) => ({ name: person.name, requests: staffCounts[index] }))
        .filter((person) => person.requests > 0),
    },
    floor: empty ? emptyFloor() : busyFloor(),
  };
}

export function periodHasActivity(metrics) {
  if (!metrics) return false;
  return ["requests", "played", "unpaid", "cancelled"].some((key) => Number(metrics[key]) > 0);
}

export function funnelRows(metrics) {
  if (!metrics || !periodHasActivity(metrics)) return [];
  return barRows(
    [
      { label: "Pagas", requests: metrics.requests },
      { label: "Tocaram", requests: metrics.played },
      { label: "Pelo QR", requests: metrics.via_qr },
      { label: "A pagar", requests: metrics.unpaid },
      { label: "Canceladas", requests: metrics.cancelled },
    ],
    { value: (item) => item.requests },
  );
}

export function filterTopSongs(songs = [], query = "") {
  const needle = normalizeText(query);
  if (!needle) return [...songs];
  return songs.filter((song) => normalizeText(`${song.code} ${song.title} ${song.artist}`).includes(needle));
}

/** Ordem das leituras do quadro ao vivo, como em `Promise.allSettled`. */
export const LIVE_PARTS = ["metrics", "settings", "night", "requests", "played"];

const LIVE_PART_LABELS = {
  metrics: "números do período",
  settings: "situação da rodada",
  night: "código da noite",
  requests: "fila e pedidos a pagar",
  played: "músicas que já tocaram",
};

/**
 * Monta o quadro ao vivo com o que chegou. O que falhou fica vazio e entra em
 * `failed`, para o painel avisar sem apagar o resto.
 */
export function liveManagerSnapshot(rangeId, settled, splitRequests) {
  const ok = (index) => settled[index]?.status === "fulfilled";
  const value = (index, fallback) => (ok(index) ? settled[index].value ?? fallback : fallback);
  const failed = LIVE_PARTS.filter((_, index) => !ok(index));
  const errors = LIVE_PARTS.map((_, index) => settled[index]).filter((item) => item?.status === "rejected").map((item) => item.reason);
  const split = splitRequests(value(3, []));
  return {
    failed,
    errors,
    snapshot: {
      source: "live",
      rangeId,
      metrics: value(0, null),
      floor: {
        ...(ok(1) ? value(1, {}) : {}),
        night: value(2, null) || { required: false, code: "" },
        queue: split.queue,
        pending: split.pending,
        played: value(4, []),
      },
    },
  };
}

export function failedPartsMessage(failed = []) {
  const labels = failed.map((part) => LIVE_PART_LABELS[part]).filter(Boolean);
  if (!labels.length) return "";
  const list = labels.length > 1 ? `${labels.slice(0, -1).join(", ")} e ${labels.at(-1)}` : labels[0];
  return `Não deu para carregar ${list}. O resto do painel está atualizado.`;
}
