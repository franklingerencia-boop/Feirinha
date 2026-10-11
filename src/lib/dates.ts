// Datas no formato brasileiro e no fuso da empresa (padrão America/Sao_Paulo).

export const DEFAULT_TZ = "America/Sao_Paulo";

/** "2026-10-17" -> "17/10/2026" (sem conversão de fuso: datas puras). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export function weekday(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** Data e hora de um instante, no fuso informado. */
export function formatDateTime(ts: string | null | undefined, tz = DEFAULT_TZ): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

/** "09:00:00" -> "09:00" */
export function formatTime(t: string | null | undefined): string {
  if (!t) return "";
  return t.slice(0, 5);
}

/** Data de hoje (AAAA-MM-DD) no fuso da empresa. */
export function todayISO(tz = DEFAULT_TZ): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return parts;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function monthRange(iso: string): { from: string; to: string } {
  const [y, m] = iso.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from, to: `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}` };
}

/** Lista de datas entre duas datas, inclusive. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard < 400) {
    out.push(cur);
    cur = addDays(cur, 1);
    guard++;
  }
  return out;
}

export function rangeLabel(first?: string | null, last?: string | null): string {
  if (!first) return "Sem datas";
  if (!last || first === last) return formatDate(first);
  return `${formatDate(first)} a ${formatDate(last)}`;
}

export type PeriodKey = "this_month" | "last_month" | "last_30" | "this_year" | "custom";

export function periodRange(key: PeriodKey, tz = DEFAULT_TZ): { from: string; to: string } {
  const today = todayISO(tz);
  if (key === "this_month") return monthRange(today);
  if (key === "last_month") {
    const { from } = monthRange(today);
    return monthRange(addDays(from, -1));
  }
  if (key === "last_30") return { from: addDays(today, -29), to: today };
  const y = today.slice(0, 4);
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}
