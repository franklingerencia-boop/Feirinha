"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { SettleDialog, type SettleTarget } from "@/components/shared/settle-dialog";
import { TransactionDialog } from "@/components/shared/transaction-form";
import { Badge, Button, Card, InfoBox, Stat, Table, Td, Th } from "@/components/ui/ui";
import { formatDate } from "@/lib/dates";
import { STATUS_TONE, TX_STATUS } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { getSupabase } from "@/lib/supabase/client";
import { must, useData } from "@/lib/use-data";
import type { EventBundle } from "./types";

type Tx = { id: string; kind: "income" | "expense"; status: string; description: string; amount_cents: number; due_date: string; paid_date: string | null; source_type: string; account_id: string | null; fin_categories: { name: string } | null };

export function CostsTab({ b }: { b: EventBundle }) {
  const { company } = useActiveCompany();
  const [open, setOpen] = useState(false);
  const [settle, setSettle] = useState<SettleTarget | null>(null);
  const { data, reload } = useData(
    async () => must(await getSupabase().from("transactions").select("*, fin_categories(name)").eq("company_id", company.id).eq("event_id", b.event.id).order("due_date")) as Tx[],
    [b.event.id],
  );
  const txs = (data ?? []).filter((t) => t.status !== "canceled");
  const costs = txs.filter((t) => t.kind === "expense");
  const costTotal = costs.reduce((a, t) => a + Number(t.amount_cents), 0);
  const costPaid = costs.filter((t) => t.status === "settled").reduce((a, t) => a + Number(t.amount_cents), 0);
  const otherIncome = txs.filter((t) => t.kind === "income" && t.source_type !== "charge_payment").reduce((a, t) => a + Number(t.amount_cents), 0);
  const feesExpected = b.participants.filter((p) => p.status !== "canceled").reduce((a, p) => a + Number(p.total_cents), 0);
  const feesReceived = b.participants.reduce((a, p) => a + Number(p.paid_cents), 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Receita de taxas (prevista)" value={formatBRL(feesExpected)} hint={`Recebido ${formatBRL(feesReceived)}`} />
        <Stat label="Custos do evento" value={formatBRL(costTotal)} hint={`Pagos ${formatBRL(costPaid)}`} />
        <Stat label="Resultado previsto" value={formatBRL(feesExpected + otherIncome - costTotal)} tone={feesExpected + otherIncome - costTotal >= 0 ? "good" : "bad"} />
        <Stat label="Resultado realizado" value={formatBRL(feesReceived - costPaid)} tone={feesReceived - costPaid >= 0 ? "good" : "bad"} hint="Recebido − custos pagos" />
      </div>
      <Card
        title="Custos e outras receitas do evento"
        actions={
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>
            Lançar custo
          </Button>
        }
      >
        <InfoBox>Montagem, aluguel de mesas e cadeiras, shows, taxas da prefeitura, limpeza, segurança, divulgação, energia, água… Registre como previsto e dê baixa quando pagar.</InfoBox>
        {txs.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nenhum custo lançado.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Descrição</Th>
                <Th>Categoria</Th>
                <Th>Vencimento</Th>
                <Th>Situação</Th>
                <Th className="text-right">Valor</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((t) => (
                <tr key={t.id} className={t.status === "canceled" ? "opacity-50" : ""}>
                  <Td>{t.description}</Td>
                  <Td>{t.fin_categories?.name ?? "—"}</Td>
                  <Td>{formatDate(t.due_date)}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[t.status]}>{TX_STATUS[t.status]}</Badge>
                  </Td>
                  <Td className={`text-right tabular-nums ${t.kind === "income" ? "text-leaf-600" : "text-red-700"}`}>
                    {t.kind === "income" ? "+" : "−"} {formatBRL(t.amount_cents)}
                  </Td>
                  <Td className="text-right">
                    {t.status === "planned" && (
                      <Button size="sm" variant="success" onClick={() => setSettle(t)}>
                        {t.kind === "income" ? "Receber" : "Pagar"}
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <TransactionDialog open={open} onClose={() => setOpen(false)} onSaved={reload} defaults={{ kind: "expense", event_id: b.event.id }} />
      <SettleDialog target={settle} onClose={() => setSettle(null)} onDone={reload} />
    </div>
  );
}
