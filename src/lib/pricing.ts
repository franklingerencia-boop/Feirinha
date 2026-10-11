// Precificação: diferencia MARGEM de lucro (sobre o preço de venda) de
// ACRÉSCIMO (markup) sobre o custo. Todos os valores monetários em centavos.

export type PricingInput = {
  unitCostCents: number; // mercadoria/produção + embalagem + outros custos por unidade
  fixedPerUnitCents: number; // rateio de custos fixos por unidade (ex.: taxa da feira ÷ unidades previstas)
  variablePct: number; // despesas variáveis sobre o preço (%), ex.: comissão
  paymentFeePct: number; // taxa da forma de pagamento (%), ex.: maquininha
  marginPct: number; // margem de lucro desejada sobre o preço (%)
  markupPct: number; // acréscimo sobre o custo (%)
};

export type PricingResult = {
  baseCostCents: number;
  byMargin: { priceCents: number | null; profitCents: number | null; error?: string };
  byMarkup: { priceCents: number; profitCents: number; realMarginPct: number };
};

export function computePricing(i: PricingInput): PricingResult {
  const base = i.unitCostCents + i.fixedPerUnitCents;
  const pctSum = i.variablePct + i.paymentFeePct + i.marginPct;

  let byMargin: PricingResult["byMargin"];
  if (pctSum >= 100) {
    byMargin = {
      priceCents: null,
      profitCents: null,
      error: "A soma de despesas variáveis, taxa e margem precisa ser menor que 100%.",
    };
  } else {
    // Preço = Custo ÷ (1 − (despesas% + taxa% + margem%))
    const price = Math.ceil(base / (1 - pctSum / 100));
    const profit = Math.round(price * (i.marginPct / 100));
    byMargin = { priceCents: price, profitCents: profit };
  }

  // Preço = Custo × (1 + acréscimo%)
  const markupPrice = Math.ceil(base * (1 + i.markupPct / 100));
  const deductions = Math.round(markupPrice * ((i.variablePct + i.paymentFeePct) / 100));
  const markupProfit = markupPrice - base - deductions;
  const realMargin = markupPrice > 0 ? (markupProfit / markupPrice) * 100 : 0;

  return {
    baseCostCents: base,
    byMargin,
    byMarkup: { priceCents: markupPrice, profitCents: markupProfit, realMarginPct: realMargin },
  };
}

/** Margem real de um preço informado, descontando custos e percentuais variáveis. */
export function marginOf(priceCents: number, baseCostCents: number, variablePct: number, paymentFeePct: number) {
  if (priceCents <= 0) return { profitCents: -baseCostCents, marginPct: 0 };
  const deductions = Math.round(priceCents * ((variablePct + paymentFeePct) / 100));
  const profit = priceCents - baseCostCents - deductions;
  return { profitCents: profit, marginPct: (profit / priceCents) * 100 };
}
