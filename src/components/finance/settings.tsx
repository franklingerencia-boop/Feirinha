"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { Badge, Button, Card, Checkbox, Field, InfoBox, Input, Modal, MoneyInput, Select, Spinner, Table, Td, Th } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { formatDate, todayISO } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { formatBRL } from "@/lib/money";
import { getSupabase } from "@/lib/supabase/client";
import { must, useData } from "@/lib/use-data";

type Cat = { id: string; name: string; kind: "income" | "expense"; is_stock_purchase: boolean; archived: boolean; system_code: string | null };
type Pm = { id: string; name: string; settlement: "immediate" | "future"; settle_days: number; fee_percent: number; default_account_id: string | null; archived: boolean };
type Rule = { id: string; kind: string; description: string; amount_cents: number; day_of_month: number; start_date: string; end_date: string | null; active: boolean; category_id: string | null; account_id: string | null };

export function RecurringTab() {
  const { company } = useActiveCompany();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const { data, loading, reload } = useData(async () => {
    const s = getSupabase();
    const today = todayISO(company.timezone);
    // Gera os próximos lançamentos previstos (idempotente)
    await s.rpc("generate_recurring", { p_company: company.id, p_until: addMonths(today, 2) });
    const rules = must(await s.from("recurring_rules").select("*").eq("company_id", company.id).order("description")) as Rule[];
    const cats = must(await s.from("fin_categories").select("id,name,kind").eq("company_id", company.id).eq("archived", false).order("sort")) as Cat[];
    const accounts = must(await s.from("accounts").select("id,name").eq("company_id", company.id).eq("archived", false)) as { id: string; name: string }[];
    return { rules, cats, accounts };
  }, [company.id]);

  return (
    <div className="space-y-4">
      <InfoBox>
        Despesas que se repetem todo mês — como o <b>MEI/DAS</b>, aluguel ou internet. Você informa o valor; o app cria os lançamentos previstos dos próximos meses em contas a pagar.
      </InfoBox>
      <div className="flex justify-end">
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>
          Nova despesa recorrente
        </Button>
      </div>
      {loading && <Spinner />}
      {data && (
        <Table>
          <thead>
            <tr>
              <Th>Descrição</Th>
              <Th>Dia</Th>
              <Th>Início</Th>
              <Th className="text-right">Valor</Th>
              <Th>Situação</Th>
            </tr>
          </thead>
          <tbody>
            {data.rules.length === 0 && (
              <tr>
                <Td colSpan={5} className="text-center text-muted">
                  Nenhuma recorrência cadastrada.
                </Td>
              </tr>
            )}
            {data.rules.map((r) => (
              <tr key={r.id}>
                <Td>
                  {r.description}
                  <span className="block text-xs text-muted">{data.cats.find((c) => c.id === r.category_id)?.name}</span>
                </Td>
                <Td>Todo dia {r.day_of_month}</Td>
                <Td>{formatDate(r.start_date)}</Td>
                <Td className="text-right tabular-nums">{formatBRL(r.amount_cents)}</Td>
                <Td>
                  <Checkbox
                    label={r.active ? "Ativa" : "Pausada"}
                    checked={r.active}
                    onChange={async (v) => {
                      const { error } = await getSupabase().from("recurring_rules").update({ active: v }).eq("id", r.id);
                      if (error) toast.error(friendlyError(error));
                      reload();
                    }}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {open && data && <RuleDialog cats={data.cats} accounts={data.accounts} onClose={() => setOpen(false)} onSaved={reload} />}
    </div>
  );
}

function RuleDialog({ cats, accounts, onClose, onSaved }: { cats: Cat[]; accounts: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const { company } = useActiveCompany();
  const toast = useToast();
  const mei = cats.find((c) => c.kind === "expense" && c.name.startsWith("MEI"));
  const [description, setDescription] = useState(mei ? "MEI / DAS mensal" : "");
  const [amount, setAmount] = useState<number | null>(null);
  const [day, setDay] = useState("20");
  const [start, setStart] = useState(todayISO(company.timezone));
  const [categoryId, setCategoryId] = useState(mei?.id ?? "");
  const [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!description.trim() || !amount) return toast.error("Informe descrição e valor.");
    const d = Math.min(28, Math.max(1, Number(day) || 1));
    setBusy(true);
    const { error } = await getSupabase()
      .from("recurring_rules")
      .insert({ company_id: company.id, kind: "expense", description: description.trim(), amount_cents: amount, day_of_month: d, start_date: start, category_id: categoryId || null, account_id: accountId || null });
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    toast.success("Recorrência criada.");
    onSaved();
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Nova despesa recorrente"
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
        <Field label="Descrição" required>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Valor mensal" required hint="Informe o valor atual do seu boleto (o DAS muda de tempos em tempos)">
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dia do vencimento" hint="1 a 28">
            <Input inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} />
          </Field>
          <Field label="A partir de">
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
        </div>
        <Field label="Categoria">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Sem categoria</option>
            {cats
              .filter((c) => c.kind === "expense")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Conta (opcional)">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Definir no pagamento</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

export function FinanceSettingsTab() {
  const { company, canSettings } = useActiveCompany();
  const toast = useToast();
  const [newCat, setNewCat] = useState({ name: "", kind: "expense", stock: false });
  const [pmEdit, setPmEdit] = useState<Pm | "new" | null>(null);
  const { data, loading, reload } = useData(async () => {
    const s = getSupabase();
    const cats = must(await s.from("fin_categories").select("*").eq("company_id", company.id).order("kind").order("sort").order("name")) as Cat[];
    const pms = must(await s.from("payment_methods").select("*").eq("company_id", company.id).order("sort")) as Pm[];
    const accounts = must(await s.from("accounts").select("id,name").eq("company_id", company.id).eq("archived", false)) as { id: string; name: string }[];
    return { cats, pms, accounts };
  }, [company.id]);

  const addCat = async () => {
    if (!newCat.name.trim()) return;
    const { error } = await getSupabase()
      .from("fin_categories")
      .insert({ company_id: company.id, name: newCat.name.trim(), kind: newCat.kind, is_stock_purchase: newCat.kind === "expense" && newCat.stock });
    if (error) return toast.error(friendlyError(error));
    setNewCat({ name: "", kind: "expense", stock: false });
    reload();
  };

  if (loading || !data) return <Spinner />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Categorias financeiras">
        <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <Input placeholder="Nova categoria" value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} aria-label="Nome da categoria" />
          <Select value={newCat.kind} onChange={(e) => setNewCat({ ...newCat, kind: e.target.value })} aria-label="Tipo">
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
          </Select>
          <Button onClick={addCat}>Adicionar</Button>
        </div>
        {newCat.kind === "expense" && (
          <Checkbox
            label="É compra de estoque/insumos"
            hint="Não conta como despesa no resultado (vira custo quando o produto é vendido)."
            checked={newCat.stock}
            onChange={(v) => setNewCat({ ...newCat, stock: v })}
          />
        )}
        <ul className="mt-3 divide-y divide-line">
          {data.cats.map((c) => (
            <li key={c.id} className={`flex items-center justify-between gap-2 py-2 text-sm ${c.archived ? "opacity-50" : ""}`}>
              <span>
                {c.name} <Badge tone={c.kind === "income" ? "success" : "danger"}>{c.kind === "income" ? "Receita" : "Despesa"}</Badge>{" "}
                {c.is_stock_purchase && <Badge tone="info">Estoque</Badge>}
              </span>
              {!c.system_code && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await getSupabase().from("fin_categories").update({ archived: !c.archived }).eq("id", c.id);
                    reload();
                  }}
                >
                  {c.archived ? "Reativar" : "Arquivar"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card
        title="Formas de pagamento"
        actions={
          canSettings && (
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setPmEdit("new")}>
              Nova
            </Button>
          )
        }
      >
        <InfoBox>Cadastrar uma forma de pagamento não cria integração com banco, maquininha ou Pix — serve para organizar seus recebimentos.</InfoBox>
        <Table>
          <thead>
            <tr>
              <Th>Forma</Th>
              <Th>Recebimento</Th>
              <Th>Taxa</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {data.pms.map((p) => (
              <tr key={p.id} className={p.archived ? "opacity-50" : ""}>
                <Td className="font-semibold">{p.name}</Td>
                <Td>{p.settlement === "immediate" ? "Na hora" : `Em ${p.settle_days} dia(s)`}</Td>
                <Td>{Number(p.fee_percent) > 0 ? `${Number(p.fee_percent).toLocaleString("pt-BR")}%` : "—"}</Td>
                <Td className="text-right">
                  {canSettings && (
                    <Button size="sm" variant="ghost" onClick={() => setPmEdit(p)}>
                      Editar
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      {pmEdit && <PmDialog pm={pmEdit === "new" ? null : pmEdit} accounts={data.accounts} onClose={() => setPmEdit(null)} onSaved={reload} />}
    </div>
  );
}

function PmDialog({ pm, accounts, onClose, onSaved }: { pm: Pm | null; accounts: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const { company } = useActiveCompany();
  const toast = useToast();
  const [name, setName] = useState(pm?.name ?? "");
  const [settlement, setSettlement] = useState(pm?.settlement ?? "immediate");
  const [days, setDays] = useState(String(pm?.settle_days ?? 0));
  const [fee, setFee] = useState(String(pm?.fee_percent ?? 0).replace(".", ","));
  const [account, setAccount] = useState(pm?.default_account_id ?? "");
  const [archived, setArchived] = useState(pm?.archived ?? false);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) return toast.error("Informe o nome.");
    setBusy(true);
    const payload = {
      name: name.trim(),
      settlement,
      settle_days: settlement === "immediate" ? 0 : Math.max(0, Number(days) || 0),
      fee_percent: Number(fee.replace(",", ".")) || 0,
      default_account_id: account || null,
      archived,
    };
    const s = getSupabase();
    const { error } = pm ? await s.from("payment_methods").update(payload).eq("id", pm.id) : await s.from("payment_methods").insert({ ...payload, company_id: company.id });
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    toast.success("Forma de pagamento salva.");
    onSaved();
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={pm ? "Editar forma de pagamento" : "Nova forma de pagamento"}
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
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Vale-refeição" />
        </Field>
        <Field label="Quando o dinheiro chega?">
          <Select value={settlement} onChange={(e) => setSettlement(e.target.value as "immediate" | "future")}>
            <option value="immediate">Na hora (entra no saldo)</option>
            <option value="future">Depois (fica em contas a receber)</option>
          </Select>
        </Field>
        {settlement === "future" && (
          <Field label="Dias para receber">
            <Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
          </Field>
        )}
        <Field label="Taxa cobrada (%)" hint="Gera uma despesa de taxa em cada venda">
          <Input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
        </Field>
        <Field label="Conta padrão de recebimento">
          <Select value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">Escolher na venda</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        {pm && <Checkbox label="Arquivada (não aparece na tela de vendas)" checked={archived} onChange={setArchived} />}
      </div>
    </Modal>
  );
}

function addMonths(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, 28))).toISOString().slice(0, 10);
}

