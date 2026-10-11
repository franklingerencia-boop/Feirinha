"use client";

import { ImagePlus, Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { Badge, Button, Card, Checkbox, EmptyState, Field, InfoBox, Input, Modal, MoneyInput, PageHeader, Select, Spinner, Textarea, cx } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { friendlyError } from "@/lib/errors";
import { formatBRL, formatPercent } from "@/lib/money";
import { getSupabase } from "@/lib/supabase/client";
import { must, useData } from "@/lib/use-data";
import { uploadProductImage, useSignedUrls } from "@/lib/use-images";

type Cat = { id: string; name: string };
type Component = { id?: string; name: string; quantity: number; unit: string; total_cost_cents: number | null; supplier_id: string };
type Product = {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  category_id: string | null;
  price_cents: number;
  cost_mode: "direct" | "composition";
  cost_cents: number;
  packaging_cost_cents: number;
  other_cost_cents: number;
  yield_qty: number;
  photo_path: string | null;
  active: boolean;
};

const unitCost = (p: Pick<Product, "cost_cents" | "packaging_cost_cents" | "other_cost_cents">) =>
  Number(p.cost_cents) + Number(p.packaging_cost_cents) + Number(p.other_cost_cents);

export default function ProductsPage() {
  const { company } = useActiveCompany();
  const s = getSupabase();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Product | "new" | null>(null);

  const { data, loading, error, reload } = useData(async () => {
    const cats = must(await s.from("product_categories").select("id,name").eq("company_id", company.id).eq("archived", false).order("sort").order("name")) as Cat[];
    const prods = must(await s.from("products").select("*").eq("company_id", company.id).order("name")) as Product[];
    return { cats, prods };
  }, [company.id]);

  const urls = useSignedUrls((data?.prods ?? []).map((p) => p.photo_path));
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.prods ?? []).filter((p) => p.active !== showInactive && (!cat || p.category_id === cat) && (!t || p.name.toLowerCase().includes(t)));
  }, [data, q, cat, showInactive]);

  return (
    <div>
      <PageHeader
        title="Produtos e custos"
        description="Cadastre o que você vende, com preço e custo por unidade. O custo é guardado em cada venda, preservando o histórico."
        actions={
          <>
            <Link href="/app/precificacao" className="inline-flex h-11 items-center rounded-xl border border-line bg-white px-4 font-semibold hover:bg-brand-50">
              Calcular preço
            </Link>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>
              Novo produto
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="Buscar" className="min-w-56 flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome do produto" />
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
        <Button variant={showInactive ? "primary" : "secondary"} onClick={() => setShowInactive((v) => !v)}>
          {showInactive ? "Ver ativos" : "Ver inativos"}
        </Button>
      </div>
      {loading && <Spinner />}
      {error && <InfoBox tone="danger">{error}</InfoBox>}
      {data && list.length === 0 && (
        <EmptyState
          icon={<Package className="h-10 w-10" />}
          title={showInactive ? "Nenhum produto inativo" : "Nenhum produto cadastrado"}
          description="Cadastre seus produtos para vendê-los na tela de vendas e acompanhar lucro por produto."
          action={!showInactive && <Button onClick={() => setEditing("new")}>Cadastrar produto</Button>}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {list.map((p) => {
          const cost = unitCost(p);
          const margin = p.price_cents > 0 ? ((p.price_cents - cost) / p.price_cents) * 100 : 0;
          return (
            <Card key={p.id} className="flex flex-col p-0 sm:p-0">
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-t-2xl bg-brand-50">
                {p.photo_path && urls[p.photo_path] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[p.photo_path]} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <Package className="h-12 w-12 text-brand-300" aria-hidden />
                )}
              </div>
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold">{p.name}</p>
                  <Button size="sm" variant="ghost" aria-label={`Editar ${p.name}`} onClick={() => setEditing(p)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted">{data?.cats.find((c) => c.id === p.category_id)?.name ?? "Sem categoria"} · por {p.unit}</p>
                <div className="mt-auto pt-3">
                  <p className="text-2xl font-extrabold text-brand-600">{formatBRL(p.price_cents)}</p>
                  <p className="text-xs text-muted">
                    Custo {formatBRL(cost)} · margem{" "}
                    <span className={cx("font-bold", margin < 0 ? "text-red-700" : "text-leaf-600")}>{formatPercent(margin)}</span>
                  </p>
                  {p.cost_mode === "composition" && <Badge tone="info" className="mt-1">Custo por composição</Badge>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      {editing && data && <ProductDialog product={editing === "new" ? null : editing} cats={data.cats} onClose={() => setEditing(null)} onSaved={reload} photoUrl={editing !== "new" && editing.photo_path ? urls[editing.photo_path] : undefined} />}
    </div>
  );
}

function ProductDialog({ product, cats, onClose, onSaved, photoUrl }: { product: Product | null; cats: Cat[]; onClose: () => void; onSaved: () => void; photoUrl?: string }) {
  const { company } = useActiveCompany();
  const toast = useToast();
  const s = getSupabase();
  const [f, setF] = useState({
    name: product?.name ?? "",
    description: product?.description ?? "",
    unit: product?.unit ?? "un",
    category_id: product?.category_id ?? "",
    price_cents: (product?.price_cents ?? null) as number | null,
    cost_mode: product?.cost_mode ?? "direct",
    cost_cents: (product?.cost_cents ?? 0) as number | null,
    packaging_cost_cents: (product?.packaging_cost_cents ?? 0) as number | null,
    other_cost_cents: (product?.other_cost_cents ?? 0) as number | null,
    yield_qty: String(product?.yield_qty ?? 1),
    active: product?.active ?? true,
  });
  const [comps, setComps] = useState<Component[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [allCats, setAllCats] = useState(cats);
  const [newCat, setNewCat] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | undefined>(photoUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: unknown) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    s.from("suppliers").select("id,name").eq("company_id", company.id).eq("archived", false).order("name").then(({ data }) => setSuppliers(data ?? []));
    if (product)
      s.from("product_components")
        .select("*")
        .eq("product_id", product.id)
        .order("sort")
        .then(({ data }) => setComps((data ?? []).map((c) => ({ ...c, supplier_id: c.supplier_id ?? "", unit: c.unit ?? "" }))));
  }, [product, company.id, s]);

  const yieldQty = Math.max(0.001, Number(String(f.yield_qty).replace(",", ".")) || 1);
  const compTotal = comps.reduce((a, c) => a + (c.total_cost_cents ?? 0), 0);
  const goodsCost = f.cost_mode === "composition" ? Math.round(compTotal / yieldQty) : f.cost_cents ?? 0;
  const totalCost = goodsCost + (f.packaging_cost_cents ?? 0) + (f.other_cost_cents ?? 0);
  const price = f.price_cents ?? 0;
  const margin = price > 0 ? ((price - totalCost) / price) * 100 : 0;
  const markup = totalCost > 0 ? ((price - totalCost) / totalCost) * 100 : 0;

  const addCat = async () => {
    if (!newCat.trim()) return;
    const { data, error } = await s.from("product_categories").insert({ company_id: company.id, name: newCat.trim() }).select("id,name").single();
    if (error) return setError(friendlyError(error));
    setAllCats((c) => [...c, data]);
    set("category_id", data.id);
    setNewCat("");
  };

  const save = async () => {
    setError(null);
    if (f.name.trim().length < 2) return setError("Informe o nome do produto.");
    if (f.price_cents == null || f.price_cents < 0) return setError("Informe o preço de venda.");
    setBusy(true);
    try {
      let photo_path = product?.photo_path ?? null;
      if (file) photo_path = await uploadProductImage(company.id, file);
      const payload = {
        name: f.name.trim(),
        description: f.description.trim() || null,
        unit: f.unit.trim() || "un",
        category_id: f.category_id || null,
        price_cents: f.price_cents,
        cost_mode: f.cost_mode,
        cost_cents: goodsCost,
        packaging_cost_cents: f.packaging_cost_cents ?? 0,
        other_cost_cents: f.other_cost_cents ?? 0,
        yield_qty: yieldQty,
        photo_path,
        active: f.active,
      };
      let id = product?.id;
      if (id) {
        const { error } = await s.from("products").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await s.from("products").insert({ ...payload, company_id: company.id }).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      if (f.cost_mode === "composition") {
        const { error: e1 } = await s.from("product_components").delete().eq("product_id", id!);
        if (e1) throw e1;
        const rows = comps
          .filter((c) => c.name.trim())
          .map((c, i) => ({
            company_id: company.id,
            product_id: id,
            name: c.name.trim(),
            quantity: c.quantity || 0,
            unit: c.unit || null,
            total_cost_cents: c.total_cost_cents ?? 0,
            supplier_id: c.supplier_id || null,
            sort: i,
          }));
        if (rows.length) {
          const { error: e2 } = await s.from("product_components").insert(rows);
          if (e2) throw e2;
        }
      }
      toast.success("Produto salvo.");
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
      title={product ? "Editar produto" : "Novo produto"}
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
        <div className="flex flex-col gap-4 sm:flex-row">
          <label className="flex h-32 w-32 shrink-0 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-line bg-brand-50 text-center text-xs text-muted hover:border-brand-300">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Foto do produto" className="h-full w-full object-cover" />
            ) : (
              <>
                <ImagePlus className="mb-1 h-6 w-6 text-brand-400" /> Adicionar foto
              </>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const fl = e.target.files?.[0];
                if (fl) {
                  setFile(fl);
                  setPreview(URL.createObjectURL(fl));
                }
              }}
            />
          </label>
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <Field label="Nome" required className="sm:col-span-2">
              <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Categoria">
              <Select value={f.category_id} onChange={(e) => set("category_id", e.target.value)}>
                <option value="">Sem categoria</option>
                {allCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Unidade de venda" hint="un, kg, pote, fatia...">
              <Input value={f.unit} onChange={(e) => set("unit", e.target.value)} />
            </Field>
            <div className="flex gap-2 sm:col-span-2">
              <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Nova categoria" aria-label="Nova categoria" />
              <Button variant="secondary" onClick={addCat}>
                Criar
              </Button>
            </div>
          </div>
        </div>
        <Field label="Descrição">
          <Textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={2} />
        </Field>

        <section className="rounded-2xl border border-line p-3">
          <h3 className="mb-2 font-bold">Custo por unidade</h3>
          <div className="mb-3 flex gap-2">
            <Button size="sm" variant={f.cost_mode === "direct" ? "primary" : "secondary"} onClick={() => set("cost_mode", "direct")}>
              Informar o custo
            </Button>
            <Button size="sm" variant={f.cost_mode === "composition" ? "primary" : "secondary"} onClick={() => set("cost_mode", "composition")}>
              Montar pela receita
            </Button>
          </div>
          {f.cost_mode === "direct" ? (
            <Field label="Custo da mercadoria ou de produção (por unidade)">
              <MoneyInput value={f.cost_cents} onChange={(v) => set("cost_cents", v)} />
            </Field>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted">Liste ingredientes e materiais usados em um lote e quantas unidades o lote rende.</p>
              {comps.map((c, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <Input className="col-span-12 sm:col-span-4" placeholder="Ingrediente/material" value={c.name} onChange={(e) => setComps((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} aria-label="Ingrediente" />
                  <Input className="col-span-4 sm:col-span-2" placeholder="Qtd." inputMode="decimal" value={String(c.quantity ?? "")} onChange={(e) => setComps((x) => x.map((y, j) => (j === i ? { ...y, quantity: Number(e.target.value.replace(",", ".")) || 0 } : y)))} aria-label="Quantidade" />
                  <Input className="col-span-4 sm:col-span-1" placeholder="un" value={c.unit} onChange={(e) => setComps((x) => x.map((y, j) => (j === i ? { ...y, unit: e.target.value } : y)))} aria-label="Unidade" />
                  <MoneyInput className="col-span-4 sm:col-span-2" value={c.total_cost_cents} onChange={(v) => setComps((x) => x.map((y, j) => (j === i ? { ...y, total_cost_cents: v } : y)))} aria-label="Custo no lote" />
                  <Select className="col-span-10 sm:col-span-2" value={c.supplier_id} onChange={(e) => setComps((x) => x.map((y, j) => (j === i ? { ...y, supplier_id: e.target.value } : y)))} aria-label="Fornecedor">
                    <option value="">Fornecedor</option>
                    {suppliers.map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.name}
                      </option>
                    ))}
                  </Select>
                  <Button className="col-span-2 sm:col-span-1" variant="ghost" aria-label="Remover item" onClick={() => setComps((x) => x.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setComps((x) => [...x, { name: "", quantity: 1, unit: "", total_cost_cents: null, supplier_id: "" }])}>
                Adicionar item
              </Button>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Rendimento do lote (unidades)">
                  <Input inputMode="decimal" value={f.yield_qty} onChange={(e) => set("yield_qty", e.target.value)} />
                </Field>
                <div className="self-end rounded-xl bg-brand-50 p-3 text-sm">
                  Lote {formatBRL(compTotal)} ÷ {yieldQty} = <b>{formatBRL(goodsCost)}</b> por unidade
                </div>
              </div>
            </div>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Custo de embalagem (por unidade)">
              <MoneyInput value={f.packaging_cost_cents} onChange={(v) => set("packaging_cost_cents", v)} />
            </Field>
            <Field label="Outros custos (por unidade)">
              <MoneyInput value={f.other_cost_cents} onChange={(v) => set("other_cost_cents", v)} />
            </Field>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Preço de venda" required>
            <MoneyInput value={f.price_cents} onChange={(v) => set("price_cents", v)} />
          </Field>
          <div className="rounded-xl bg-cream p-3 text-sm ring-1 ring-line">
            <p>
              Custo total por unidade: <b>{formatBRL(totalCost)}</b>
            </p>
            <p>
              Lucro bruto por unidade: <b className={price - totalCost < 0 ? "text-red-700" : "text-leaf-600"}>{formatBRL(price - totalCost)}</b>
            </p>
            <p className="text-xs text-muted">
              Margem {formatPercent(margin)} do preço · acréscimo de {formatPercent(markup)} sobre o custo
            </p>
          </div>
        </div>
        <Checkbox label="Produto ativo (aparece na tela de vendas)" checked={f.active} onChange={(v) => set("active", v)} />
        <p className="text-xs text-muted">Mudanças de preço e custo valem para vendas futuras; vendas já registradas mantêm os valores da época.</p>
      </div>
    </Modal>
  );
}
