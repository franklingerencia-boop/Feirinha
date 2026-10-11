"use client";

import { CheckCircle2, Minus, Package, Plus, Search, ShoppingCart, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { Button, EmptyState, Field, InfoBox, Input, Modal, MoneyInput, Select, Spinner, cx } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { formatDate, rangeLabel, todayISO } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { formatBRL } from "@/lib/money";
import { getSupabase } from "@/lib/supabase/client";
import { must, newIdempotencyKey, useData } from "@/lib/use-data";
import { useSignedUrls } from "@/lib/use-images";

type PosProduct = { id: string; name: string; description: string | null; unit: string; price_cents: number; category_id: string | null; category_name: string | null; photo_path: string | null };
type Pm = { id: string; name: string; settlement: "immediate" | "future"; settle_days: number; fee_percent: number; default_account_id: string | null };
type Acc = { id: string; name: string };
type Ed = { id: string; fair_name: string; edition_name: string; first_day: string | null; last_day: string | null; status: string };
type CartItem = { product: PosProduct; qty: number };

export default function PosPage() {
  const { company } = useActiveCompany();
  const s = getSupabase();
  const toast = useToast();
  const today = todayISO(company.timezone);

  const { data, loading, error } = useData(async () => {
    const [products, pms, accounts, editions] = await Promise.all([
      s.rpc("pos_products", { p_company: company.id }),
      s.from("payment_methods").select("id,name,settlement,settle_days,fee_percent,default_account_id").eq("company_id", company.id).eq("archived", false).order("sort"),
      s.rpc("sale_accounts", { p_company: company.id }),
      s.rpc("pos_editions", { p_company: company.id }),
    ]);
    return {
      products: must(products) as PosProduct[],
      pms: must(pms) as Pm[],
      accounts: must(accounts) as Acc[],
      editions: must(editions) as Ed[],
    };
  }, [company.id]);

  const urls = useSignedUrls((data?.products ?? []).map((p) => p.photo_path));
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [done, setDone] = useState<{ number: number; total: number; method: string } | null>(null);

  // Feira em andamento: a que acontece hoje, se houver
  const [editionId, setEditionId] = useState("");
  useEffect(() => {
    if (!data) return;
    const current = data.editions.find((e) => e.first_day && e.last_day && e.first_day <= today && e.last_day >= today);
    setEditionId((prev) => prev || current?.id || "");
  }, [data, today]);

  const cats = useMemo(() => {
    const m = new Map<string, string>();
    data?.products.forEach((p) => p.category_id && m.set(p.category_id, p.category_name ?? ""));
    return [...m.entries()];
  }, [data]);
  const visible = (data?.products ?? []).filter(
    (p) => (cat === "all" || p.category_id === cat) && (!q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())),
  );

  const add = (p: PosProduct) =>
    setCart((c) => {
      const i = c.findIndex((x) => x.product.id === p.id);
      if (i >= 0) return c.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x));
      return [...c, { product: p, qty: 1 }];
    });
  const setQty = (id: string, qty: number) => setCart((c) => (qty <= 0 ? c.filter((x) => x.product.id !== id) : c.map((x) => (x.product.id === id ? { ...x, qty } : x))));
  const count = cart.reduce((a, x) => a + x.qty, 0);
  const subtotal = cart.reduce((a, x) => a + Math.round(x.product.price_cents * x.qty), 0);

  if (loading) return <Spinner />;
  if (error) return <InfoBox tone="danger">{error}</InfoBox>;
  if (!data) return null;

  if (data.products.length === 0)
    return (
      <EmptyState
        icon={<Package className="h-10 w-10" />}
        title="Nenhum produto ativo"
        description="Cadastre seus produtos para começar a vender."
        action={<Link href="/app/produtos" className="rounded-xl bg-brand-500 px-4 py-3 font-semibold text-white">Cadastrar produtos</Link>}
      />
    );

  const cartPanel = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line p-4">
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <ShoppingCart className="h-5 w-5" /> Carrinho ({count})
        </h2>
        {cart.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setCart([])}>
            Limpar
          </Button>
        )}
      </div>
      <ul className="flex-1 space-y-2 overflow-y-auto p-3" aria-live="polite">
        {cart.length === 0 && <li className="py-10 text-center text-sm text-muted">Toque nos produtos para adicionar.</li>}
        {cart.map((x) => (
          <li key={x.product.id} className="rounded-xl border border-line bg-white p-2">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold leading-tight">{x.product.name}</p>
              <button className="p-1 text-muted hover:text-red-700" aria-label={`Remover ${x.product.name}`} onClick={() => setQty(x.product.id, 0)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700" aria-label="Diminuir" onClick={() => setQty(x.product.id, x.qty - 1)}>
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-10 text-center text-lg font-bold tabular-nums" aria-label="Quantidade">
                  {x.qty}
                </span>
                <button className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700" aria-label="Aumentar" onClick={() => setQty(x.product.id, x.qty + 1)}>
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <span className="font-bold tabular-nums">{formatBRL(Math.round(x.product.price_cents * x.qty))}</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="border-t border-line p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-muted">Subtotal</span>
          <span className="text-3xl font-extrabold tabular-nums">{formatBRL(subtotal)}</span>
        </div>
        <Button
          size="lg"
          variant="success"
          className="h-16 w-full text-xl"
          disabled={cart.length === 0}
          onClick={() => {
            setCartOpen(false);
            setCheckout(true);
          }}
        >
          Finalizar venda
        </Button>
      </div>
    </div>
  );

  return (
    <div className="lg:-my-5 lg:flex lg:h-[calc(100dvh-0.5rem)] lg:gap-4 lg:py-5">
      <div className="min-w-0 flex-1 lg:overflow-y-auto lg:pr-1">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
            <Input className="h-12 pl-10 text-lg" placeholder="Buscar produto" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar produto" />
          </div>
          <Select className="h-12 w-full sm:w-72" value={editionId} onChange={(e) => setEditionId(e.target.value)} aria-label="Feira da venda">
            <option value="">Venda fora de feira</option>
            {data.editions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.fair_name} · {rangeLabel(e.first_day, e.last_day)}
              </option>
            ))}
          </Select>
        </div>
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Categorias">
          {[["all", "Todos"] as [string, string], ...cats].map(([id, name]) => (
            <button
              key={id}
              role="tab"
              aria-selected={cat === id}
              onClick={() => setCat(id)}
              className={cx("h-11 whitespace-nowrap rounded-full px-5 font-bold", cat === id ? "bg-brand-500 text-white" : "bg-white text-ink ring-1 ring-line")}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 pb-28 sm:grid-cols-3 xl:grid-cols-4 lg:pb-4">
          {visible.map((p) => {
            const inCart = cart.find((x) => x.product.id === p.id)?.qty;
            return (
              <button
                key={p.id}
                onClick={() => add(p)}
                className="group relative flex flex-col overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-line transition active:scale-[0.97] hover:ring-brand-400"
                aria-label={`Adicionar ${p.name}, ${formatBRL(p.price_cents)}`}
              >
                <div className="flex aspect-square items-center justify-center bg-brand-50">
                  {p.photo_path && urls[p.photo_path] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urls[p.photo_path]} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-4xl font-extrabold text-brand-300">{p.name.slice(0, 1)}</span>
                  )}
                </div>
                <div className="p-3">
                  <p className="line-clamp-2 font-bold leading-tight">{p.name}</p>
                  <p className="mt-1 text-xl font-extrabold text-brand-600">{formatBRL(p.price_cents)}</p>
                </div>
                <span className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-white shadow">
                  {inCart ? <span className="font-extrabold">{inCart}</span> : <Plus className="h-5 w-5" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <aside className="hidden w-96 shrink-0 overflow-hidden rounded-2xl border border-line bg-cream shadow-sm lg:block">{cartPanel}</aside>

      {/* Barra do carrinho no celular */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white p-3 lg:hidden">
        <Button size="lg" className="h-14 w-full text-lg" onClick={() => setCartOpen(true)} disabled={cart.length === 0}>
          <ShoppingCart className="h-5 w-5" /> Ver carrinho ({count}) · {formatBRL(subtotal)}
        </Button>
      </div>
      {cartOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Carrinho">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setCartOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] rounded-t-3xl bg-cream">
            <button className="absolute right-3 top-3 rounded-lg p-2" aria-label="Fechar carrinho" onClick={() => setCartOpen(false)}>
              <X className="h-5 w-5" />
            </button>
            <div className="h-[85dvh]">{cartPanel}</div>
          </div>
        </div>
      )}

      {checkout && (
        <CheckoutDialog
          cart={cart}
          subtotal={subtotal}
          pms={data.pms}
          accounts={data.accounts}
          editionId={editionId}
          editions={data.editions}
          onClose={() => setCheckout(false)}
          onDone={(r) => {
            setCheckout(false);
            setCart([]);
            setDone(r);
            toast.success(`Venda nº ${r.number} registrada.`);
          }}
        />
      )}
      <Modal open={!!done} onClose={() => setDone(null)} title="Venda concluída" size="sm" footer={<Button size="lg" className="w-full" onClick={() => setDone(null)}>Nova venda</Button>}>
        {done && (
          <div className="py-4 text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-leaf-500" />
            <p className="mt-2 text-lg font-bold">Venda nº {done.number}</p>
            <p className="text-4xl font-extrabold">{formatBRL(done.total)}</p>
            <p className="text-muted">{done.method}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function CheckoutDialog({
  cart,
  subtotal,
  pms,
  accounts,
  editionId,
  editions,
  onClose,
  onDone,
}: {
  cart: CartItem[];
  subtotal: number;
  pms: Pm[];
  accounts: Acc[];
  editionId: string;
  editions: Ed[];
  onClose: () => void;
  onDone: (r: { number: number; total: number; method: string }) => void;
}) {
  const { company } = useActiveCompany();
  const [discType, setDiscType] = useState<"none" | "amount" | "percent">("none");
  const [discAmount, setDiscAmount] = useState<number | null>(null);
  const [discPct, setDiscPct] = useState("");
  const [pmId, setPmId] = useState(pms[0]?.id ?? "");
  const pm = pms.find((p) => p.id === pmId);
  const [accountId, setAccountId] = useState(pm?.default_account_id ?? accounts[0]?.id ?? "");
  const [received, setReceived] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Uma chave por tentativa de finalização: cliques repetidos não duplicam a venda
  const [idem] = useState(() => newIdempotencyKey("sale"));

  useEffect(() => {
    const p = pms.find((x) => x.id === pmId);
    if (p?.default_account_id) setAccountId(p.default_account_id);
  }, [pmId, pms]);

  const pctN = Number(discPct.replace(",", ".")) || 0;
  const discount = discType === "amount" ? discAmount ?? 0 : discType === "percent" ? Math.round((subtotal * pctN) / 100) : 0;
  const total = subtotal - discount;
  const change = pm?.settlement === "immediate" && pm?.name.toLowerCase().includes("dinheiro") && received ? received - total : null;
  const edition = editions.find((e) => e.id === editionId);

  const finish = async () => {
    setError(null);
    if (discount < 0 || discount >= subtotal) return setError("O desconto deve ser menor que o valor da venda.");
    if (!pmId) return setError("Escolha a forma de pagamento.");
    if (!accountId) return setError("Escolha a conta que vai receber.");
    setBusy(true);
    const s = getSupabase();
    const { data, error } = await s.rpc("create_sale", {
      p_company: company.id,
      p_idempotency_key: idem,
      p_items: cart.map((x) => ({ product_id: x.product.id, quantity: x.qty })),
      p_payment_method_id: pmId,
      p_account_id: accountId,
      p_discount_type: discType,
      p_discount_value: discType === "amount" ? discAmount ?? 0 : discType === "percent" ? pctN : 0,
      p_fair_edition_id: editionId || null,
    });
    if (error) {
      setBusy(false);
      return setError(friendlyError(error));
    }
    const { data: hist } = await s.rpc("sales_history", { p_company: company.id, p_from: todayISO(company.timezone), p_to: todayISO(company.timezone) });
    const sale = (hist as { id: string; number: number; total_cents: number }[] | null)?.find((x) => x.id === data);
    setBusy(false);
    onDone({ number: sale?.number ?? 0, total: sale?.total_cents ?? total, method: pm?.name ?? "" });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Finalizar venda"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Voltar
          </Button>
          <Button variant="success" size="lg" onClick={finish} loading={busy}>
            Confirmar {formatBRL(total)}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <InfoBox tone="danger">{error}</InfoBox>}
        <div>
          <p className="mb-2 text-sm font-semibold">Forma de pagamento</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {pms.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={pmId === p.id}
                onClick={() => setPmId(p.id)}
                className={cx("h-14 rounded-xl border-2 font-bold", pmId === p.id ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-white")}
              >
                {p.name}
              </button>
            ))}
          </div>
          {pm?.settlement === "future" && (
            <p className="mt-2 text-xs text-muted">
              Recebimento futuro: entra em contas a receber para daqui a {pm.settle_days} dia(s){pm.fee_percent > 0 ? `, com taxa de ${pm.fee_percent}%` : ""}.
            </p>
          )}
          <p className="mt-1 text-xs text-muted">O registro da forma de pagamento não processa cobranças: use sua maquininha ou Pix normalmente.</p>
        </div>
        <Field label="Conta que recebe">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Selecione...</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <p className="mb-2 text-sm font-semibold">Desconto</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["none", "Sem desconto"],
                ["amount", "Em reais"],
                ["percent", "Em %"],
              ] as const
            ).map(([v, l]) => (
              <Button key={v} size="sm" variant={discType === v ? "primary" : "secondary"} onClick={() => setDiscType(v)}>
                {l}
              </Button>
            ))}
          </div>
          {discType === "amount" && <MoneyInput className="mt-2" value={discAmount} onChange={setDiscAmount} aria-label="Desconto em reais" />}
          {discType === "percent" && <Input className="mt-2" inputMode="decimal" value={discPct} onChange={(e) => setDiscPct(e.target.value)} placeholder="Ex.: 10" aria-label="Desconto em percentual" />}
        </div>
        {pm?.name.toLowerCase().includes("dinheiro") && (
          <Field label="Valor recebido (para calcular o troco)">
            <MoneyInput value={received} onChange={setReceived} />
          </Field>
        )}
        <div className="rounded-2xl bg-cream p-4 ring-1 ring-line">
          <div className="flex justify-between text-sm">
            <span>Subtotal ({cart.reduce((a, x) => a + x.qty, 0)} itens)</span>
            <span className="tabular-nums">{formatBRL(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm text-red-700">
              <span>Desconto</span>
              <span className="tabular-nums">− {formatBRL(discount)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between text-2xl font-extrabold">
            <span>Total</span>
            <span className="tabular-nums">{formatBRL(total)}</span>
          </div>
          {change != null && (
            <div className={cx("mt-1 flex justify-between font-bold", change < 0 ? "text-red-700" : "text-leaf-600")}>
              <span>{change < 0 ? "Falta" : "Troco"}</span>
              <span className="tabular-nums">{formatBRL(Math.abs(change))}</span>
            </div>
          )}
          <p className="mt-2 text-xs text-muted">{edition ? `Feira: ${edition.fair_name} (${formatDate(edition.first_day)})` : "Venda fora de feira"}</p>
        </div>
      </div>
    </Modal>
  );
}
