"use client";

import { useEffect, useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { Button, Field, InfoBox, Input, Modal, Select } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { todayISO } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { formatBRL } from "@/lib/money";
import { getSupabase } from "@/lib/supabase/client";

export type SettleTarget = { id: string; description: string; amount_cents: number; kind: "income" | "expense"; account_id?: string | null };

/** Dar baixa (marcar como pago/recebido) em um lançamento previsto. */
export function SettleDialog({ target, onClose, onDone }: { target: SettleTarget | null; onClose: () => void; onDone: () => void }) {
  const { company } = useActiveCompany();
  const toast = useToast();
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(todayISO(company.timezone));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setError(null);
    setDate(todayISO(company.timezone));
    getSupabase()
      .from("accounts")
      .select("id,name")
      .eq("company_id", company.id)
      .eq("archived", false)
      .order("name")
      .then(({ data }) => {
        setAccounts(data ?? []);
        setAccountId(target.account_id ?? data?.[0]?.id ?? "");
      });
  }, [target, company.id, company.timezone]);

  const save = async () => {
    if (!target) return;
    if (!accountId) return setError("Escolha a conta.");
    setBusy(true);
    const { error } = await getSupabase()
      .from("transactions")
      .update({ status: "settled", paid_date: date, account_id: accountId })
      .eq("id", target.id);
    setBusy(false);
    if (error) return setError(friendlyError(error));
    toast.success(target.kind === "income" ? "Recebimento registrado." : "Pagamento registrado.");
    onDone();
    onClose();
  };

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title={target?.kind === "income" ? "Registrar recebimento" : "Registrar pagamento"}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Voltar
          </Button>
          <Button variant="success" onClick={save} loading={busy}>
            Confirmar
          </Button>
        </>
      }
    >
      {target && (
        <div className="space-y-3">
          <p className="text-sm">
            {target.description} — <b>{formatBRL(target.amount_cents)}</b>
          </p>
          {error && <InfoBox tone="danger">{error}</InfoBox>}
          <Field label={target.kind === "income" ? "Conta que recebeu" : "Conta usada para pagar"} required>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Data" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
      )}
    </Modal>
  );
}
