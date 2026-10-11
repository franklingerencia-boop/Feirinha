"use client";

import { Archive, Mail, MapPin, Pencil, Phone, Plus, Search, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, InfoBox, Input, Modal, PageHeader, Select, Spinner, Textarea, cx } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { friendlyError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase/client";
import { must, useData } from "@/lib/use-data";
import { whatsappChatUrl } from "@/lib/whatsapp";

type Cat = { id: string; name: string };
type Supplier = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  address: string | null;
  products: string | null;
  notes: string | null;
  archived: boolean;
  supplier_category_links: { category_id: string }[];
};

export default function SuppliersPage() {
  const { company } = useActiveCompany();
  const toast = useToast();
  const s = getSupabase();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);
  const [archiving, setArchiving] = useState<Supplier | null>(null);

  const { data, loading, error, reload } = useData(async () => {
    const cats = must(await s.from("supplier_categories").select("id,name").eq("company_id", company.id).eq("archived", false).order("name")) as Cat[];
    const sups = must(
      await s.from("suppliers").select("*, supplier_category_links(category_id)").eq("company_id", company.id).order("name"),
    ) as Supplier[];
    return { cats, sups };
  }, [company.id]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.sups ?? []).filter(
      (x) =>
        x.archived === showArchived &&
        (!cat || x.supplier_category_links.some((l) => l.category_id === cat)) &&
        (!term || [x.name, x.contact_name, x.products, x.city].some((v) => v?.toLowerCase().includes(term))),
    );
  }, [data, q, cat, showArchived]);

  const catName = (id: string) => data?.cats.find((c) => c.id === id)?.name;

  return (
    <div>
      <PageHeader
        title="Fornecedores"
        description="Quem fornece embalagens, ingredientes, mercadorias e outros itens para o seu negócio."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>
            Novo fornecedor
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="Buscar" className="min-w-56 flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, produto, cidade..." />
          </div>
        </Field>
        <Field label="Categoria" className="min-w-44">
          <Select value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Todas</option>
            {data?.cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button variant={showArchived ? "primary" : "secondary"} onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? "Ver ativos" : "Ver arquivados"}
        </Button>
      </div>
      {loading && <Spinner />}
      {error && <InfoBox tone="danger">{error}</InfoBox>}
      {data && list.length === 0 && (
        <EmptyState
          icon={<Truck className="h-10 w-10" />}
          title={showArchived ? "Nenhum fornecedor arquivado" : "Nenhum fornecedor cadastrado"}
          description="Cadastre seus fornecedores para ter os contatos sempre à mão e vincular aos ingredientes dos produtos."
          action={!showArchived && <Button onClick={() => setEditing("new")}>Cadastrar fornecedor</Button>}
        />
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((x) => (
          <Card key={x.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-lg font-bold">{x.name}</p>
                {x.contact_name && <p className="text-sm text-muted">Contato: {x.contact_name}</p>}
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" aria-label={`Editar ${x.name}`} onClick={() => setEditing(x)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                {!x.archived && (
                  <Button size="sm" variant="ghost" aria-label={`Arquivar ${x.name}`} onClick={() => setArchiving(x)}>
                    <Archive className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {x.supplier_category_links.map((l) => (
                <Badge key={l.category_id} tone="brand">
                  {catName(l.category_id)}
                </Badge>
              ))}
            </div>
            {x.products && <p className="mt-2 text-sm">{x.products}</p>}
            <div className="mt-2 space-y-1 text-sm">
              {x.phone && (
                <p className="flex items-center gap-1">
                  <Phone className="h-4 w-4 text-muted" /> <a href={`tel:${x.phone}`}>{x.phone}</a>
                </p>
              )}
              {x.whatsapp && (
                <a className="font-semibold text-leaf-600 hover:underline" href={whatsappChatUrl(x.whatsapp)} target="_blank" rel="noopener noreferrer">
                  WhatsApp: {x.whatsapp}
                </a>
              )}
              {x.email && (
                <p className="flex items-center gap-1">
                  <Mail className="h-4 w-4 text-muted" /> {x.email}
                </p>
              )}
              {(x.city || x.address) && (
                <p className="flex items-center gap-1 text-muted">
                  <MapPin className="h-4 w-4" /> {[x.address, x.city].filter(Boolean).join(" - ")}
                </p>
              )}
            </div>
            {x.archived && (
              <Button
                size="sm"
                variant="secondary"
                className="mt-3"
                onClick={async () => {
                  await s.from("suppliers").update({ archived: false }).eq("id", x.id);
                  reload();
                }}
              >
                Reativar
              </Button>
            )}
          </Card>
        ))}
      </div>
      {editing && data && <SupplierDialog supplier={editing === "new" ? null : editing} cats={data.cats} onClose={() => setEditing(null)} onSaved={reload} />}
      <ConfirmDialog
        open={!!archiving}
        title="Arquivar fornecedor?"
        message="O fornecedor sai da lista, mas fica guardado no histórico. Você pode reativá-lo depois."
        confirmLabel="Arquivar"
        onClose={() => setArchiving(null)}
        onConfirm={async () => {
          const { error } = await s.from("suppliers").update({ archived: true }).eq("id", archiving!.id);
          if (error) toast.error(friendlyError(error));
          else toast.success("Fornecedor arquivado.");
          setArchiving(null);
          reload();
        }}
      />
    </div>
  );
}

function SupplierDialog({ supplier, cats, onClose, onSaved }: { supplier: Supplier | null; cats: Cat[]; onClose: () => void; onSaved: () => void }) {
  const { company } = useActiveCompany();
  const toast = useToast();
  const [f, setF] = useState({
    name: supplier?.name ?? "",
    contact_name: supplier?.contact_name ?? "",
    phone: supplier?.phone ?? "",
    whatsapp: supplier?.whatsapp ?? "",
    email: supplier?.email ?? "",
    city: supplier?.city ?? "",
    address: supplier?.address ?? "",
    products: supplier?.products ?? "",
    notes: supplier?.notes ?? "",
  });
  const [selected, setSelected] = useState<string[]>(supplier?.supplier_category_links.map((l) => l.category_id) ?? []);
  const [allCats, setAllCats] = useState(cats);
  const [newCat, setNewCat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  const addCat = async () => {
    const name = newCat.trim();
    if (!name) return;
    const { data, error } = await getSupabase().from("supplier_categories").insert({ company_id: company.id, name }).select("id,name").single();
    if (error) return setError(friendlyError(error));
    setAllCats((c) => [...c, data]);
    setSelected((x) => [...x, data.id]);
    setNewCat("");
  };

  const save = async () => {
    if (f.name.trim().length < 2) return setError("Informe o nome ou razão social.");
    setBusy(true);
    setError(null);
    const s = getSupabase();
    const payload = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null]));
    try {
      let id = supplier?.id;
      if (id) {
        const { error } = await s.from("suppliers").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await s.from("suppliers").insert({ ...payload, company_id: company.id }).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      const { error: e1 } = await s.from("supplier_category_links").delete().eq("supplier_id", id!);
      if (e1) throw e1;
      if (selected.length) {
        const { error: e2 } = await s.from("supplier_category_links").insert(selected.map((c) => ({ company_id: company.id, supplier_id: id, category_id: c })));
        if (e2) throw e2;
      }
      toast.success("Fornecedor salvo.");
      onSaved();
      onClose();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={supplier ? "Editar fornecedor" : "Novo fornecedor"}
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
      <div className="space-y-4">
        {error && <InfoBox tone="danger">{error}</InfoBox>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome ou razão social" required className="sm:col-span-2">
            <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Nome do contato">
            <Input value={f.contact_name} onChange={(e) => set("contact_name", e.target.value)} />
          </Field>
          <Field label="E-mail">
            <Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Telefone">
            <Input inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="WhatsApp">
            <Input inputMode="tel" value={f.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
          </Field>
          <Field label="Cidade">
            <Input value={f.city} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="Endereço">
            <Input value={f.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Categorias (pode marcar várias)</legend>
          <div className="flex flex-wrap gap-2">
            {allCats.map((c) => {
              const on = selected.includes(c.id);
              return (
                <button
                  type="button"
                  key={c.id}
                  aria-pressed={on}
                  onClick={() => setSelected((x) => (on ? x.filter((y) => y !== c.id) : [...x, c.id]))}
                  className={cx("rounded-full border px-3 py-1 text-sm font-semibold", on ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-white")}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2">
            <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Nova categoria personalizada" aria-label="Nova categoria" />
            <Button variant="secondary" onClick={addCat}>
              Adicionar
            </Button>
          </div>
        </fieldset>
        <Field label="Produtos fornecidos">
          <Textarea value={f.products} onChange={(e) => set("products", e.target.value)} rows={2} />
        </Field>
        <Field label="Observações">
          <Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}
