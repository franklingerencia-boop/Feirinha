"use client";

import { CalendarDays, ExternalLink, MapPin, Search, Store } from "lucide-react";
import { useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { ConsentDialog, ScopePicker } from "@/components/shared/consent";
import { Badge, Button, Card, EmptyState, Field, InfoBox, Input, Modal, PageHeader, Spinner, Textarea } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatTime, rangeLabel, weekday } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { FEE_MODE, REQUEST_STATUS, VENDOR_FIELDS } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { getSupabase } from "@/lib/supabase/client";
import { must, useData } from "@/lib/use-data";

type Pub = {
  id: string;
  name: string;
  organizer_name: string;
  description?: string;
  location_name?: string;
  address?: string;
  map_url?: string;
  city?: string;
  first_day?: string;
  last_day?: string;
  days?: { day: string; open_time: string | null; close_time: string | null; setup_time: string | null }[];
  segments?: string;
  structure?: string;
  rules?: string;
  stalls_total?: number;
  free_slots?: number;
  fee_mode?: string;
  default_fee_cents?: number;
  stall_types?: { name: string; size_label: string | null; fee_cents: number; fee_mode: string }[];
  payment_due_date?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  my_request_status?: string | null;
  my_link_active?: boolean;
};

export default function AvailableFairsPage() {
  const { company } = useActiveCompany();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<Pub | null>(null);
  const { data, loading, error, reload } = useData(
    async () => must(await getSupabase().rpc("list_available_events", { p_company: company.id, p_search: search || null })) as Pub[],
    [company.id, search],
  );

  if (company.kind !== "vendor") return <InfoBox>Esta área é para empresas feirantes.</InfoBox>;
  return (
    <div>
      <PageHeader
        title="Feiras disponíveis"
        description="Eventos que organizadores da plataforma autorizaram divulgar. Solicitar participação não garante vaga: o organizador aprova cada pedido."
      />
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(q.trim());
        }}
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, local ou endereço" aria-label="Buscar feiras" />
        </div>
        <Button type="submit">Buscar</Button>
      </form>
      {loading && <Spinner />}
      {error && <InfoBox tone="danger">{error}</InfoBox>}
      {data && data.length === 0 && (
        <EmptyState icon={<Store className="h-10 w-10" />} title="Nenhuma feira publicada no momento" description="Quando organizadores publicarem eventos, eles aparecem aqui. Você continua podendo cadastrar feiras manualmente na sua agenda." />
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {data?.map((e) => (
          <Card key={e.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-lg font-bold">{e.name}</p>
                <p className="text-sm text-muted">por {e.organizer_name}</p>
              </div>
              {e.my_link_active ? (
                <Badge tone="success">Você participa</Badge>
              ) : e.my_request_status ? (
                <Badge tone={e.my_request_status === "pending" ? "warning" : e.my_request_status === "approved" ? "success" : "neutral"}>{REQUEST_STATUS[e.my_request_status]}</Badge>
              ) : null}
            </div>
            {e.first_day && (
              <p className="mt-2 flex items-center gap-1 text-sm font-semibold">
                <CalendarDays className="h-4 w-4 text-brand-500" />
                {rangeLabel(e.first_day, e.last_day)}
              </p>
            )}
            {(e.location_name || e.address) && (
              <p className="flex items-center gap-1 text-sm text-muted">
                <MapPin className="h-4 w-4" />
                {[e.location_name, e.address].filter(Boolean).join(" · ")}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              {e.free_slots != null && <Badge tone="brand">{Math.max(0, e.free_slots)} vaga(s) livre(s) (barraca×dia)</Badge>}
              {e.default_fee_cents != null && (
                <Badge>
                  Taxa {formatBRL(e.default_fee_cents)} · {FEE_MODE[e.fee_mode ?? "per_event"]}
                </Badge>
              )}
            </div>
            <Button className="mt-3" variant="secondary" onClick={() => setDetail(e)}>
              Ver detalhes
            </Button>
          </Card>
        ))}
      </div>
      {detail && <EventDetail ev={detail} onClose={() => setDetail(null)} onRequested={reload} />}
    </div>
  );
}

function EventDetail({ ev, onClose, onRequested }: { ev: Pub; onClose: () => void; onRequested: () => void }) {
  const { company } = useActiveCompany();
  const toast = useToast();
  const [scope, setScope] = useState<string[]>(["phone", "whatsapp", "segment", "products"]);
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const canRequest = !ev.my_link_active && ev.my_request_status !== "pending";

  return (
    <>
      <Modal
        open={!consent}
        onClose={onClose}
        title={ev.name}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Fechar
            </Button>
            {canRequest && <Button onClick={() => setConsent(true)}>Solicitar participação</Button>}
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-muted">Organizado por {ev.organizer_name}</p>
          {ev.description && <p className="whitespace-pre-wrap">{ev.description}</p>}
          {ev.days && ev.days.length > 0 && (
            <div>
              <p className="font-bold">Datas e horários</p>
              <ul>
                {ev.days.map((d) => (
                  <li key={d.day}>
                    {weekday(d.day)}, {formatDate(d.day)}
                    {d.open_time && ` — ${formatTime(d.open_time)} às ${formatTime(d.close_time)}`}
                    {d.setup_time && ` (montagem ${formatTime(d.setup_time)})`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(ev.location_name || ev.address) && (
            <p>
              <b>Local:</b> {[ev.location_name, ev.address, ev.city].filter(Boolean).join(" · ")}{" "}
              {ev.map_url && (
                <a className="inline-flex items-center gap-1 font-semibold text-brand-600" href={ev.map_url} target="_blank" rel="noopener noreferrer">
                  mapa <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </p>
          )}
          {ev.segments && (
            <p>
              <b>Segmentos aceitos:</b> {ev.segments}
            </p>
          )}
          {ev.structure && (
            <p>
              <b>Estrutura oferecida:</b> {ev.structure}
            </p>
          )}
          {ev.stall_types && ev.stall_types.length > 0 && (
            <div>
              <b>Tipos de barraca e taxas:</b>
              <ul className="list-disc pl-5">
                {ev.stall_types.map((t) => (
                  <li key={t.name}>
                    {t.name} {t.size_label && `(${t.size_label})`} — {formatBRL(t.fee_cents)} {FEE_MODE[t.fee_mode].toLowerCase()}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {ev.payment_due_date && <p>Prazo de pagamento: {formatDate(ev.payment_due_date)}</p>}
          {ev.rules && (
            <div>
              <b>Regras de participação:</b>
              <p className="whitespace-pre-wrap">{ev.rules}</p>
            </div>
          )}
          {(ev.contact_name || ev.contact_phone || ev.contact_email) && (
            <p>
              <b>Contato:</b> {[ev.contact_name, ev.contact_phone, ev.contact_email].filter(Boolean).join(" · ")}
            </p>
          )}
          {canRequest && (
            <div className="space-y-2 rounded-xl border border-line p-3">
              <p className="font-bold">O que você autoriza compartilhar com o organizador</p>
              <ScopePicker value={scope} onChange={setScope} />
              <Field label="Mensagem para o organizador (opcional)">
                <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} />
              </Field>
            </div>
          )}
          {ev.my_request_status === "pending" && <InfoBox tone="warning">Sua solicitação está aguardando resposta do organizador.</InfoBox>}
        </div>
      </Modal>
      <ConsentDialog
        open={consent}
        onClose={() => setConsent(false)}
        code="link"
        confirmLabel="Aceitar e enviar solicitação"
        parties={[
          { label: "Feirante", value: company.name },
          { label: "Organizador", value: ev.organizer_name },
          { label: "Evento", value: `${ev.name}${ev.first_day ? ` (${rangeLabel(ev.first_day, ev.last_day)})` : ""}` },
          { label: "Seus dados compartilhados", value: ["Nome comercial", ...scope.map((f) => VENDOR_FIELDS[f])].join(", ") },
        ]}
        extra={<InfoBox>A solicitação não confirma vaga. O vínculo só começa quando o organizador aprovar e também aceitar este termo.</InfoBox>}
        onAccept={async () => {
          const { error } = await getSupabase().rpc("request_participation", {
            p_vendor_company: company.id,
            p_event: ev.id,
            p_message: message || null,
            p_scope: { vendor_fields: scope },
            p_accept_terms: true,
          });
          if (error) return toast.error(friendlyError(error));
          toast.success("Solicitação enviada ao organizador.");
          setConsent(false);
          onRequested();
          onClose();
        }}
      />
    </>
  );
}
