"use client";

import { useEffect, useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { Button, Checkbox, Field, InfoBox, Input, Modal, MoneyInput, Select, Textarea } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { todayISO } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase/client";
import { newIdempotencyKey } from "@/lib/use-data";

type Opt = { id: string; name: string };
type Cat = Opt & { kind: "income" | "expense"; is_stock_purchase: boolean };

export type TxDefaults = {
  kind?: "income" | "expense";
  fair_edition_id?: string | null;
  event_id?: string | null;
  description?: string;
};

/** Lançamento manual de receita ou despesa (prevista ou realizada). */
export function TransactionDialog({
  open,
  onClose,
  onSaved,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  defaults?: TxDefaults;
}) {
  const { company } = useActiveCompany();
  const toast = useToast();
  const today = todayISO(company.timezone);
  const [cats, setCats] = useState<Cat[]>([]);
  const [accounts, setAccounts] = useState<Opt[]>([]);
  const [links, setLinks] = useState<Opt[]>([]);
  const [kind, setKind] = useState<"income" | "expense">("expense");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [paid, setPaid] = useState(true);
  const [dueDate, setDueDate] = useState(today);
  const [paidDate, setPaidDate] = useState(today);
  const [linkId, setLinkId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idem, setIdem] = useState(newIdempotencyKey("tx"));
  const isVendor = company.kind === "vendor";

  useEffect(() => {
    if (!open) return;
    setError(null);
    setKind(defaults?.kind ?? "expense");
    setDescription(defaults?.description ?? "");
    setAmount(null);
    setPaid(true);
    setDueDate(today);
    setPaidDate(today);
    setNotes("");
    setLinkId((isVendor ? defaults?.fair_edition_id : defaults?.event_id) ?? "");
    setIdem(newIdempotencyKey("tx"));
    const s = getSupabase();
    Promise.all([
      s.from("fin_categories").select("id,name,kind,is_stock_purchase").eq("company_id", company.id).eq("archived", false).order("sort"),
      s.from("accounts").select("id,name").eq("company_id", company.id).eq("archived", false).order("name"),
      isVendor
        ? s.from("edition_overview").select("id,fair_name,name,first_day").eq("company_id", company.id).neq("status", "canceled").order("first_day", { ascending: false }).limit(100)
        : s.from("events").select("id,name").eq("company_id", company.id).neq("status", "canceled").order("created_at", { ascending: false }).limit(100),
    ]).then(([c, a, l]) => {
      setCats((c.data as Cat[]) ?? []);
      setAccounts(a.data ?? []);
      setAccountId(a.data?.[0]?.id ?? "");
      setLinks(
        ((l.data as { id: string; name: string; fair_name?: string }[]) ?? []).map((x) => ({
          id: x.id,
          name: x.fair_name ? `${x.fair_name} - ${x.name}` : x.name,
        })),
      );
    });
  }, [open, company.id, defaults, isVendor, today]);

  const kindCats = cats.filter((c) => c.kind === kind);
  useEffect(() => {
    if (!kindCats.some((c) => c.id === categoryId)) setCategoryId(kindCats[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, cats]);
  const selectedCat = cats.find((c) => c.id === categoryId);

  const save = async () => {
    setError(null);
    if (!description.trim()) return setError("Descreva o lançamento.");
    if (!amount || amount <= 0) return setError("Informe um valor maior que zero.");
    if (paid && !accountId) return setError("Escolha a conta.");
    setBusy(true);
    const { error } = await getSupabase()
      .from("transactions")
      .insert({
        company_id: company.id,
        kind,
        status: paid ? "settled" : "planned",
        description: description.trim(),
        amount_cents: amount,
        category_id: categoryId || null,
        account_id: accountId || null,
        due_date: paid ? paidDate : dueDate,
        paid_date: paid ? paidDate : null,
        competence_date: paid ? paidDate : dueDate,
        fair_edition_id: isVendor ? linkId || null : null,
        event_id: !isVendor ? linkId || null : null,
        notes: notes || null,
        idempotency_key: idem,
      });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    toast.success("Lançamento salvo.");
    onSaved();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={kind === "income" ? "Nova receita" : "Nova despesa"}
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
        {error && <InfoBox tone="danger">{error}</InfoBox>}
        <div className="flex gap-2">
          <Button size="sm" variant={kind === "expense" ? "danger" : "secondary"} onClick={() => setKind("expense")}>
            Despesa
          </Button>
          <Button size="sm" variant={kind === "income" ? "success" : "secondary"} onClick={() => setKind("income")}>
            Receita
          </Button>
        </div>
        <Field label="Descrição" required>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={kind === "expense" ? "Ex.: Combustível para a feira" : "Ex.: Encomenda"} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor" required>
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
          <Field label="Categoria">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Sem categoria</option>
              {kindCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {selectedCat?.is_stock_purchase && (
          <InfoBox>
            Compra de estoque/insumos: sai do caixa, mas não entra como despesa no resultado. O custo aparece como <b>custo dos produtos vendidos</b>{" "}
            quando o produto é vendido — assim o mesmo custo não é descontado duas vezes.
          </InfoBox>
        )}
        <Checkbox
          label={kind === "income" ? "Já recebido" : "Já pago"}
          hint={paid ? "Entra no saldo da conta agora." : "Fica em contas a " + (kind === "income" ? "receber" : "pagar") + " até a baixa."}
          checked={paid}
          onChange={setPaid}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {paid ? (
            <Field label={kind === "income" ? "Data do recebimento" : "Data do pagamento"}>
              <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            </Field>
          ) : (
            <Field label="Vencimento">
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          )}
          <Field label="Conta" hint={paid ? undefined : "Opcional enquanto previsto"}>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {!paid && <option value="">Definir depois</option>}
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={isVendor ? "Feira (opcional)" : "Evento (opcional)"} hint="Vincule para ver o resultado por feira/evento. Vazio = negócio em geral.">
          <Select value={linkId} onChange={(e) => setLinkId(e.target.value)}>
            <option value="">Negócio em geral</option>
            {links.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Observações">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}
