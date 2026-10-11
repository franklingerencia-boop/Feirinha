"use client";

import { Archive, History, Pencil, Plus, Search, Store, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { Badge, Button, Card, Checkbox, ConfirmDialog, EmptyState, Field, InfoBox, Input, Modal, PageHeader, Spinner, Textarea } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { rangeLabel } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { PARTICIPANT_STATUS, STATUS_TONE } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { getSupabase } from "@/lib/supabase/client";
import { must, useData } from "@/lib/use-data";
import { whatsappChatUrl } from "@/lib/whatsapp";

type Vendor = {
  id: string;
  responsible_name: string | null;
  trade_name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  segment: string | null;
  products: string | null;
  needs_space: string | null;
  needs_power: boolean;
  needs_structure: string | null;
  notes: string | null;
  linked_company_id: string | null;
  archived: boolean;
};

export default function VendorsPage() {
  const { company } = useActiveCompany();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<Vendor | "new" | null>(null);
  const [history, setHistory] = useState<Vendor | null>(null);
  const [archiving, setArchiving] = useState<Vendor | null>(null);
  const { data, loading, error, reload } = useData(
    async () => must(await getSupabase().from("vendors").select("*").eq("company_id", company.id).order("trade_name")) as Vendor[],
    [company.id],
  );
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data ?? []).filter((v) => v.archived === archived && (!t || [v.trade_name, v.responsible_name, v.segment, v.products].some((x) => x?.toLowerCase().includes(t))));
  }, [data, q, archived]);

  return (
    <div>
      <PageHeader
        title="Feirantes"
        description="Cadastro dos feirantes que participam dos seus eventos — inclusive quem não usa o aplicativo. Cadastros externos não criam contas."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>
            Novo feirante
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="Buscar" className="min-w-56 flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, segmento, produto" />
          </div>
        </Field>
        <Button variant={archived ? "primary" : "secondary"} onClick={() => setArchived((v) => !v)}>
          {archived ? "Ver ativos" : "Ver arquivados"}
        </Button>
      </div>
      {loading && <Spinner />}
      {error && <InfoBox tone="danger">{error}</InfoBox>}
      {data && list.length === 0 && <EmptyState icon={<Store className="h-10 w-10" />} title="Nenhum feirante" action={!archived && <Button onClick={() => setEditing("new")}>Cadastrar feirante</Button>} />}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((v) => (
          <Card key={v.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-lg font-bold">{v.trade_name}</p>
                {v.responsible_name && <p className="text-sm text-muted">{v.responsible_name}</p>}
              </div>
              <div className="flex">
                <Button size="sm" variant="ghost" aria-label="Histórico" onClick={() => setHistory(v)}>
                  <History className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" aria-label="Editar" onClick={() => setEditing(v)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                {!v.archived && (
                  <Button size="sm" variant="ghost" aria-label="Arquivar" onClick={() => setArchiving(v)}>
                    <Archive className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {v.segment && <Badge tone="brand">{v.segment}</Badge>}
              {v.linked_company_id && <Badge tone="info">Na plataforma</Badge>}
              {v.needs_power && (
                <Badge tone="warning">
                  <Zap className="mr-0.5 h-3 w-3" />
                  Energia
                </Badge>
              )}
            </div>
            {v.products && <p className="mt-2 text-sm">{v.products}</p>}
            <div className="mt-2 text-sm">
              {v.phone && <p>{v.phone}</p>}
              {v.whatsapp && (
                <a className="font-semibold text-leaf-600 hover:underline" href={whatsappChatUrl(v.whatsapp)} target="_blank" rel="noopener noreferrer">
                  WhatsApp {v.whatsapp}
                </a>
              )}
              {v.email && <p className="text-muted">{v.email}</p>}
            </div>
            {v.archived && (
              <Button
                size="sm"
                variant="secondary"
                className="mt-2"
                onClick={async () => {
                  await getSupabase().from("vendors").update({ archived: false }).eq("id", v.id);
                  reload();
                }}
              >
                Reativar
              </Button>
            )}
          </Card>
        ))}
      </div>
      {editing && <VendorDialog vendor={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
      {history && <HistoryDialog vendor={history} onClose={() => setHistory(null)} />}
      <ConfirmDialog
        open={!!archiving}
        title="Arquivar feirante?"
        message="O cadastro sai da lista, mas o histórico de participações é preservado."
        confirmLabel="Arquivar"
        onClose={() => setArchiving(null)}
        onConfirm={async () => {
          const { error } = await getSupabase().from("vendors").update({ archived: true }).eq("id", archiving!.id);
          if (error) toast.error(friendlyError(error));
          setArchiving(null);
          reload();
        }}
      />
    </div>
  );
}

function VendorDialog({ vendor, onClose, onSaved }: { vendor: Vendor | null; onClose: () => void; onSaved: () => void }) {
  const { company } = useActiveCompany();
  const toast = useToast();
  const [f, setF] = useState({
    trade_name: vendor?.trade_name ?? "",
    responsible_name: vendor?.responsible_name ?? "",
    phone: vendor?.phone ?? "",
    whatsapp: vendor?.whatsapp ?? "",
    email: vendor?.email ?? "",
    segment: vendor?.segment ?? "",
    products: vendor?.products ?? "",
    needs_space: vendor?.needs_space ?? "",
    needs_structure: vendor?.needs_structure ?? "",
    notes: vendor?.notes ?? "",
  });
  const [power, setPower] = useState(vendor?.needs_power ?? false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (f.trade_name.trim().length < 2) return toast.error("Informe o nome comercial.");
    setBusy(true);
    const payload = { ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null])), needs_power: power };
    const s = getSupabase();
    const { error } = vendor ? await s.from("vendors").update(payload).eq("id", vendor.id) : await s.from("vendors").insert({ ...payload, company_id: company.id });
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    toast.success("Feirante salvo.");
    onSaved();
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={vendor ? "Editar feirante" : "Novo feirante"}
      size="lg"
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
      {vendor?.linked_company_id && <InfoBox>Este feirante está conectado pela plataforma. Os dados autorizados por ele podem ser vistos em Vínculos.</InfoBox>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Nome comercial" required>
          <Input value={f.trade_name} onChange={(e) => set("trade_name", e.target.value)} />
        </Field>
        <Field label="Nome do responsável">
          <Input value={f.responsible_name} onChange={(e) => set("responsible_name", e.target.value)} />
        </Field>
        <Field label="Telefone">
          <Input value={f.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="WhatsApp">
          <Input value={f.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
        </Field>
        <Field label="E-mail">
          <Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Segmento">
          <Input value={f.segment} onChange={(e) => set("segment", e.target.value)} />
        </Field>
        <Field label="Produtos vendidos" className="sm:col-span-2">
          <Input value={f.products} onChange={(e) => set("products", e.target.value)} />
        </Field>
        <Field label="Necessidade de espaço">
          <Input value={f.needs_space} onChange={(e) => set("needs_space", e.target.value)} placeholder="Ex.: 3x3 m" />
        </Field>
        <Field label="Necessidade de estrutura">
          <Input value={f.needs_structure} onChange={(e) => set("needs_structure", e.target.value)} placeholder="Ex.: mesa, tenda" />
        </Field>
        <Checkbox label="Precisa de energia elétrica" checked={power} onChange={setPower} />
        <Field label="Observações" className="sm:col-span-2">
          <Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}

function HistoryDialog({ vendor, onClose }: { vendor: Vendor; onClose: () => void }) {
  const { data, loading } = useData(
    async () =>
      must(await getSupabase().from("participant_overview").select("id,status,total_cents,paid_cents,stall_codes,events(name,event_days(day))").eq("vendor_id", vendor.id)) as any[],
    [vendor.id],
  );
  return (
    <Modal open onClose={onClose} title={`Histórico: ${vendor.trade_name}`}>
      {loading && <Spinner />}
      {data && data.length === 0 && <p className="text-sm text-muted">Nenhuma participação registrada.</p>}
      <ul className="divide-y divide-line">
        {data?.map((p) => {
          const days = (p.events?.event_days ?? []).map((d: any) => d.day).sort();
          return (
            <li key={p.id} className="py-2 text-sm">
              <div className="flex justify-between gap-2">
                <b>{p.events?.name}</b>
                <Badge tone={STATUS_TONE[p.status]}>{PARTICIPANT_STATUS[p.status]}</Badge>
              </div>
              <p className="text-muted">
                {rangeLabel(days[0], days[days.length - 1])} · barraca {p.stall_codes ?? "—"} · {formatBRL(p.total_cents)} (pago {formatBRL(p.paid_cents)})
              </p>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
