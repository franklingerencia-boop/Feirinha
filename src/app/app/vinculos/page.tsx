"use client";

import { Bell, CalendarPlus, Handshake } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { ConsentDialog, ScopePicker } from "@/components/shared/consent";
import { Badge, Button, Card, Checkbox, ConfirmDialog, EmptyState, Field, InfoBox, Modal, PageHeader, Select, Spinner, Tabs } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatDateTime, rangeLabel } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { FEE_MODE, REQUEST_STATUS, STATUS_TONE, VENDOR_FIELDS } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { getSupabase } from "@/lib/supabase/client";
import { must, useData } from "@/lib/use-data";

type Link_ = {
  id: string;
  event_id: string;
  event_name: string;
  status: "active" | "revoked";
  scope: { vendor_fields: string[] };
  pending_scope: { vendor_fields: string[] } | null;
  pending_by_me: boolean;
  terms_version: number;
  created_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
  organizer_name: string;
  vendor_name: string;
  my_side: "organizer" | "vendor";
  vendor_edition_id: string | null;
  participant_id: string | null;
  first_day: string | null;
  unread_notices: number | null;
};

type Req = {
  id: string;
  event_id: string;
  event_name: string;
  direction: "request" | "invite";
  status: string;
  message: string | null;
  response_message: string | null;
  created_at: string;
  organizer_name: string;
  event: any;
  participant: { fee_mode: string; fee_cents: number; discount_cents: number; due_date: string | null; total_cents: number } | null;
};

export default function LinksPage() {
  const { company } = useActiveCompany();
  const isVendor = company.kind === "vendor";
  const [tab, setTab] = useState<"links" | "invites" | "requests">(isVendor ? "invites" : "links");
  const { data, loading, error, reload } = useData(async () => {
    const s = getSupabase();
    const links = must(await s.rpc("my_links", { p_company: company.id })) as Link_[];
    const reqs = isVendor ? (must(await s.rpc("vendor_requests", { p_company: company.id })) as Req[]) : [];
    return { links, reqs };
  }, [company.id]);

  const invites = data?.reqs.filter((r) => r.direction === "invite") ?? [];
  const requests = data?.reqs.filter((r) => r.direction === "request") ?? [];
  const pendingInvites = invites.filter((r) => r.status === "pending").length;

  return (
    <div key={company.id}>
      <PageHeader
        title={isVendor ? "Vínculos e convites" : "Vínculos com feirantes"}
        description={
          isVendor
            ? "Conexões com organizadores que usam a plataforma. Nada é compartilhado sem o seu aceite, e você pode revogar a qualquer momento."
            : "Feirantes da plataforma conectados aos seus eventos. Você vê apenas os dados que cada feirante autorizou."
        }
      />
      {isVendor && (
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "invites", label: "Convites recebidos", count: pendingInvites || undefined },
            { value: "requests", label: "Minhas solicitações" },
            { value: "links", label: "Vínculos", count: data?.links.length },
          ]}
        />
      )}
      {loading && <Spinner />}
      {error && <InfoBox tone="danger">{error}</InfoBox>}
      {data && tab === "links" && <LinksList links={data.links} reload={reload} />}
      {data && tab === "invites" && <InvitesList invites={invites} reload={reload} />}
      {data && tab === "requests" && <RequestsList requests={requests} reload={reload} />}
    </div>
  );
}

function LinksList({ links, reload }: { links: Link_[]; reload: () => void }) {
  const toast = useToast();
  const [revoking, setRevoking] = useState<Link_ | null>(null);
  const [scopeFor, setScopeFor] = useState<Link_ | null>(null);
  const [attach, setAttach] = useState<Link_ | null>(null);
  const [vendorData, setVendorData] = useState<{ link: Link_; data: Record<string, string> } | null>(null);
  const [respond, setRespond] = useState<Link_ | null>(null);

  if (links.length === 0) return <EmptyState icon={<Handshake className="h-10 w-10" />} title="Nenhum vínculo ainda" description="Vínculos surgem quando um feirante solicita participação e o organizador aprova, ou quando um convite é aceito." />;

  return (
    <div className="space-y-3">
      {links.map((l) => (
        <Card key={l.id} className={l.status === "revoked" ? "opacity-70" : ""}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-lg font-bold">{l.event_name}</p>
              <p className="text-sm text-muted">
                {l.my_side === "vendor" ? `Organizador: ${l.organizer_name}` : `Feirante: ${l.vendor_name}`} · {formatDate(l.first_day)}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              <Badge tone={STATUS_TONE[l.status]}>{l.status === "active" ? "Ativo" : "Revogado"}</Badge>
              {!!l.unread_notices && (
                <Badge tone="warning">
                  <Bell className="mr-1 h-3 w-3" />
                  {l.unread_notices} alteração(ões)
                </Badge>
              )}
            </div>
          </div>
          <p className="mt-2 text-sm">
            <b>Dados do feirante autorizados:</b> {l.scope.vendor_fields.map((f) => VENDOR_FIELDS[f]?.replace(" (sempre)", "") ?? f).join(", ")}
            <span className="text-xs text-muted"> · termo v{l.terms_version} · desde {formatDate(l.created_at)}</span>
          </p>
          {l.pending_scope && l.status === "active" && (
            <InfoBox tone="warning">
              {l.pending_by_me ? "Você propôs um novo escopo; aguardando aceite da outra parte." : "A outra parte propôs um novo escopo de compartilhamento."} Proposta:{" "}
              {l.pending_scope.vendor_fields.map((f) => VENDOR_FIELDS[f]?.replace(" (sempre)", "") ?? f).join(", ")}.
              {!l.pending_by_me && (
                <Button size="sm" className="ml-2" onClick={() => setRespond(l)}>
                  Responder
                </Button>
              )}
            </InfoBox>
          )}
          {l.status === "revoked" && (
            <p className="text-sm text-muted">
              Revogado em {formatDateTime(l.revoked_at)}
              {l.revoke_reason && ` — ${l.revoke_reason}`}. O compartilhamento foi encerrado; o histórico de cada empresa foi preservado.
            </p>
          )}
          {l.status === "active" && (
            <div className="mt-3 flex flex-wrap gap-2">
              {l.my_side === "vendor" &&
                (l.vendor_edition_id ? (
                  <Link href={`/app/agenda/${l.vendor_edition_id}`} className="inline-flex h-9 items-center rounded-xl bg-brand-500 px-3 text-sm font-semibold text-white">
                    Ver na minha agenda
                  </Link>
                ) : (
                  <Button size="sm" icon={<CalendarPlus className="h-4 w-4" />} onClick={() => setAttach(l)}>
                    Adicionar à agenda
                  </Button>
                ))}
              {l.my_side === "organizer" && (
                <>
                  <Button
                    size="sm"
                    onClick={async () => {
                      const { data, error } = await getSupabase().rpc("organizer_link_vendor", { p_link: l.id });
                      if (error) return toast.error(friendlyError(error));
                      setVendorData({ link: l, data: data as Record<string, string> });
                    }}
                  >
                    Ver dados autorizados
                  </Button>
                  <Link href={`/app/eventos/${l.event_id}?aba=participantes`} className="inline-flex h-9 items-center rounded-xl border border-line px-3 text-sm font-semibold">
                    Ver participação
                  </Link>
                </>
              )}
              <Button size="sm" variant="secondary" onClick={() => setScopeFor(l)}>
                Alterar escopo
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRevoking(l)}>
                Revogar permissão
              </Button>
            </div>
          )}
        </Card>
      ))}
      <ConfirmDialog
        open={!!revoking}
        title="Revogar a permissão?"
        message={
          <>
            O compartilhamento e as atualizações futuras entre as empresas serão encerrados. <b>A participação não é cancelada e os pagamentos não são apagados</b> — isso tem controles próprios.
            Os registros de histórico de cada empresa são mantidos.
          </>
        }
        confirmLabel="Revogar"
        requireReason
        onClose={() => setRevoking(null)}
        onConfirm={async (reason) => {
          const { error } = await getSupabase().rpc("revoke_link", { p_link: revoking!.id, p_reason: reason });
          if (error) return toast.error(friendlyError(error));
          toast.success("Permissão revogada.");
          setRevoking(null);
          reload();
        }}
      />
      {scopeFor && <ScopeChange link={scopeFor} onClose={() => setScopeFor(null)} onDone={reload} />}
      {attach && <AttachDialog link={attach} onClose={() => setAttach(null)} onDone={reload} />}
      <Modal
        open={!!respond}
        onClose={() => setRespond(null)}
        title="Novo escopo de compartilhamento"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={async () => {
                const { error } = await getSupabase().rpc("respond_link_scope", { p_link: respond!.id, p_accept: false });
                if (error) return toast.error(friendlyError(error));
                toast.success("Proposta recusada. O escopo atual continua valendo.");
                setRespond(null);
                reload();
              }}
            >
              Recusar
            </Button>
            <Button
              onClick={async () => {
                const { error } = await getSupabase().rpc("respond_link_scope", { p_link: respond!.id, p_accept: true });
                if (error) return toast.error(friendlyError(error));
                toast.success("Escopo atualizado.");
                setRespond(null);
                reload();
              }}
            >
              Aceitar (novo aceite do termo)
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Proposta: <b>{respond?.pending_scope?.vendor_fields.map((f) => VENDOR_FIELDS[f]?.replace(" (sempre)", "") ?? f).join(", ")}</b>. Ao aceitar, você aceita novamente o termo de
          permissão vigente para este evento, e o aceite fica registrado.
        </p>
      </Modal>
      <Modal open={!!vendorData} onClose={() => setVendorData(null)} title="Dados autorizados pelo feirante" size="sm">
        {vendorData && (
          <dl className="space-y-2 text-sm">
            {Object.entries(vendorData.data).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs font-semibold uppercase text-muted">{VENDOR_FIELDS[k === "products" ? "products" : k]?.replace(" (sempre)", "") ?? k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
            <p className="text-xs text-muted">Vendas, contas, fornecedores e finanças do feirante nunca são compartilhados.</p>
          </dl>
        )}
      </Modal>
    </div>
  );
}

function ScopeChange({ link, onClose, onDone }: { link: Link_; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { company } = useActiveCompany();
  const [scope, setScope] = useState<string[]>(link.scope.vendor_fields.filter((f) => f !== "trade_name"));
  const [consent, setConsent] = useState(false);
  return (
    <>
      <Modal
        open={!consent}
        onClose={onClose}
        title="Alterar escopo de compartilhamento"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={() => setConsent(true)}>Continuar</Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted">A mudança só vale depois que a outra parte aceitar. Até lá, continua valendo o escopo atual.</p>
        <ScopePicker value={scope} onChange={setScope} />
      </Modal>
      <ConsentDialog
        open={consent}
        onClose={() => setConsent(false)}
        code="link"
        confirmLabel="Aceitar e propor"
        parties={[
          { label: "Sua empresa", value: company.name },
          { label: link.my_side === "vendor" ? "Organizador" : "Feirante", value: link.my_side === "vendor" ? link.organizer_name : link.vendor_name },
          { label: "Evento", value: link.event_name },
          { label: "Novo escopo", value: ["Nome comercial", ...scope.map((f) => VENDOR_FIELDS[f])].join(", ") },
        ]}
        onAccept={async () => {
          const { error } = await getSupabase().rpc("propose_link_scope", { p_link: link.id, p_scope: { vendor_fields: scope }, p_accept_terms: true });
          if (error) return toast.error(friendlyError(error));
          toast.success("Proposta enviada. Aguardando aceite da outra parte.");
          onDone();
          onClose();
        }}
      />
    </>
  );
}

/** Adiciona o evento vinculado à agenda, criando uma edição nova ou associando a uma já cadastrada (sem duplicar). */
function AttachDialog({ link, onClose, onDone }: { link: Link_; onClose: () => void; onDone: () => void }) {
  const { company } = useActiveCompany();
  const toast = useToast();
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [editionId, setEditionId] = useState("");
  const [applyFee, setApplyFee] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data: eds } = useData(
    async () =>
      must(
        await getSupabase()
          .from("edition_overview")
          .select("id,fair_name,name,first_day,last_day,link_id")
          .eq("company_id", company.id)
          .is("link_id", null)
          .neq("status", "canceled")
          .order("first_day", { ascending: false }),
      ) as any[],
    [company.id],
  );
  const suggested = (eds ?? []).filter((e) => link.first_day && e.first_day && Math.abs(new Date(e.first_day).getTime() - new Date(link.first_day).getTime()) < 7 * 86400000);
  const save = async () => {
    if (mode === "existing" && (!editionId || !confirmed)) return toast.error("Escolha a feira e confirme a associação.");
    setBusy(true);
    const { data, error } = await getSupabase().rpc("vendor_attach_link", {
      p_link: link.id,
      p_existing_edition: mode === "existing" ? editionId : null,
      p_fair_id: null,
      p_apply_fee: mode === "new" ? true : applyFee,
    });
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    toast.success("Evento adicionado à sua agenda.");
    onDone();
    onClose();
    window.location.href = `/app/agenda/${data}`;
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Adicionar à minha agenda"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={busy}>
            Confirmar
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        {suggested.length > 0 && (
          <InfoBox tone="warning">Você já tem feira(s) cadastrada(s) manualmente em datas próximas. Para não duplicar, considere associar o evento a uma delas.</InfoBox>
        )}
        <div className="flex gap-2">
          <Button size="sm" variant={mode === "new" ? "primary" : "secondary"} onClick={() => setMode("new")}>
            Criar nova na agenda
          </Button>
          <Button size="sm" variant={mode === "existing" ? "primary" : "secondary"} onClick={() => setMode("existing")} disabled={!eds?.length}>
            Associar a uma já cadastrada
          </Button>
        </div>
        {mode === "existing" && (
          <>
            <Field label="Feira cadastrada manualmente">
              <Select value={editionId} onChange={(e) => setEditionId(e.target.value)}>
                <option value="">Selecione...</option>
                {(suggested.length ? suggested : eds ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fair_name} - {e.name} ({rangeLabel(e.first_day, e.last_day)})
                  </option>
                ))}
              </Select>
            </Field>
            <Checkbox label="Atualizar a taxa com o valor combinado com o organizador" checked={applyFee} onChange={setApplyFee} />
            <Checkbox label="Confirmo que esta feira cadastrada é o mesmo evento do organizador." checked={confirmed} onChange={setConfirmed} />
          </>
        )}
        <p className="text-xs text-muted">Datas, horários, local e barraca serão preenchidos com os dados oficiais do organizador. Suas anotações e despesas continuam privadas.</p>
      </div>
    </Modal>
  );
}

function InvitesList({ invites, reload }: { invites: Req[]; reload: () => void }) {
  const { company } = useActiveCompany();
  const toast = useToast();
  const [accepting, setAccepting] = useState<Req | null>(null);
  const [scope, setScope] = useState<string[]>(["phone", "whatsapp", "segment", "products"]);
  const [consent, setConsent] = useState(false);
  if (invites.length === 0) return <EmptyState title="Nenhum convite recebido" description="Organizadores que usam a plataforma podem convidar você para eventos pelo seu e-mail." />;
  return (
    <div className="space-y-3">
      {invites.map((r) => (
        <Card key={r.id}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-lg font-bold">{r.event_name}</p>
              <p className="text-sm text-muted">Convite de {r.organizer_name} · {formatDate(r.created_at)}</p>
            </div>
            <Badge tone={STATUS_TONE[r.status]}>{REQUEST_STATUS[r.status]}</Badge>
          </div>
          {r.event && (
            <p className="mt-1 text-sm">
              {rangeLabel(r.event.first_day, r.event.last_day)} · {[r.event.location_name, r.event.address].filter(Boolean).join(" · ")}
            </p>
          )}
          {r.participant && (
            <p className="text-sm">
              Taxa combinada: <b>{formatBRL(r.participant.total_cents)}</b> ({FEE_MODE[r.participant.fee_mode]}) · vencimento {formatDate(r.participant.due_date)}
            </p>
          )}
          {r.message && <p className="mt-1 text-sm italic">“{r.message}”</p>}
          {r.status === "pending" && (
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => setAccepting(r)}>
                Aceitar convite
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const { error } = await getSupabase().rpc("reject_request", { p_request: r.id, p_response: null });
                  if (error) return toast.error(friendlyError(error));
                  toast.success("Convite recusado.");
                  reload();
                }}
              >
                Recusar
              </Button>
            </div>
          )}
        </Card>
      ))}
      <Modal
        open={!!accepting && !consent}
        onClose={() => setAccepting(null)}
        title="O que você autoriza compartilhar"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAccepting(null)}>
              Cancelar
            </Button>
            <Button onClick={() => setConsent(true)}>Continuar</Button>
          </>
        }
      >
        <ScopePicker value={scope} onChange={setScope} />
      </Modal>
      <ConsentDialog
        open={!!accepting && consent}
        onClose={() => setConsent(false)}
        code="link"
        confirmLabel="Aceitar e conectar"
        parties={[
          { label: "Feirante", value: company.name },
          { label: "Organizador", value: accepting?.organizer_name },
          { label: "Evento", value: accepting?.event_name },
          { label: "Seus dados compartilhados", value: ["Nome comercial", ...scope.map((f) => VENDOR_FIELDS[f])].join(", ") },
        ]}
        onAccept={async () => {
          const { error } = await getSupabase().rpc("accept_invite", { p_request: accepting!.id, p_scope: { vendor_fields: scope }, p_accept_terms: true });
          if (error) return toast.error(friendlyError(error));
          toast.success("Convite aceito. Adicione o evento à sua agenda na aba Vínculos.");
          setConsent(false);
          setAccepting(null);
          reload();
        }}
      />
    </div>
  );
}

function RequestsList({ requests, reload }: { requests: Req[]; reload: () => void }) {
  const toast = useToast();
  if (requests.length === 0)
    return <EmptyState title="Nenhuma solicitação enviada" description="Procure eventos em “Feiras disponíveis” e solicite participação." action={<Link className="font-semibold text-brand-600" href="/app/feiras-disponiveis">Ver feiras disponíveis</Link>} />;
  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <Card key={r.id}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-bold">{r.event_name}</p>
              <p className="text-sm text-muted">
                {r.organizer_name} · enviada em {formatDate(r.created_at)}
              </p>
            </div>
            <Badge tone={STATUS_TONE[r.status]}>{REQUEST_STATUS[r.status]}</Badge>
          </div>
          {r.response_message && <p className="mt-1 text-sm">Resposta: “{r.response_message}”</p>}
          {r.status === "pending" && (
            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              onClick={async () => {
                const { error } = await getSupabase().rpc("cancel_request", { p_request: r.id });
                if (error) return toast.error(friendlyError(error));
                reload();
              }}
            >
              Cancelar solicitação
            </Button>
          )}
        </Card>
      ))}
    </div>
  );
}
