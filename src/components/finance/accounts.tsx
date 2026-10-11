"use client";

import { Archive, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { Badge, Button, Card, Field, InfoBox, Input, Modal, MoneyInput, Select, Spinner, Table, Td, Th } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { formatDate, todayISO } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { ACCOUNT_KIND } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { getSupabase } from "@/lib/supabase/client";
import { must, useData } from "@/lib/use-data";

type Bal = {
  id: string;
  name: string;
  kind: string;
  archived: boolean;
  initial_cents: number;
  balance_cents: number;
  planned_in_cents: number;
  planned_out_cents: number;
};

export function AccountsTab() {
  const { company } = useActiveCompany();
  const toast = useToast();
  const [editing, setEditing] = useState<Bal | "new" | null>(null);
  const { data, loading, error, reload } = useData(async () => {
    const s = getSupabase();
    const bal = must(await s.rpc("account_balances", { p_company: company.id })) as Bal[];
    const flow = must(
      await s
        .from("transactions")
        .select("kind,status,amount_cents,paid_date,due_date")
        .eq("company_id", company.id)
        .neq("status", "canceled")
        .gte("due_date", todayISO(company.timezone).slice(0, 7) + "-01")
        .order("due_date"),
    ) as { kind: string; status: string; amount_cents: number; due_date: string }[];
    return { bal, flow };
  }, [company.id]);

  if (loading && !data) return <Spinner />;
  if (error) return <InfoBox tone="danger">{error}</InfoBox>;
  const active = (data?.bal ?? []).filter((b) => !b.archived);
  const total = active.reduce((a, b) => a + Number(b.balance_cents), 0);

  // Fluxo de caixa previsto por mês (a partir do mês atual)
  const months = new Map<string, { inSettled: number; outSettled: number; inPlanned: number; outPlanned: number }>();
  for (const t of data?.flow ?? []) {
    const m = t.due_date.slice(0, 7);
    const row = months.get(m) ?? { inSettled: 0, outSettled: 0, inPlanned: 0, outPlanned: 0 };
    const v = Number(t.amount_cents);
    if (t.kind === "income") t.status === "settled" ? (row.inSettled += v) : (row.inPlanned += v);
    else t.status === "settled" ? (row.outSettled += v) : (row.outPlanned += v);
    months.set(m, row);
  }
  let running = total;

  const archive = async (b: Bal) => {
    if (b.balance_cents !== 0 && !confirm("Esta conta ainda tem saldo. Arquivar mesmo assim? O histórico será mantido.")) return;
    const { error } = await getSupabase().from("accounts").update({ archived: !b.archived }).eq("id", b.id);
    if (error) return toast.error(friendlyError(error));
    reload();
  };

  return (
    <div className="space-y-4">
      <InfoBox>
        <b>Saldo disponível</b> é o dinheiro que está de fato nas contas: saldo inicial + recebimentos − pagamentos ± transferências. Valores previstos
        (a receber e a pagar) não entram no saldo até a baixa. Transferências entre contas não são receita nem despesa.
      </InfoBox>
      <Card
        title={`Saldo total disponível: ${formatBRL(total)}`}
        actions={
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>
            Nova conta
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(data?.bal ?? []).map((b) => (
            <div key={b.id} className={`rounded-2xl border border-line p-4 ${b.archived ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold">{b.name}</p>
                  <p className="text-xs text-muted">
                    {ACCOUNT_KIND[b.kind]} {b.archived && <Badge>Arquivada</Badge>}
                  </p>
                </div>
                <div className="flex">
                  <Button size="sm" variant="ghost" aria-label={`Editar ${b.name}`} onClick={() => setEditing(b)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={b.archived ? "Reativar" : "Arquivar"} onClick={() => archive(b)}>
                    <Archive className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className={`mt-2 text-2xl font-extrabold tabular-nums ${b.balance_cents < 0 ? "text-red-700" : ""}`}>{formatBRL(b.balance_cents)}</p>
              <p className="text-xs text-muted">
                A receber {formatBRL(b.planned_in_cents)} · a pagar {formatBRL(b.planned_out_cents)}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Fluxo de caixa por mês">
        {months.size === 0 ? (
          <p className="text-sm text-muted">Sem lançamentos a partir deste mês.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Mês</Th>
                <Th className="text-right">Entradas</Th>
                <Th className="text-right">Saídas</Th>
                <Th className="text-right">Previsto a entrar</Th>
                <Th className="text-right">Previsto a sair</Th>
                <Th className="text-right">Saldo projetado</Th>
              </tr>
            </thead>
            <tbody>
              {[...months.entries()].map(([m, r]) => {
                running += r.inPlanned - r.outPlanned;
                return (
                  <tr key={m}>
                    <Td className="font-semibold">{formatDate(m + "-01").slice(3)}</Td>
                    <Td className="text-right tabular-nums text-leaf-600">{formatBRL(r.inSettled)}</Td>
                    <Td className="text-right tabular-nums text-red-700">{formatBRL(r.outSettled)}</Td>
                    <Td className="text-right tabular-nums">{formatBRL(r.inPlanned)}</Td>
                    <Td className="text-right tabular-nums">{formatBRL(r.outPlanned)}</Td>
                    <Td className={`text-right font-bold tabular-nums ${running < 0 ? "text-red-700" : ""}`}>{formatBRL(running)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <p className="mt-2 text-xs text-muted">Saldo projetado = saldo disponível hoje + previstos a receber − previstos a pagar, acumulado mês a mês.</p>
      </Card>
      {editing && <AccountDialog account={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </div>
  );
}

function AccountDialog({ account, onClose, onSaved }: { account: Bal | null; onClose: () => void; onSaved: () => void }) {
  const { company } = useActiveCompany();
  const toast = useToast();
  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState(account?.kind ?? "bank");
  const [initial, setInitial] = useState<number | null>(account?.initial_cents ?? 0);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (name.trim().length < 2) return toast.error("Informe o nome da conta.");
    setBusy(true);
    const s = getSupabase();
    const payload = { name: name.trim(), kind, initial_balance_cents: initial ?? 0 };
    const { error } = account
      ? await s.from("accounts").update(payload).eq("id", account.id)
      : await s.from("accounts").insert({ ...payload, company_id: company.id, initial_balance_date: todayISO(company.timezone) });
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    toast.success("Conta salva.");
    onSaved();
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={account ? "Editar conta" : "Nova conta"}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={busy}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Nome" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Nubank, Caixa da feira" />
        </Field>
        <Field label="Tipo">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(ACCOUNT_KIND).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Saldo inicial" hint="Quanto havia na conta quando você começou a usar o app">
          <MoneyInput value={initial} onChange={setInitial} />
        </Field>
      </div>
    </Modal>
  );
}
