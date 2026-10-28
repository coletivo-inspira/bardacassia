const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export const METRIC_RANGES = [
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "90d", label: "90 dias" },
];

export function metricsRange(id, now = new Date()) {
  const days = { "7d": 7, "30d": 30, "90d": 90 }[id] || 30;
  return { from: new Date(now.getTime() - days * DAY_MS), to: now };
}

export function weekdayLabel(day) {
  return WEEKDAYS[Number(day)] || "";
}

export function formatCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("pt-BR") : "0";
}

export function formatMinutes(value) {
  const number = Number(value);
  if (value === null || value === undefined || !Number.isFinite(number)) return "—";
  if (number < 60) return `${Math.round(number)} min`;
  const hours = Math.floor(number / 60);
  const minutes = Math.round(number % 60);
  return minutes ? `${hours}h${String(minutes).padStart(2, "0")}` : `${hours}h`;
}

/** "2026-10-28" → "qua 28/10", sem depender do fuso do aparelho. */
export function nightLabel(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ""));
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return `${WEEKDAYS[date.getUTCDay()].slice(0, 3).toLowerCase()} ${match[3]}/${match[2]}`;
}

/** Linhas de um gráfico de barras: percentual relativo ao maior valor. */
export function barRows(items = [], { label = (item) => item.label, value = (item) => item.requests } = {}) {
  const values = items.map((item) => Math.max(Number(value(item)) || 0, 0));
  const max = Math.max(0, ...values);
  return items.map((item, index) => ({
    label: label(item),
    value: values[index],
    percent: max ? Math.round((values[index] / max) * 100) : 0,
  }));
}

export function metricCards(metrics) {
  if (!metrics) return [];
  const nights = Number(metrics.nights) || 0;
  return [
    { id: "requests", label: "Músicas pedidas e pagas", value: formatCount(metrics.requests) },
    { id: "per-night", label: "Média por noite", value: nights ? formatCount(Math.round((Number(metrics.requests) || 0) / nights)) : "—" },
    { id: "customers", label: "Clientes que pediram", value: formatCount(metrics.customers) },
    { id: "wait", label: "Espera média até tocar", value: formatMinutes(metrics.avg_wait_minutes) },
    { id: "visitors", label: "Aparelhos que abriram músicas", value: formatCount(metrics.visitors) },
    { id: "accounts", label: "Contas cadastradas", value: `${formatCount(metrics.accounts_total)} (+${formatCount(metrics.accounts_new)})` },
  ];
}
