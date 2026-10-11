// Dinheiro sempre em centavos (inteiros) para evitar erros de arredondamento.

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(cents: number | string | null | undefined): string {
  const n = Number(cents ?? 0);
  return brl.format((Number.isFinite(n) ? n : 0) / 100);
}

/** Converte texto digitado ("1.234,56", "12,5", "R$ 10") em centavos. Retorna null se inválido. */
export function parseBRL(input: string): number | null {
  if (input == null) return null;
  let s = String(input).trim().replace(/[R$\s]/g, "");
  if (s === "") return null;
  const negative = s.startsWith("-");
  s = s.replace(/^-/, "");
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [int, dec = ""] = s.split(".");
  const cents = Number(int) * 100 + Number((dec + "00").slice(0, 2));
  return negative ? -cents : cents;
}

/** Formata centavos para edição em campo de texto ("1234,56"). */
export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  const n = Number(cents);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

/** Arredondamento bancário-simples (meio para cima) de valores em centavos. */
export function roundCents(value: number): number {
  return Math.round(value + Number.EPSILON * Math.sign(value));
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: digits })}%`;
}

/** Total de taxa de participação: por dia multiplica pelos dias; valor único cobra uma vez. */
export function feeTotal(mode: "per_day" | "per_event", feeCents: number, days: number, discountCents = 0): number {
  const gross = mode === "per_day" ? feeCents * days : feeCents;
  return Math.max(0, gross - discountCents);
}
