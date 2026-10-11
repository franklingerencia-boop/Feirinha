"use client";

import { useEffect, useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { Badge, Button, ConfirmDialog, Field, InfoBox, Input, Modal, MoneyInput, Select, Stat, Table, Td, Th } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { formatDate, todayISO } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { formatBRL } from "@/lib/money";
import { getSupabase } from "@/lib/supabase/client";
import { must, newIdempotencyKey, useData } from "@/lib/use-data";
import type { EventBundle, Participant } from "./types";

type Payment = { id: string; participant_id: string; amount_cents: number; paid_date: string; method: string | null; canceled_at: string | null; cancel_reason: string | null; accounts: { name: string } | null };

export function ChargesTab({ b, reload }: { b: EventBundle; reload: () => void }) {
  const { company } = useActiveCompany();
  const toast = useToast();
  const today = todayISO(company.timezone);
  const [paying, setPaying] = useState<Participant | null>(null);
  const [cancelling, setCancelling] = useState<Payment | null>(null);
  const [filter, setFilter] = useState("open");
  const ids = b.participants.map((p) => p.id);
  const { data: payments, reload: reloadPayments } = useData(
    async () =>
      ids.length
        ? (must(await getSupabase().from("participant_payments").select("*, accounts(name)").in("participant_id", ids).order("paid_date")) as Payment[])
        : [],
    [ids.join(",")],
  );

  const active = b.participants.filter((p) => p.status !== "canceled" || p.paid_cents > 0);
  const rows = active
    .map((p) => {
      const balance = Math.max(0, (p.status === "canceled" ? 0 : Number(p.total_cents)) - Number(p.paid_cents));
      const overdue = balance > 0 && !!p.due_date && p.due_date < today;
      return { p, balance, overdue };
    })
    .filter((r) => (filter === "open" ? r.balance > 0 : filter === "overdue" ? r.overdue : true));
  const sumExpected = b.participants.filter((p) => p.status !== "canceled").reduce((a, p) => a + Number(p.total_cents), 0);
  const sumPaid = b.participants.reduce((a, p) => a + Number(p.paid_cents), 0);
  const sumOverdue = active.reduce((a, p) => {
    const bal = Math.max(0, (p.status === "canceled" ? 0 : Number(p.total_cents)) - Number(p.paid_cents));
    return a + (bal > 0 && p.due_date && p.due_date < today ? bal : 0);
  }, 0);

  const refresh = () => {
    reload();
    reloadPayments();
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Taxas previstas" value={formatBRL(sumExpected)} />
        <Stat label="Recebido" value={formatBRL(sumPaid)} tone="good" />
        <Stat label="A receber" value={formatBRL(Math.max(0, sumExpected - sumPaid))} />
        <Stat label="Em atraso" value={formatBRL(sumOverdue)} tone={sumOverdue > 0 ? "bad" : "neutral"} />
      </div>
      <Field label="Mostrar" className="max-w-xs">
        <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="open">Com saldo em aberto</option>
          <option value="overdue">Inadimplentes (vencidos)</option>
          <option value="all">Todos</option>
        </Select>
      </Field>
      <Table>
        <thead>
          <tr>
            <Th>Participante</Th>
            <Th>Vencimento</Th>
            <Th className="text-right">Combinado</Th>
            <Th className="text-right">Pago</Th>
            <Th className="text-right">Saldo</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <Td colSpan={6} className="text-center text-muted">
                Nada por aqui.
              </Td>
            </tr>
          )}
          {rows.map(({ p, balance, overdue }) => (
            <tr key={p.id}>
              <Td>
                <span className="font-semibold">{p.trade_name}</span>
                {p.status === "canceled" && <Badge tone="danger">Cancelado</Badge>}
                <ul className="text-xs text-muted">
                  {(payments ?? [])
                    .filter((x) => x.participant_id === p.id)
                    .map((x) => (
                      <li key={x.id} className={x.canceled_at ? "line-through" : ""}>
                        {formatDate(x.paid_date)}: {formatBRL(x.amount_cents)} {x.method && `(${x.method})`} → {x.accounts?.name}
                        {!x.canceled_at && (
                          <button className="ml-1 text-red-700 hover:underline" onClick={() => setCancelling(x)}>
                            estornar
                          </button>
                        )}
                      </li>
                    ))}
                </ul>
              </Td>
              <Td className={overdue ? "font-bold text-red-700" : ""}>
                {formatDate(p.due_date)}
                {overdue && <span className="block text-xs">em atraso</span>}
              </Td>
              <Td className="text-right tabular-nums">{formatBRL(p.total_cents)}</Td>
              <Td className="text-right tabular-nums">{formatBRL(p.paid_cents)}</Td>
              <Td className="text-right font-bold tabular-nums">{formatBRL(balance)}</Td>
              <Td className="text-right">
                {balance > 0 && (
                  <Button size="sm" variant="success" onClick={() => setPaying(p)}>
                    Registrar pagamento
                  </Button>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {paying && <PaymentDialog participant={paying} onClose={() => setPaying(null)} onSaved={refresh} />}
      <ConfirmDialog
        open={!!cancelling}
        title="Estornar pagamento?"
        message="O pagamento fica no histórico como cancelado e a receita correspondente é cancelada no financeiro."
        confirmLabel="Estornar"
        requireReason
        onClose={() => setCancelling(null)}
        onConfirm={async (reason) => {
          const { error } = await getSupabase().from("participant_payments").update({ canceled_at: new Date().toISOString(), cancel_reason: reason }).eq("id", cancelling!.id);
          if (error) return toast.error(friendlyError(error));
          toast.success("Pagamento estornado.");
          setCancelling(null);
          refresh();
        }}
      />
    </div>
  );
}

function PaymentDialog({ participant, onClose, onSaved }: { participant: Participant; onClose: () => void; onSaved: () => void }) {
  const { company } = useActiveCompany();
  const toast = useToast();
  const balance = Math.max(0, Number(participant.total_cents) - Number(participant.paid_cents));
  const [amount, setAmount] = useState<number | null>(balance);
  const [date, setDate] = useState(todayISO(company.timezone));
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [accountId, setAccountId] = useState("");
  const [method, setMethod] = useState("Pix");
  const [busy, setBusy] = useState(false);
  const [idem] = useState(() => newIdempotencyKey("pay"));
  useEffect(() => {
    getSupabase()
      .from("accounts")
      .select("id,name")
      .eq("company_id", company.id)
      .eq("archived", false)
      .order("name")
      .then(({ data }) => {
        setAccounts(data ?? []);
        setAccountId(data?.[0]?.id ?? "");
      });
  }, [company.id]);
  const save = async () => {
    if (!amount || amount <= 0) return toast.error("Informe o valor.");
    if (!accountId) return toast.error("Escolha a conta.");
    setBusy(true);
    const { error } = await getSupabase()
      .from("participant_payments")
      .insert({ company_id: company.id, participant_id: participant.id, amount_cents: amount, paid_date: date, account_id: accountId, method, idempotency_key: idem });
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    toast.success(amount < balance ? "Pagamento parcial registrado." : "Pagamento registrado.");
    onSaved();
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Pagamento de ${participant.trade_name}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="success" onClick={save} loading={busy}>
            Registrar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm">
          Saldo em aberto: <b>{formatBRL(balance)}</b>. Pode ser registrado em parcelas.
        </p>
        <Field label="Valor recebido">
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        {amount != null && amount > balance && <InfoBox tone="warning">O valor é maior que o saldo em aberto.</InfoBox>}
        <Field label="Data">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Conta que recebeu">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Forma">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {["Pix", "Dinheiro", "Transferência", "Cartão", "Boleto", "Outro"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
