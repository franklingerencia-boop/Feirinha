"use client";

import { Inbox } from "lucide-react";
import { useEffect, useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { ConsentDialog } from "@/components/shared/consent";
import { Badge, Button, Card, Checkbox, ConfirmDialog, EmptyState, Field, InfoBox, Input, Modal, MoneyInput, PageHeader, Select, Spinner, Tabs, Textarea } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { formatDate, weekday } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { REQUEST_STATUS, STATUS_TONE, VENDOR_FIELDS } from "@/lib/labels";
import { feeTotal, formatBRL } from "@/lib/money";
import { getSupabase } from "@/lib/supabase/client";
import { must, useData } from "@/lib/use-data";

type Req = {
  id: string;
  event_id: string;
  event_name: string;
  direction: "request" | "invite";
  status: string;
  message: string | null;
  response_message: string | null;
  created_at: string;
  vendor_company_name: string;
  vendor: Record<string, string> | null;
  vendor_scope: { vendor_fields: string[] } | null;
  suggestions: { id: string; trade_name: string; responsible_name: string | null; email: string | null; phone: string | null }[] | null;
};

export default function RequestsPage() {
  const { company } = useActiveCompany();
  const toast = useToast();
  const [tab, setTab] = useState<"request" | "invite">("request");
  const [approving, setApproving] = useState<Req | null>(null);
  const [rejecting, setRejecting] = useState<Req | null>(null);
  const { data, loading, error, reload } = useData(async () => must(await getSupabase().rpc("organizer_requests", { p_company: company.id })) as Req[], [company.id]);
  const list = (data ?? []).filter((r) => r.direction === tab);

  if (company.kind !== "organizer") return <InfoBox>Esta área é para organizadores.</InfoBox>;
  return (
    <div>
      <PageHeader title="Solicitações de participação" description="Pedidos de feirantes que viram seus eventos publicados e convites que você enviou. Nenhuma vaga é confirmada sem a sua aprovação." />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "request", label: "Recebidas", count: (data ?? []).filter((r) => r.direction === "request" && r.status === "pending").length || undefined },
          { value: "invite", label: "Convites enviados" },
        ]}
      />
      {loading && <Spinner />}
      {error && <InfoBox tone="danger">{error}</InfoBox>}
      {data && list.length === 0 && <EmptyState icon={<Inbox className="h-10 w-10" />} title="Nada por aqui" />}
      <div className="space-y-3">
        {list.map((r) => (
          <Card key={r.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-lg font-bold">{r.vendor_company_name}</p>
                <p className="text-sm text-muted">
                  {r.event_name} · {formatDate(r.created_at)}
                </p>
              </div>
              <Badge tone={STATUS_TONE[r.status]}>{REQUEST_STATUS[r.status]}</Badge>
            </div>
            {r.vendor && (
              <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                {Object.entries(r.vendor).map(([k, v]) => (
                  <div key={k}>
                    <dt className="inline font-semibold">{VENDOR_FIELDS[k]?.replace(" (sempre)", "") ?? k}: </dt>
                    <dd className="inline">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            {r.message && <p className="mt-2 text-sm italic">“{r.message}”</p>}
            {r.response_message && <p className="mt-1 text-sm">Resposta: {r.response_message}</p>}
            {r.status === "pending" && r.direction === "request" && (
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => setApproving(r)}>
                  Analisar e aprovar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRejecting(r)}>
                  Recusar
                </Button>
              </div>
            )}
            {r.status === "pending" && r.direction === "invite" && (
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
                Cancelar convite
              </Button>
            )}
          </Card>
        ))}
      </div>
      {approving && <ApproveDialog req={approving} onClose={() => setApproving(null)} onDone={reload} />}
      <ConfirmDialog
        open={!!rejecting}
        title="Recusar solicitação?"
        message="O feirante verá que a solicitação foi recusada, com a mensagem abaixo."
        confirmLabel="Recusar"
        requireReason
        reasonLabel="Mensagem ao feirante"
        onClose={() => setRejecting(null)}
        onConfirm={async (reason) => {
          const { error } = await getSupabase().rpc("reject_request", { p_request: rejecting!.id, p_response: reason });
          if (error) return toast.error(friendlyError(error));
          toast.success("Solicitação recusada.");
          setRejecting(null);
          reload();
        }}
      />
    </div>
  );
}

function ApproveDialog({ req, onClose, onDone }: { req: Req; onClose: () => void; onDone: () => void }) {
  const { company } = useActiveCompany();
  const toast = useToast();
  const [ev, setEv] = useState<any>(null);
  const [existing, setExisting] = useState("");
  const [confirmSame, setConfirmSame] = useState(false);
  const [typeId, setTypeId] = useState("");
  const [feeMode, setFeeMode] = useState<"per_day" | "per_event">("per_event");
  const [fee, setFee] = useState<number | null>(0);
  const [discount, setDiscount] = useState<number | null>(0);
  const [due, setDue] = useState("");
  const [days, setDays] = useState<string[]>([]);
  const [response, setResponse] = useState("");
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    const s = getSupabase();
    Promise.all([
      s.from("events").select("id,name,fee_mode,default_fee_cents,payment_due_date").eq("id", req.event_id).single(),
      s.from("event_days").select("id,day").eq("event_id", req.event_id).order("day"),
      s.from("stall_types").select("id,name,fee_cents,fee_mode").eq("event_id", req.event_id),
    ]).then(([e, d, t]) => {
      setEv({ ...e.data, days: d.data ?? [], types: t.data ?? [] });
      setFeeMode(e.data?.fee_mode ?? "per_event");
      setFee(e.data?.default_fee_cents ?? 0);
      setDue(e.data?.payment_due_date ?? "");
      setDays((d.data ?? []).map((x: any) => x.id));
    });
  }, [req.event_id]);

  if (!ev) return null;
  const total = feeTotal(feeMode, fee ?? 0, days.length, discount ?? 0);

  return (
    <>
      <Modal
        open={!consent}
        onClose={onClose}
        title={`Aprovar ${req.vendor_company_name}`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={() => setConsent(true)} disabled={days.length === 0 || (!!existing && !confirmSame)}>
              Continuar
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          {(req.suggestions?.length ?? 0) > 0 && (
            <InfoBox tone="warning" title="Possível cadastro duplicado">
              Encontramos feirante(s) já cadastrado(s) manualmente com dados parecidos. Para não duplicar, você pode associar a solicitação a um deles.
              <Field label="Associar a" className="mt-2">
                <Select value={existing} onChange={(e) => setExisting(e.target.value)}>
                  <option value="">Não, criar novo cadastro</option>
                  {req.suggestions!.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.trade_name} {[s.responsible_name, s.email, s.phone].filter(Boolean).join(" · ")}
                    </option>
                  ))}
                </Select>
              </Field>
              {existing && <Checkbox label="Confirmo que é a mesma empresa/pessoa." checked={confirmSame} onChange={setConfirmSame} />}
            </InfoBox>
          )}
          <div>
            <p className="mb-2 font-semibold">Dias aprovados</p>
            <div className="flex flex-wrap gap-2">
              {ev.days.map((d: any) => {
                const on = days.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDays((x) => (on ? x.filter((y) => y !== d.id) : [...x, d.id]))}
                    className={`rounded-xl border-2 px-3 py-2 font-semibold ${on ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-white"}`}
                  >
                    {weekday(d.day)} {formatDate(d.day)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Tipo de barraca">
              <Select
                value={typeId}
                onChange={(e) => {
                  setTypeId(e.target.value);
                  const t = ev.types.find((x: any) => x.id === e.target.value);
                  if (t) {
                    setFee(t.fee_cents);
                    setFeeMode(t.fee_mode);
                  }
                }}
              >
                <option value="">—</option>
                {ev.types.map((t: any) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Cobrança">
              <Select value={feeMode} onChange={(e) => setFeeMode(e.target.value as "per_day" | "per_event")}>
                <option value="per_event">Valor único</option>
                <option value="per_day">Por dia</option>
              </Select>
            </Field>
            <Field label="Valor combinado">
              <MoneyInput value={fee} onChange={setFee} />
            </Field>
            <Field label="Desconto">
              <MoneyInput value={discount} onChange={setDiscount} />
            </Field>
            <Field label="Vencimento">
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </Field>
          </div>
          <p>
            Total combinado: <b>{formatBRL(total)}</b>
          </p>
          <Field label="Mensagem ao feirante (opcional)">
            <Textarea value={response} onChange={(e) => setResponse(e.target.value)} rows={2} />
          </Field>
          <p className="text-xs text-muted">Depois de aprovar, atribua a barraca no mapa do evento. O feirante verá datas, local, barraca, taxa e orientações.</p>
        </div>
      </Modal>
      <ConsentDialog
        open={consent}
        onClose={() => setConsent(false)}
        code="link"
        confirmLabel="Aceitar e aprovar"
        parties={[
          { label: "Organizador", value: company.name },
          { label: "Feirante", value: req.vendor_company_name },
          { label: "Evento", value: req.event_name },
          { label: "Dados do feirante autorizados", value: (req.vendor_scope?.vendor_fields ?? ["trade_name"]).map((f) => VENDOR_FIELDS[f]?.replace(" (sempre)", "")).join(", ") },
        ]}
        onAccept={async () => {
          const { error } = await getSupabase().rpc("approve_request", {
            p_request: req.id,
            p_accept_terms: true,
            p_existing_vendor: existing || null,
            p_fee_mode: feeMode,
            p_fee_cents: fee ?? 0,
            p_discount_cents: discount ?? 0,
            p_due_date: due || null,
            p_day_ids: days,
            p_stall_type_id: typeId || null,
            p_response: response || null,
          });
          if (error) return toast.error(friendlyError(error));
          toast.success("Participação aprovada e vínculo criado.");
          setConsent(false);
          onDone();
          onClose();
        }}
      />
    </>
  );
}
