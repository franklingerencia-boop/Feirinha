"use client";

import { useMemo, useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { Button, Card, Field, InfoBox, Input, MoneyInput, PageHeader, Select } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { friendlyError } from "@/lib/errors";
import { formatBRL, formatPercent } from "@/lib/money";
import { computePricing, marginOf } from "@/lib/pricing";
import { getSupabase } from "@/lib/supabase/client";
import { must, useData } from "@/lib/use-data";

type P = { id: string; name: string; price_cents: number; cost_cents: number; packaging_cost_cents: number; other_cost_cents: number };

const pct = (v: string) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export default function PricingPage() {
  const { company } = useActiveCompany();
  const toast = useToast();
  const { data: products, reload } = useData(
    async () =>
      must(await getSupabase().from("products").select("id,name,price_cents,cost_cents,packaging_cost_cents,other_cost_cents").eq("company_id", company.id).eq("active", true).order("name")) as P[],
    [company.id],
  );
  const [productId, setProductId] = useState("");
  const [goods, setGoods] = useState<number | null>(0);
  const [packaging, setPackaging] = useState<number | null>(0);
  const [other, setOther] = useState<number | null>(0);
  const [fixedTotal, setFixedTotal] = useState<number | null>(0);
  const [units, setUnits] = useState("100");
  const [variable, setVariable] = useState("0");
  const [fee, setFee] = useState("3");
  const [margin, setMargin] = useState("30");
  const [markup, setMarkup] = useState("100");
  const [chosen, setChosen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = (id: string) => {
    setProductId(id);
    const p = products?.find((x) => x.id === id);
    if (p) {
      setGoods(p.cost_cents);
      setPackaging(p.packaging_cost_cents);
      setOther(p.other_cost_cents);
      setChosen(p.price_cents);
    }
  };

  const unitsN = Math.max(1, Math.round(pct(units)) || 1);
  const fixedPerUnit = Math.round((fixedTotal ?? 0) / unitsN);
  const unitCostCents = (goods ?? 0) + (packaging ?? 0) + (other ?? 0);
  const r = useMemo(
    () =>
      computePricing({
        unitCostCents,
        fixedPerUnitCents: fixedPerUnit,
        variablePct: pct(variable),
        paymentFeePct: pct(fee),
        marginPct: pct(margin),
        markupPct: pct(markup),
      }),
    [unitCostCents, fixedPerUnit, variable, fee, margin, markup],
  );
  const chosenInfo = chosen != null ? marginOf(chosen, r.baseCostCents, pct(variable), pct(fee)) : null;

  const apply = async () => {
    if (!productId || chosen == null) return;
    setBusy(true);
    const { error } = await getSupabase().from("products").update({ price_cents: chosen }).eq("id", productId);
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    toast.success("Preço atualizado. Vale para as próximas vendas.");
    reload();
  };

  return (
    <div>
      <PageHeader title="Precificação" description="Descubra um preço sugerido a partir dos seus custos, taxas e da margem que você deseja. O preço final é sempre decisão sua." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="1. Custos">
          <div className="space-y-3">
            <Field label="Carregar de um produto (opcional)">
              <Select value={productId} onChange={(e) => pick(e.target.value)}>
                <option value="">Simulação livre</option>
                {products?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Mercadoria/produção">
                <MoneyInput value={goods} onChange={setGoods} />
              </Field>
              <Field label="Embalagem">
                <MoneyInput value={packaging} onChange={setPackaging} />
              </Field>
              <Field label="Outros por unidade">
                <MoneyInput value={other} onChange={setOther} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Custos fixos a ratear" hint="Ex.: taxa da feira + combustível">
                <MoneyInput value={fixedTotal} onChange={setFixedTotal} />
              </Field>
              <Field label="Unidades que espera vender" hint={`Rateio: ${formatBRL(fixedPerUnit)} por unidade`}>
                <Input inputMode="numeric" value={units} onChange={(e) => setUnits(e.target.value)} />
              </Field>
            </div>
            <p className="rounded-xl bg-brand-50 p-3 text-sm">
              Custo base por unidade (C): <b>{formatBRL(r.baseCostCents)}</b>
            </p>
          </div>
        </Card>

        <Card title="2. Percentuais sobre o preço">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Despesas variáveis (%)" hint="Comissões, impostos sobre venda...">
              <Input inputMode="decimal" value={variable} onChange={(e) => setVariable(e.target.value)} />
            </Field>
            <Field label="Taxa de pagamento (%)" hint="Ex.: maquininha de cartão">
              <Input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
            </Field>
            <Field label="Margem de lucro desejada (%)" hint="Parte do PREÇO que vira lucro">
              <Input inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} />
            </Field>
            <Field label="Acréscimo sobre o custo (%)" hint="Quanto somar AO CUSTO (markup)">
              <Input inputMode="decimal" value={markup} onChange={(e) => setMarkup(e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card title="Preço pela margem de lucro">
          {r.byMargin.error ? (
            <InfoBox tone="danger">{r.byMargin.error}</InfoBox>
          ) : (
            <>
              <p className="text-4xl font-extrabold text-brand-600">{formatBRL(r.byMargin.priceCents)}</p>
              <p className="text-sm text-muted">Lucro por unidade: {formatBRL(r.byMargin.profitCents)}</p>
              <div className="mt-3 rounded-xl bg-cream p-3 font-mono text-xs ring-1 ring-line">
                Preço = C ÷ (1 − (despesas% + taxa% + margem%))
                <br />= {formatBRL(r.baseCostCents)} ÷ (1 − ({pct(variable)}% + {pct(fee)}% + {pct(margin)}%))
              </div>
              <Button className="mt-3" variant="secondary" size="sm" onClick={() => setChosen(r.byMargin.priceCents)}>
                Usar este preço
              </Button>
            </>
          )}
        </Card>

        <Card title="Preço pelo acréscimo sobre o custo (markup)">
          <p className="text-4xl font-extrabold text-leaf-600">{formatBRL(r.byMarkup.priceCents)}</p>
          <p className="text-sm text-muted">
            Lucro por unidade: {formatBRL(r.byMarkup.profitCents)} · margem real {formatPercent(r.byMarkup.realMarginPct)}
          </p>
          <div className="mt-3 rounded-xl bg-cream p-3 font-mono text-xs ring-1 ring-line">
            Preço = C × (1 + acréscimo%)
            <br />= {formatBRL(r.baseCostCents)} × (1 + {pct(markup)}%)
          </div>
          <Button className="mt-3" variant="secondary" size="sm" onClick={() => setChosen(r.byMarkup.priceCents)}>
            Usar este preço
          </Button>
        </Card>
      </div>

      <InfoBox tone="info" title="Margem ≠ acréscimo">
        <b>Margem</b> é a porcentagem do <b>preço de venda</b> que sobra como lucro. <b>Acréscimo (markup)</b> é quanto você soma em cima do <b>custo</b>.
        Exemplo: custo R$ 10,00 com 100% de acréscimo = preço R$ 20,00, mas a margem é 50% (R$ 10,00 de R$ 20,00) — e menor ainda depois das taxas.
      </InfoBox>

      <Card title="3. Seu preço" className="mt-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Preço que você vai praticar">
            <MoneyInput value={chosen} onChange={setChosen} />
          </Field>
          {chosenInfo && (
            <p className="text-sm">
              Lucro estimado: <b className={chosenInfo.profitCents < 0 ? "text-red-700" : "text-leaf-600"}>{formatBRL(chosenInfo.profitCents)}</b> por unidade ·
              margem {formatPercent(chosenInfo.marginPct)}
            </p>
          )}
          {productId && (
            <Button onClick={apply} loading={busy} disabled={chosen == null}>
              Aplicar ao produto
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
