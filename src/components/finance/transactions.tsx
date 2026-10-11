"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { PeriodFilter, usePeriod } from "@/components/shared/filters";
import { SettleDialog, type SettleTarget } from "@/components/shared/settle-dialog";
import { TransactionDialog } from "@/components/shared/transaction-form";
import { Badge, Button, ConfirmDialog, EmptyState, Field, InfoBox, Select, Spinner, Stat, Table, Td, Th } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { formatDate, todayISO } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { STATUS_TONE, TX_STATUS } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { getSupabase } from "@/lib/supabase/client";
import { must, useData } from "@/lib/use-data";

type Tx = {
  id: string;
  kind: "income" | "expense";
  status: "planned" | "settled" | "canceled";
  description: string;
  amount_cents: number;
  due_date: string;
  paid_date: string | null;
  competence_date: string;
  source_type: string;
  is_stock_purchase: boolean;
  cancel_reason: string | null;
  account_id: string | null;
  fin_categories: { name: string } | null;
  accounts: { name: string } | null;
  fair_editions: { name: string; fairs: { name: string } } | null;
  events: { name: string } | null;
};

const SOURCE: Record<string, string> = {
  manual: "Manual",
  sale: "Venda",
  sale_fee: "Taxa de pagamento",
  fair_fee: "Taxa de feira",
  fair_fee_reopen: "Taxa de feira",
  charge_payment: "Pagamento de participante",
  recurring: "Recorrente",
};

/** Lançamentos; mode "payables"/"receivables" mostra só os previstos em aberto. */
export function TransactionsTab({ mode }: { mode: "all" | "payables" | "receivables" }) {
  const { company } = useActiveCompany();
  const toast = useToast();
  const today = todayISO(company.timezone);
  const period = usePeriod(company.timezone, "this_month");
  const [kind, setKind] = useState(mode === "payables" ? "expense" : mode === "receivables" ? "income" : "");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [settle, setSettle] = useState<SettleTarget | null>(null);
  const [cancelling, setCancelling] = useState<Tx | null>(null);
  const isOpenMode = mode !== "all";

  const { data, loading, error, reload } = useData(async () => {
    let q = getSupabase()
      .from("transactions")
      .select("*, fin_categories(name), accounts(name), fair_editions(name, fairs(name)), events(name)")
      .eq("company_id", company.id);
    if (isOpenMode) q = q.eq("status", "planned").eq("kind", mode === "payables" ? "expense" : "income").order("due_date");
    else q = q.gte("competence_date", period.range.from).lte("competence_date", period.range.to).order("competence_date", { ascending: false });
    return must(await q.limit(1000)) as Tx[];
  }, [company.id, mode, period.range.from, period.range.to]);

  const list = useMemo(() => (data ?? []).filter((t) => (!kind || t.kind === kind) && (!status || t.status === status)), [data, kind, status]);
  const sum = (f: (t: Tx) => boolean) => list.filter(f).reduce((a, t) => a + Number(t.amount_cents), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-wrap items-end gap-2">
          {!isOpenMode && <PeriodFilter period={period} />}
          {!isOpenMode && (
            <>
              <Field label="Tipo">
                <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="">Receitas e despesas</option>
                  <option value="income">Receitas</option>
                  <option value="expense">Despesas</option>
                </Select>
              </Field>
              <Field label="Situação">
                <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">Todas</option>
                  <option value="planned">Previstos</option>
                  <option value="settled">Realizados</option>
                  <option value="canceled">Cancelados</option>
                </Select>
              </Field>
            </>
          )}
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>
          Novo lançamento
        </Button>
      </div>

      {isOpenMode ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label={mode === "payables" ? "Total a pagar" : "Total a receber"} value={formatBRL(sum(() => true))} />
          <Stat label="Vencidos" value={formatBRL(sum((t) => t.due_date < today))} tone={sum((t) => t.due_date < today) > 0 ? "bad" : "neutral"} />
          <Stat label="Próximos 7 dias" value={formatBRL(sum((t) => t.due_date >= today && t.due_date <= addDaysIso(today, 7)))} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Receitas realizadas" value={formatBRL(sum((t) => t.kind === "income" && t.status === "settled"))} tone="good" />
          <Stat label="Despesas realizadas" value={formatBRL(sum((t) => t.kind === "expense" && t.status === "settled"))} tone="bad" />
          <Stat label="Receitas previstas" value={formatBRL(sum((t) => t.kind === "income" && t.status === "planned"))} />
          <Stat label="Despesas previstas" value={formatBRL(sum((t) => t.kind === "expense" && t.status === "planned"))} />
        </div>
      )}

      {loading && <Spinner />}
      {error && <InfoBox tone="danger">{error}</InfoBox>}
      {data && list.length === 0 && <EmptyState title={isOpenMode ? "Nada em aberto" : "Nenhum lançamento no período"} />}
      {list.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th>{isOpenMode ? "Vencimento" : "Data"}</Th>
              <Th>Descrição</Th>
              <Th>Categoria</Th>
              <Th>Conta</Th>
              <Th>Situação</Th>
              <Th className="text-right">Valor</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {list.map((t) => {
              const overdue = t.status === "planned" && t.due_date < today;
              return (
                <tr key={t.id} className={t.status === "canceled" ? "opacity-50" : ""}>
                  <Td className={`whitespace-nowrap ${overdue ? "font-bold text-red-700" : ""}`}>
                    {formatDate(t.status === "settled" ? t.paid_date : t.due_date)}
                    {overdue && <span className="block text-xs">vencido</span>}
                  </Td>
                  <Td>
                    <span className={t.status === "canceled" ? "line-through" : ""}>{t.description}</span>
                    <span className="block text-xs text-muted">
                      {SOURCE[t.source_type] ?? t.source_type}
                      {t.fair_editions && ` · ${t.fair_editions.fairs.name}`}
                      {t.events && ` · ${t.events.name}`}
                      {t.is_stock_purchase && " · compra de estoque"}
                      {t.cancel_reason && ` · ${t.cancel_reason}`}
                    </span>
                  </Td>
                  <Td>{t.fin_categories?.name ?? "—"}</Td>
                  <Td>{t.accounts?.name ?? "—"}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[t.status]}>{TX_STATUS[t.status]}</Badge>
                  </Td>
                  <Td className={`whitespace-nowrap text-right font-semibold tabular-nums ${t.kind === "income" ? "text-leaf-600" : "text-red-700"}`}>
                    {t.kind === "income" ? "+" : "−"} {formatBRL(t.amount_cents)}
                  </Td>
                  <Td className="whitespace-nowrap text-right">
                    {t.status === "planned" && (
                      <Button size="sm" variant="success" onClick={() => setSettle(t)}>
                        {t.kind === "income" ? "Receber" : "Pagar"}
                      </Button>
                    )}
                    {t.status !== "canceled" && ["manual", "recurring", "fair_fee", "fair_fee_reopen"].includes(t.source_type) && (
                      <Button size="sm" variant="ghost" onClick={() => setCancelling(t)}>
                        Cancelar
                      </Button>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <p className="text-xs text-muted">Lançamentos de vendas e de pagamentos de participantes são cancelados pela própria origem, para manter o histórico consistente.</p>
      <TransactionDialog open={open} onClose={() => setOpen(false)} onSaved={reload} defaults={{ kind: mode === "receivables" ? "income" : "expense" }} />
      <SettleDialog target={settle} onClose={() => setSettle(null)} onDone={reload} />
      <ConfirmDialog
        open={!!cancelling}
        title="Cancelar lançamento?"
        message="O lançamento continua no histórico como cancelado e deixa de contar nos saldos e no resultado."
        confirmLabel="Cancelar lançamento"
        requireReason
        onClose={() => setCancelling(null)}
        onConfirm={async (reason) => {
          const { error } = await getSupabase().from("transactions").update({ status: "canceled", cancel_reason: reason }).eq("id", cancelling!.id);
          if (error) return toast.error(friendlyError(error));
          toast.success("Lançamento cancelado.");
          setCancelling(null);
          reload();
        }}
      />
    </div>
  );
}

function addDaysIso(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
