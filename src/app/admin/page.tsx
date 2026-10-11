"use client";

import { ArrowLeft, Search, Shield } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/app/logo";
import { Badge, Button, Card, ConfirmDialog, Field, InfoBox, Input, Modal, PageHeader, Select, Spinner, Stat, Table, Tabs, Td, Textarea, Th } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { COMPANY_KIND, ROLE } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase/client";
import { must, useData } from "@/lib/use-data";

type Tab = "painel" | "empresas" | "usuarios" | "config" | "auditoria";

export default function AdminPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("painel");
  useEffect(() => {
    getSupabase()
      .rpc("admin_stats")
      .then(({ error }) => setAllowed(!error));
  }, []);
  if (allowed === null) return <Spinner />;
  if (!allowed)
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <Shield className="mx-auto h-10 w-10 text-muted" />
        <h1 className="mt-3 text-xl font-bold">Acesso restrito</h1>
        <p className="text-muted">Esta área é exclusiva do administrador da plataforma.</p>
        <Link href="/app" className="mt-4 inline-block font-semibold text-brand-600">
          Voltar ao app
        </Link>
      </div>
    );
  return (
    <div className="min-h-dvh">
      <div className="h-2 w-full bg-violet-700" aria-hidden />
      <div className="mx-auto max-w-7xl px-4 py-5">
        <div className="mb-4 flex items-center justify-between">
          <Logo />
          <Link href="/app" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
            <ArrowLeft className="h-4 w-4" /> Voltar ao app
          </Link>
        </div>
        <PageHeader title="Administração da plataforma" description="Acesso a dados de clientes é limitado ao necessário e fica registrado na auditoria." />
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "painel", label: "Indicadores" },
            { value: "empresas", label: "Empresas" },
            { value: "usuarios", label: "Usuários e vínculos" },
            { value: "config", label: "Configurações" },
            { value: "auditoria", label: "Auditoria" },
          ]}
        />
        {tab === "painel" && <StatsTab />}
        {tab === "empresas" && <CompaniesTab />}
        {tab === "usuarios" && <UsersTab />}
        {tab === "config" && <ConfigTab />}
        {tab === "auditoria" && <AuditTab />}
      </div>
    </div>
  );
}

function StatsTab() {
  const { data } = useData(async () => must(await getSupabase().rpc("admin_stats")) as Record<string, number>, []);
  if (!data) return <Spinner />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Empresas" value={data.companies_total} hint={`${data.companies_vendor} feirantes · ${data.companies_organizer} organizadores`} />
      <Stat label="Empresas suspensas" value={data.companies_suspended} tone={data.companies_suspended ? "bad" : "neutral"} />
      <Stat label="Usuários" value={data.users_total} hint={`${data.users_30d} nos últimos 30 dias`} />
      <Stat label="Empresas de demonstração" value={data.companies_demo} />
      <Stat label="Eventos (organizadores)" value={data.events_total} hint={`${data.events_upcoming} futuros · ${data.events_published} publicados`} />
      <Stat label="Participações (feirantes)" value={data.editions_total} />
      <Stat label="Vínculos ativos" value={data.links_active} />
      <Stat label="Vendas (30 dias)" value={data.sales_30d} />
    </div>
  );
}

function CompaniesTab() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [changing, setChanging] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [reasonFor, setReasonFor] = useState<any>(null);
  const [reason, setReason] = useState("");
  const { data, loading, reload } = useData(
    async () => must(await getSupabase().rpc("admin_companies", { p_search: q || null, p_kind: kind || null, p_status: status || null })) as any[],
    [q, kind, status],
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Buscar" className="min-w-56 flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome ou cidade" />
          </div>
        </Field>
        <Field label="Tipo">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Todos</option>
            <option value="vendor">Feirante</option>
            <option value="organizer">Organizador</option>
          </Select>
        </Field>
        <Field label="Situação">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todas</option>
            <option value="active">Ativas</option>
            <option value="suspended">Suspensas</option>
          </Select>
        </Field>
      </div>
      {loading && <Spinner />}
      {data && (
        <Table>
          <thead>
            <tr>
              <Th>Empresa</Th>
              <Th>Tipo</Th>
              <Th>Situação</Th>
              <Th>Membros</Th>
              <Th>Criada</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id}>
                <Td>
                  <b>{c.name}</b> {c.is_demo && <Badge tone="warning">DEMO</Badge>}
                  <span className="block text-xs text-muted">
                    {c.owner_email} {c.city && `· ${c.city}`}
                  </span>
                </Td>
                <Td>{COMPANY_KIND[c.kind]}</Td>
                <Td>
                  <Badge tone={c.status === "active" ? "success" : "danger"}>{c.status === "active" ? "Ativa" : "Suspensa"}</Badge>
                  {c.suspended_reason && <span className="block text-xs text-muted">{c.suspended_reason}</span>}
                </Td>
                <Td>{c.members}</Td>
                <Td>{formatDateTime(c.created_at)}</Td>
                <Td className="whitespace-nowrap text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setReason("");
                      setReasonFor(c);
                    }}
                  >
                    Detalhes
                  </Button>
                  <Button size="sm" variant={c.status === "active" ? "danger" : "success"} onClick={() => setChanging(c)}>
                    {c.status === "active" ? "Suspender" : "Reativar"}
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <ConfirmDialog
        open={!!changing}
        title={changing?.status === "active" ? `Suspender ${changing?.name}?` : `Reativar ${changing?.name}?`}
        message={changing?.status === "active" ? "Os membros perdem o acesso, mas todo o histórico é preservado." : "Os membros voltam a ter acesso."}
        confirmLabel={changing?.status === "active" ? "Suspender" : "Reativar"}
        tone={changing?.status === "active" ? "danger" : "primary"}
        requireReason
        onClose={() => setChanging(null)}
        onConfirm={async (r) => {
          const { error } = await getSupabase().rpc("admin_set_company_status", { p_company: changing.id, p_status: changing.status === "active" ? "suspended" : "active", p_reason: r });
          if (error) return toast.error(friendlyError(error));
          toast.success("Situação atualizada e registrada na auditoria.");
          setChanging(null);
          reload();
        }}
      />
      <Modal
        open={!!reasonFor}
        onClose={() => setReasonFor(null)}
        title="Acessar dados da empresa"
        size="sm"
        footer={
          <Button
            disabled={reason.trim().length < 5}
            onClick={async () => {
              const { data, error } = await getSupabase().rpc("admin_company_detail", { p_company: reasonFor.id, p_reason: reason });
              if (error) return toast.error(friendlyError(error));
              setDetail(data);
              setReasonFor(null);
            }}
          >
            Acessar
          </Button>
        }
      >
        <p className="mb-2 text-sm">O acesso a dados de clientes é registrado. Informe o motivo (ex.: atendimento de suporte solicitado).</p>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} aria-label="Motivo" />
      </Modal>
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.company?.name ?? ""}>
        {detail && (
          <div className="space-y-3 text-sm">
            <p>
              {COMPANY_KIND[detail.company.kind]} · {detail.company.city ?? "—"} · {detail.company.email ?? "—"}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(detail.counts).map(([k, v]) => (
                <div key={k} className="rounded-xl bg-cream p-2 text-center ring-1 ring-line">
                  <p className="text-lg font-bold">{String(v)}</p>
                  <p className="text-xs text-muted">{k}</p>
                </div>
              ))}
            </div>
            <ul>
              {detail.members.map((m: any) => (
                <li key={m.user_id}>
                  {m.email} — {ROLE[m.role]} {!m.active && "(inativo)"}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">Resumo limitado: dados financeiros e de vendas não são exibidos.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function UsersTab() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [toggling, setToggling] = useState<{ user: any; m: any } | null>(null);
  const { data, loading, reload } = useData(async () => must(await getSupabase().rpc("admin_users", { p_search: q || null })) as any[], [q]);
  return (
    <div className="space-y-3">
      <Field label="Buscar" className="max-w-md">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="E-mail ou nome" />
      </Field>
      {loading && <Spinner />}
      {data && (
        <Table>
          <thead>
            <tr>
              <Th>Usuário</Th>
              <Th>Cadastro</Th>
              <Th>Último acesso</Th>
              <Th>Empresas</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((u) => (
              <tr key={u.id}>
                <Td>
                  <b>{u.full_name || "—"}</b> {u.is_admin && <Badge tone="info">Admin plataforma</Badge>}
                  <span className="block text-xs text-muted">
                    {u.email} {!u.email_confirmed && "· e-mail não confirmado"}
                  </span>
                </Td>
                <Td>{formatDateTime(u.created_at)}</Td>
                <Td>{formatDateTime(u.last_sign_in_at)}</Td>
                <Td>
                  <ul className="space-y-1">
                    {u.memberships.map((m: any) => (
                      <li key={m.company_id} className="flex flex-wrap items-center gap-1 text-xs">
                        <span className={m.active ? "" : "line-through"}>
                          {m.company_name} ({ROLE[m.role]})
                        </span>
                        <button className="font-semibold text-brand-600 hover:underline" onClick={() => setToggling({ user: u, m })}>
                          {m.active ? "desativar" : "reativar"}
                        </button>
                      </li>
                    ))}
                  </ul>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <ConfirmDialog
        open={!!toggling}
        title={toggling?.m.active ? "Desativar vínculo?" : "Reativar vínculo?"}
        message={`${toggling?.user.email} em ${toggling?.m.company_name}`}
        confirmLabel="Confirmar"
        requireReason
        onClose={() => setToggling(null)}
        onConfirm={async (r) => {
          const { error } = await getSupabase().rpc("admin_set_membership", { p_company: toggling!.m.company_id, p_user: toggling!.user.id, p_active: !toggling!.m.active, p_reason: r });
          if (error) return toast.error(friendlyError(error));
          toast.success("Vínculo atualizado.");
          setToggling(null);
          reload();
        }}
      />
    </div>
  );
}

function ConfigTab() {
  const toast = useToast();
  const { data, reload } = useData(async () => {
    const s = getSupabase();
    return {
      cats: must(await s.from("default_categories").select("*").order("company_kind").order("kind").order("sort")) as any[],
      settings: must(await s.from("platform_settings").select("*").order("key")) as any[],
      plans: must(await s.from("plans").select("*")) as any[],
      terms: must(await s.from("consent_terms").select("*").order("code").order("version", { ascending: false })) as any[],
    };
  }, []);
  const [nc, setNc] = useState({ company_kind: "vendor", kind: "expense", name: "", stock: false });
  const [termEdit, setTermEdit] = useState<any>(null);
  if (!data) return <Spinner />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Categorias padrão (novas empresas)">
        <div className="mb-3 grid gap-2 sm:grid-cols-4">
          <Select value={nc.company_kind} onChange={(e) => setNc({ ...nc, company_kind: e.target.value })} aria-label="Tipo de empresa">
            <option value="vendor">Feirante</option>
            <option value="organizer">Organizador</option>
          </Select>
          <Select value={nc.kind} onChange={(e) => setNc({ ...nc, kind: e.target.value })} aria-label="Tipo">
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
          </Select>
          <Input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} placeholder="Nome" aria-label="Nome" />
          <Button
            onClick={async () => {
              if (!nc.name.trim()) return;
              const { error } = await getSupabase().from("default_categories").insert({ company_kind: nc.company_kind, kind: nc.kind, name: nc.name.trim(), is_stock_purchase: nc.stock });
              if (error) return toast.error(friendlyError(error));
              setNc({ ...nc, name: "" });
              reload();
            }}
          >
            Adicionar
          </Button>
        </div>
        <ul className="max-h-96 divide-y divide-line overflow-y-auto text-sm">
          {data.cats.map((c) => (
            <li key={c.id} className={`flex items-center justify-between py-1.5 ${c.active ? "" : "opacity-50"}`}>
              <span>
                {c.name} <Badge>{COMPANY_KIND[c.company_kind]}</Badge> <Badge tone={c.kind === "income" ? "success" : "danger"}>{c.kind === "income" ? "Receita" : "Despesa"}</Badge>
              </span>
              <button
                className="text-xs font-semibold text-brand-600"
                onClick={async () => {
                  await getSupabase().from("default_categories").update({ active: !c.active }).eq("id", c.id);
                  reload();
                }}
              >
                {c.active ? "desativar" : "ativar"}
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <div className="space-y-4">
        <Card title="Configurações gerais">
          <ul className="space-y-2 text-sm">
            {data.settings.map((s) => (
              <li key={s.key} className="grid gap-1">
                <span className="font-semibold">{s.description ?? s.key}</span>
                <Input
                  defaultValue={JSON.stringify(s.value)}
                  aria-label={s.key}
                  onBlur={async (e) => {
                    let v: unknown;
                    try {
                      v = JSON.parse(e.target.value);
                    } catch {
                      return toast.error("Valor inválido (use formato JSON, ex.: \"texto\" ou true).");
                    }
                    const { error } = await getSupabase().from("platform_settings").update({ value: v, updated_at: new Date().toISOString() }).eq("key", s.key);
                    if (error) return toast.error(friendlyError(error));
                    toast.success("Configuração salva.");
                  }}
                />
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Planos (estrutura para assinaturas futuras)">
          <InfoBox>Cobrança recorrente não está implementada nesta versão. Todas as empresas usam o plano gratuito.</InfoBox>
          <ul className="mt-2 text-sm">
            {data.plans.map((p) => (
              <li key={p.code}>
                <b>{p.name}</b> ({p.code}) — {p.description}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Termos de consentimento">
          <ul className="space-y-2 text-sm">
            {data.terms.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2">
                <span>
                  {t.title} <Badge tone={t.active ? "success" : "neutral"}>v{t.version}</Badge>
                </span>
                {t.active && (
                  <Button size="sm" variant="secondary" onClick={() => setTermEdit({ ...t })}>
                    Nova versão
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Modal
        open={!!termEdit}
        onClose={() => setTermEdit(null)}
        title="Publicar nova versão do termo"
        size="lg"
        footer={
          <Button
            onClick={async () => {
              const { error } = await getSupabase().rpc("admin_publish_term", { p_code: termEdit.code, p_title: termEdit.title, p_body: termEdit.body });
              if (error) return toast.error(friendlyError(error));
              toast.success("Nova versão publicada. Novos aceites usarão esta versão.");
              setTermEdit(null);
              reload();
            }}
          >
            Publicar versão
          </Button>
        }
      >
        {termEdit && (
          <div className="space-y-3">
            <Field label="Título">
              <Input value={termEdit.title} onChange={(e) => setTermEdit({ ...termEdit, title: e.target.value })} />
            </Field>
            <Field label="Texto">
              <Textarea value={termEdit.body} onChange={(e) => setTermEdit({ ...termEdit, body: e.target.value })} rows={14} />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}

function AuditTab() {
  const [action, setAction] = useState("");
  const { data, loading } = useData(async () => must(await getSupabase().rpc("admin_audit", { p_company: null, p_action: action || null, p_limit: 300 })) as any[], [action]);
  return (
    <div className="space-y-3">
      <Field label="Filtrar ação" className="max-w-xs">
        <Select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">Todas</option>
          <option value="admin">Ações administrativas</option>
          <option value="insert">Inclusões</option>
          <option value="update">Alterações</option>
          <option value="delete">Exclusões</option>
        </Select>
      </Field>
      {loading && <Spinner />}
      {data && (
        <Table>
          <thead>
            <tr>
              <Th>Quando</Th>
              <Th>Quem</Th>
              <Th>Empresa</Th>
              <Th>Ação</Th>
              <Th>Registro</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((a) => (
              <tr key={a.id}>
                <Td className="whitespace-nowrap">{formatDateTime(a.created_at)}</Td>
                <Td>{a.actor_email ?? "sistema"}</Td>
                <Td>{a.company_name ?? "—"}</Td>
                <Td>
                  <Badge tone={a.action.startsWith("admin") ? "info" : "neutral"}>{a.action}</Badge>
                </Td>
                <Td className="text-xs">
                  {a.entity} {a.details?.reason && <span className="block text-muted">Motivo: {a.details.reason}</span>}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
