"use client";

import { ArrowRight, Plus } from "lucide-react";
import { useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { Badge, Button, ConfirmDialog, EmptyState, Field, InfoBox, Input, Modal, MoneyInput, Select, Spinner, Table, Td, Th } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { formatDate, todayISO } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { formatBRL } from "@/lib/money";
import { getSupabase } from "@/lib/supabase/client";
import { must, newIdempotencyKey, useData } from "@/lib/use-data";

type Tr = {
  id: string;
  amount_cents: number;
  transfer_date: string;
  description: string | null;
  canceled_at: string | null;
  cancel_reason: string | null;
  from: { name: string };
  to: { name: string };
};

export function TransfersTab() {
  const { company } = useActiveCompany();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState<Tr | null>(null);
  const { data, loading, error, reload } = useData(async () => {
    const s = getSupabase();
    const list = must(
      await s
        .from("transfers")
        .select("id,amount_cents,transfer_date,description,canceled_at,cancel_reason, from:accounts!transfers_from_account_id_fkey(name), to:accounts!transfers_to_account_id_fkey(name)")
        .eq("company_id", company.id)
        .order("transfer_date", { ascending: false })
        .limit(300),
    ) as unknown as Tr[];
    const accounts = must(await s.from("accounts").select("id,name").eq("company_id", company.id).eq("archived", false).order("name")) as { id: string; name: string }[];
    return { list, accounts };
  }, [company.id]);

  return (
    <div className="space-y-4">
      <InfoBox>Transferências movem dinheiro entre suas contas (ex.: do caixa para o banco). Elas alteram os saldos, mas não contam como receita nem despesa.</InfoBox>
      <div className="flex justify-end">
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)} disabled={(data?.accounts.length ?? 0) < 2}>
          Nova transferência
        </Button>
      </div>
      {data && data.accounts.length < 2 && <p className="text-sm text-muted">Cadastre pelo menos duas contas para transferir.</p>}
      {loading && <Spinner />}
      {error && <InfoBox tone="danger">{error}</InfoBox>}
      {data && data.list.length === 0 && <EmptyState title="Nenhuma transferência" />}
      {data && data.list.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>De → Para</Th>
              <Th>Descrição</Th>
              <Th className="text-right">Valor</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {data.list.map((t) => (
              <tr key={t.id} className={t.canceled_at ? "opacity-50" : ""}>
                <Td>{formatDate(t.transfer_date)}</Td>
                <Td>
                  <span className="inline-flex items-center gap-1">
                    {t.from?.name} <ArrowRight className="h-3 w-3" /> {t.to?.name}
                  </span>
                </Td>
                <Td>
                  {t.description}
                  {t.canceled_at && <Badge tone="danger">Cancelada: {t.cancel_reason}</Badge>}
                </Td>
                <Td className="text-right font-semibold tabular-nums">{formatBRL(t.amount_cents)}</Td>
                <Td className="text-right">
                  {!t.canceled_at && (
                    <Button size="sm" variant="ghost" onClick={() => setCancelling(t)}>
                      Cancelar
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {open && data && <TransferDialog accounts={data.accounts} onClose={() => setOpen(false)} onSaved={reload} />}
      <ConfirmDialog
        open={!!cancelling}
        title="Cancelar transferência?"
        message="Os saldos das duas contas voltam ao que eram antes. A transferência fica no histórico como cancelada."
        confirmLabel="Cancelar transferência"
        requireReason
        onClose={() => setCancelling(null)}
        onConfirm={async (reason) => {
          const { error } = await getSupabase().from("transfers").update({ canceled_at: new Date().toISOString(), cancel_reason: reason }).eq("id", cancelling!.id);
          if (error) return toast.error(friendlyError(error));
          toast.success("Transferência cancelada.");
          setCancelling(null);
          reload();
        }}
      />
    </div>
  );
}

function TransferDialog({ accounts, onClose, onSaved }: { accounts: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const { company } = useActiveCompany();
  const toast = useToast();
  const [from, setFrom] = useState(accounts[0]?.id ?? "");
  const [to, setTo] = useState(accounts[1]?.id ?? "");
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO(company.timezone));
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [idem] = useState(() => newIdempotencyKey("tr"));
  const save = async () => {
    if (from === to) return toast.error("Escolha contas diferentes.");
    if (!amount || amount <= 0) return toast.error("Informe o valor.");
    setBusy(true);
    const { error } = await getSupabase()
      .from("transfers")
      .insert({ company_id: company.id, from_account_id: from, to_account_id: to, amount_cents: amount, transfer_date: date, description: description || null, idempotency_key: idem });
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    toast.success("Transferência registrada.");
    onSaved();
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Nova transferência"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={busy}>
            Transferir
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="De (sai de)">
          <Select value={from} onChange={(e) => setFrom(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Para (entra em)">
          <Select value={to} onChange={(e) => setTo(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Valor">
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="Data">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Descrição (opcional)">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Depósito do caixa da feira" />
        </Field>
      </div>
    </Modal>
  );
}
