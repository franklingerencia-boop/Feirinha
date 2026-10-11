"use client";

import { Receipt } from "lucide-react";
import { useMemo, useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { PeriodFilter, usePeriod } from "@/components/shared/filters";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, InfoBox, PageHeader, Select, Spinner, Stat } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { formatDateTime, rangeLabel } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { formatBRL } from "@/lib/money";
import { getSupabase } from "@/lib/supabase/client";
import { must, useData } from "@/lib/use-data";

type Sale = {
  id: string;
  number: number;
  sold_at: string;
  total_cents: number;
  discount_cents: number;
  payment_method_name: string;
  status: "completed" | "canceled";
  cancel_reason: string | null;
  fair_edition_id: string | null;
  items: { name: string; quantity: number; unit_price_cents: number; total_cents: number }[];
};

export default function SalesHistoryPage() {
  const { company, canFinance } = useActiveCompany();
  const toast = useToast();
  const period = usePeriod(company.timezone, "this_month");
  const [edition, setEdition] = useState("");
  const [status, setStatus] = useState("all");
  const [cancelling, setCancelling] = useState<Sale | null>(null);

  const { data, loading, error, reload } = useData(async () => {
    const s = getSupabase();
    const sales = must(await s.rpc("sales_history", { p_company: company.id, p_from: period.range.from, p_to: period.range.to })) as Sale[];
    const eds = must(await s.rpc("pos_editions", { p_company: company.id })) as { id: string; fair_name: string; first_day: string | null; last_day: string | null }[];
    return { sales, eds };
  }, [company.id, period.range.from, period.range.to]);

  const list = useMemo(
    () => (data?.sales ?? []).filter((x) => (!edition || (edition === "none" ? !x.fair_edition_id : x.fair_edition_id === edition)) && (status === "all" || x.status === status)),
    [data, edition, status],
  );
  const done = list.filter((x) => x.status === "completed");
  const total = done.reduce((a, x) => a + Number(x.total_cents), 0);
  const edName = (id: string | null) => data?.eds.find((e) => e.id === id)?.fair_name;

  return (
    <div>
      <PageHeader title="Histórico de vendas" description="Vendas registradas, com itens e forma de pagamento. Cancelamentos ficam registrados com o motivo." />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <PeriodFilter period={period} />
        <Field label="Feira" className="min-w-48">
          <Select value={edition} onChange={(e) => setEdition(e.target.value)}>
            <option value="">Todas</option>
            <option value="none">Fora de feira</option>
            {data?.eds.map((e) => (
              <option key={e.id} value={e.id}>
                {e.fair_name} · {rangeLabel(e.first_day, e.last_day)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Situação">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Todas</option>
            <option value="completed">Concluídas</option>
            <option value="canceled">Canceladas</option>
          </Select>
        </Field>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Vendas concluídas" value={done.length} />
        <Stat label="Total vendido" value={formatBRL(total)} tone="brand" />
        <Stat label="Ticket médio" value={formatBRL(done.length ? Math.round(total / done.length) : 0)} />
      </div>
      {loading && <Spinner />}
      {error && <InfoBox tone="danger">{error}</InfoBox>}
      {data && list.length === 0 && <EmptyState icon={<Receipt className="h-10 w-10" />} title="Nenhuma venda no período" />}
      <div className="space-y-2">
        {list.map((x) => (
          <Card key={x.id} className={x.status === "canceled" ? "opacity-70" : ""}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-bold">
                  Venda nº {x.number} <span className="font-normal text-muted">· {formatDateTime(x.sold_at, company.timezone)}</span>
                </p>
                <p className="text-sm text-muted">
                  {x.payment_method_name}
                  {x.fair_edition_id && ` · ${edName(x.fair_edition_id) ?? "Feira"}`}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-xl font-extrabold tabular-nums ${x.status === "canceled" ? "line-through" : ""}`}>{formatBRL(x.total_cents)}</p>
                {x.discount_cents > 0 && <p className="text-xs text-muted">desconto {formatBRL(x.discount_cents)}</p>}
              </div>
            </div>
            <ul className="mt-2 text-sm">
              {x.items.map((i, k) => (
                <li key={k} className="flex justify-between gap-2">
                  <span>
                    {Number(i.quantity)} × {i.name} <span className="text-muted">({formatBRL(i.unit_price_cents)})</span>
                  </span>
                  <span className="tabular-nums">{formatBRL(i.total_cents)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              {x.status === "canceled" ? <Badge tone="danger">Cancelada: {x.cancel_reason}</Badge> : <Badge tone="success">Concluída</Badge>}
              {x.status === "completed" && canFinance && (
                <Button size="sm" variant="secondary" onClick={() => setCancelling(x)}>
                  Cancelar venda
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
      <ConfirmDialog
        open={!!cancelling}
        title={`Cancelar venda nº ${cancelling?.number}?`}
        message="O lançamento financeiro desta venda será cancelado (e a taxa de pagamento, se houver). A venda continua no histórico como cancelada."
        confirmLabel="Cancelar venda"
        requireReason
        reasonLabel="Motivo do cancelamento"
        onClose={() => setCancelling(null)}
        onConfirm={async (reason) => {
          const { error } = await getSupabase().rpc("cancel_sale", { p_sale: cancelling!.id, p_reason: reason });
          if (error) return toast.error(friendlyError(error));
          toast.success("Venda cancelada.");
          setCancelling(null);
          reload();
        }}
      />
    </div>
  );
}
