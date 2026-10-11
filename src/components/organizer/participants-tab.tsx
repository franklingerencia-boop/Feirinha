"use client";

import { Pencil, Plus, Send, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { ConsentDialog } from "@/components/shared/consent";
import { Badge, Button, Checkbox, ConfirmDialog, EmptyState, Field, InfoBox, Input, Modal, MoneyInput, Select, Table, Td, Textarea, Th } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { formatDate, weekday } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { FEE_MODE, PARTICIPANT_STATUS, STATUS_TONE } from "@/lib/labels";
import { feeTotal, formatBRL } from "@/lib/money";
import { getSupabase } from "@/lib/supabase/client";
import type { EventBundle, Participant } from "./types";

export function ParticipantsTab({ b, reload }: { b: EventBundle; reload: () => void }) {
  const { company } = useActiveCompany();
  const toast = useToast();
  const [filter, setFilter] = useState("active");
  const [editing, setEditing] = useState<Participant | "new" | null>(null);
  const [cancelling, setCancelling] = useState<Participant | null>(null);
  const [inviting, setInviting] = useState<Participant | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [consent, setConsent] = useState(false);

  const list = b.participants.filter((p) => (filter === "active" ? p.status !== "canceled" : filter === "all" ? true : p.status === filter));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Field label="Mostrar">
          <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="active">Inscritos e confirmados</option>
            <option value="registered">Inscritos (reservados)</option>
            <option value="confirmed">Confirmados</option>
            <option value="canceled">Cancelados</option>
            <option value="all">Todos</option>
          </Select>
        </Field>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>
          Adicionar participante
        </Button>
      </div>
      <InfoBox>Você pode incluir feirantes que não usam o aplicativo. Cadastros externos não criam contas nem dão acesso à plataforma.</InfoBox>
      {list.length === 0 ? (
        <EmptyState icon={<UserPlus className="h-10 w-10" />} title="Nenhum participante" description="Adicione feirantes ao evento, escolha os dias e atribua barracas no mapa." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Feirante</Th>
              <Th>Situação</Th>
              <Th>Dias</Th>
              <Th>Barraca(s)</Th>
              <Th className="text-right">Combinado</Th>
              <Th className="text-right">Pago</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className={p.status === "canceled" ? "opacity-60" : ""}>
                <Td>
                  <span className="font-semibold">{p.trade_name}</span>
                  <span className="block text-xs text-muted">
                    {[p.responsible_name, p.vendor_whatsapp || p.vendor_phone].filter(Boolean).join(" · ")}
                  </span>
                  {p.linked_company_id && <Badge tone="info">Na plataforma</Badge>}
                </Td>
                <Td>
                  <Badge tone={STATUS_TONE[p.status]}>{PARTICIPANT_STATUS[p.status]}</Badge>
                </Td>
                <Td>{p.days_count}</Td>
                <Td>{p.stall_codes ?? <span className="text-amber-700">a definir</span>}</Td>
                <Td className="text-right tabular-nums">
                  {formatBRL(p.total_cents)}
                  <span className="block text-xs text-muted">{FEE_MODE[p.fee_mode]}</span>
                </Td>
                <Td className="text-right tabular-nums">{formatBRL(p.paid_cents)}</Td>
                <Td className="whitespace-nowrap text-right">
                  <Button size="sm" variant="ghost" aria-label={`Editar ${p.trade_name}`} onClick={() => setEditing(p)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {!p.linked_company_id && p.status !== "canceled" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Convidar para vincular pela plataforma"
                      aria-label={`Convidar ${p.trade_name} pela plataforma`}
                      onClick={() => {
                        setInviting(p);
                        setInviteEmail(p.vendor_email ?? "");
                      }}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  )}
                  {p.status !== "canceled" && (
                    <Button size="sm" variant="ghost" onClick={() => setCancelling(p)}>
                      Cancelar
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing && <ParticipantDialog b={b} participant={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
      <ConfirmDialog
        open={!!cancelling}
        title={`Cancelar participação de ${cancelling?.trade_name}?`}
        message="As barracas atribuídas serão liberadas. Pagamentos já registrados continuam no histórico (trate devoluções no financeiro)."
        confirmLabel="Cancelar participação"
        requireReason
        onClose={() => setCancelling(null)}
        onConfirm={async (reason) => {
          const { error } = await getSupabase().from("event_participants").update({ status: "canceled", cancel_reason: reason }).eq("id", cancelling!.id);
          if (error) return toast.error(friendlyError(error));
          toast.success("Participação cancelada.");
          setCancelling(null);
          reload();
        }}
      />
      <Modal
        open={!!inviting && !consent}
        onClose={() => setInviting(null)}
        title="Convidar pela plataforma"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setInviting(null)}>
              Cancelar
            </Button>
            <Button onClick={() => setConsent(true)} disabled={!inviteEmail}>
              Continuar
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p>Se {inviting?.trade_name} já usa o SR - Feirinhas, você pode convidá-lo(a) para conectar esta participação. O vínculo só começa após o aceite do feirante.</p>
          <Field label="E-mail do feirante na plataforma">
            <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
          </Field>
        </div>
      </Modal>
      <ConsentDialog
        open={!!inviting && consent}
        onClose={() => setConsent(false)}
        code="link"
        confirmLabel="Aceitar e enviar convite"
        parties={[
          { label: "Organizador", value: company.name },
          { label: "Feirante", value: inviting?.trade_name },
          { label: "Evento", value: b.event.name },
          { label: "Dados compartilhados com o feirante", value: "Dados oficiais do evento, barraca, taxa combinada e pagamentos" },
        ]}
        onAccept={async () => {
          const { error } = await getSupabase().rpc("invite_vendor", { p_participant: inviting!.id, p_email: inviteEmail.trim(), p_accept_terms: true, p_message: null });
          if (error) return toast.error(friendlyError(error));
          toast.success("Convite enviado. O feirante verá em “Vínculos e convites”.");
          setConsent(false);
          setInviting(null);
          reload();
        }}
      />
    </div>
  );
}

type Vendor = { id: string; trade_name: string; responsible_name: string | null; email: string | null };

function ParticipantDialog({ b, participant, onClose, onSaved }: { b: EventBundle; participant: Participant | null; onClose: () => void; onSaved: () => void }) {
  const { company } = useActiveCompany();
  const toast = useToast();
  const s = getSupabase();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorMode, setVendorMode] = useState<"existing" | "new">(participant ? "existing" : "existing");
  const [vendorId, setVendorId] = useState(participant?.vendor_id ?? "");
  const [nv, setNv] = useState({ trade_name: "", responsible_name: "", phone: "", whatsapp: "", email: "", segment: "", products: "", needs_space: "", needs_power: false, needs_structure: "" });
  const [typeId, setTypeId] = useState(participant?.stall_type_id ?? "");
  const [feeMode, setFeeMode] = useState<"per_day" | "per_event">(participant?.fee_mode ?? b.event.fee_mode);
  const [fee, setFee] = useState<number | null>(participant?.fee_cents ?? b.event.default_fee_cents);
  const [discount, setDiscount] = useState<number | null>(participant?.discount_cents ?? 0);
  const [due, setDue] = useState(participant?.due_date ?? b.event.payment_due_date ?? "");
  const [status, setStatus] = useState(participant?.status ?? "registered");
  const [notes, setNotes] = useState(participant?.notes ?? "");
  const [days, setDays] = useState<string[]>(participant ? b.pdays.filter((d) => d.participant_id === participant.id).map((d) => d.event_day_id) : b.days.map((d) => d.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    s.from("vendors")
      .select("id,trade_name,responsible_name,email")
      .eq("company_id", company.id)
      .eq("archived", false)
      .order("trade_name")
      .then(({ data }) => {
        const taken = new Set(b.participants.filter((p) => p.id !== participant?.id).map((p) => p.vendor_id));
        const list = (data ?? []).filter((v) => !taken.has(v.id));
        setVendors(list);
        if (!participant && list.length === 0) setVendorMode("new");
      });
  }, [s, company.id, b.participants, participant]);

  const total = useMemo(() => feeTotal(feeMode, fee ?? 0, days.length, discount ?? 0), [feeMode, fee, days, discount]);

  const pickType = (id: string) => {
    setTypeId(id);
    const t = b.types.find((x) => x.id === id);
    if (t && !participant) {
      setFee(t.fee_cents);
      setFeeMode(t.fee_mode);
    }
  };

  const save = async () => {
    setError(null);
    if (!participant && vendorMode === "existing" && !vendorId) return setError("Escolha o feirante.");
    if (!participant && vendorMode === "new" && nv.trade_name.trim().length < 2) return setError("Informe o nome comercial.");
    if (days.length === 0) return setError("Selecione pelo menos um dia.");
    setBusy(true);
    try {
      let vid = vendorId;
      if (!participant && vendorMode === "new") {
        const { data, error } = await s
          .from("vendors")
          .insert({ company_id: company.id, ...Object.fromEntries(Object.entries(nv).map(([k, v]) => [k, typeof v === "string" ? v.trim() || null : v])) })
          .select("id")
          .single();
        if (error) throw error;
        vid = data.id;
      }
      const payload = { stall_type_id: typeId || null, fee_mode: feeMode, fee_cents: fee ?? 0, discount_cents: discount ?? 0, due_date: due || null, status, notes: notes || null };
      let pid = participant?.id;
      if (pid) {
        const { error } = await s.from("event_participants").update(payload).eq("id", pid);
        if (error) throw error;
      } else {
        const { data, error } = await s.from("event_participants").insert({ ...payload, company_id: company.id, event_id: b.event.id, vendor_id: vid }).select("id").single();
        if (error) throw error;
        pid = data.id;
      }
      const current = b.pdays.filter((d) => d.participant_id === pid).map((d) => d.event_day_id);
      const toAdd = days.filter((d) => !current.includes(d));
      const toRemove = current.filter((d) => !days.includes(d));
      if (toAdd.length) {
        const { error } = await s.from("event_participant_days").insert(toAdd.map((d) => ({ company_id: company.id, participant_id: pid, event_day_id: d })));
        if (error) throw error;
      }
      if (toRemove.length) {
        const { error } = await s.from("event_participant_days").delete().eq("participant_id", pid!).in("event_day_id", toRemove);
        if (error) throw error;
      }
      toast.success("Participante salvo.");
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
      title={participant ? `Participação: ${participant.trade_name}` : "Adicionar participante"}
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
        {!participant && (
          <section className="space-y-3">
            <div className="flex gap-2">
              <Button size="sm" variant={vendorMode === "existing" ? "primary" : "secondary"} onClick={() => setVendorMode("existing")} disabled={vendors.length === 0}>
                Feirante cadastrado
              </Button>
              <Button size="sm" variant={vendorMode === "new" ? "primary" : "secondary"} onClick={() => setVendorMode("new")}>
                Novo feirante
              </Button>
            </div>
            {vendorMode === "existing" ? (
              <Field label="Feirante">
                <Select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                  <option value="">Selecione...</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.trade_name}
                      {v.responsible_name ? ` (${v.responsible_name})` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nome comercial" required>
                  <Input value={nv.trade_name} onChange={(e) => setNv({ ...nv, trade_name: e.target.value })} />
                </Field>
                <Field label="Responsável">
                  <Input value={nv.responsible_name} onChange={(e) => setNv({ ...nv, responsible_name: e.target.value })} />
                </Field>
                <Field label="Telefone">
                  <Input value={nv.phone} onChange={(e) => setNv({ ...nv, phone: e.target.value })} />
                </Field>
                <Field label="WhatsApp">
                  <Input value={nv.whatsapp} onChange={(e) => setNv({ ...nv, whatsapp: e.target.value })} />
                </Field>
                <Field label="E-mail">
                  <Input type="email" value={nv.email} onChange={(e) => setNv({ ...nv, email: e.target.value })} />
                </Field>
                <Field label="Segmento">
                  <Input value={nv.segment} onChange={(e) => setNv({ ...nv, segment: e.target.value })} />
                </Field>
                <Field label="Produtos vendidos" className="sm:col-span-2">
                  <Input value={nv.products} onChange={(e) => setNv({ ...nv, products: e.target.value })} />
                </Field>
                <Field label="Espaço necessário">
                  <Input value={nv.needs_space} onChange={(e) => setNv({ ...nv, needs_space: e.target.value })} />
                </Field>
                <Field label="Estrutura necessária">
                  <Input value={nv.needs_structure} onChange={(e) => setNv({ ...nv, needs_structure: e.target.value })} />
                </Field>
                <Checkbox label="Precisa de energia elétrica" checked={nv.needs_power} onChange={(v) => setNv({ ...nv, needs_power: v })} />
              </div>
            )}
          </section>
        )}
        <section>
          <p className="mb-2 text-sm font-semibold">Dias de participação</p>
          <div className="flex flex-wrap gap-2">
            {b.days.map((d) => {
              const on = days.includes(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDays((x) => (on ? x.filter((y) => y !== d.id) : [...x, d.id]))}
                  className={`rounded-xl border-2 px-3 py-2 text-sm font-semibold ${on ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-white"}`}
                >
                  {weekday(d.day)} {formatDate(d.day)}
                </button>
              );
            })}
          </div>
        </section>
        <section className="grid gap-3 sm:grid-cols-3">
          <Field label="Tipo de barraca">
            <Select value={typeId} onChange={(e) => pickType(e.target.value)}>
              <option value="">—</option>
              {b.types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({formatBRL(t.fee_cents)})
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
          <Field label={feeMode === "per_day" ? "Valor combinado por dia" : "Valor combinado"}>
            <MoneyInput value={fee} onChange={setFee} />
          </Field>
          <Field label="Desconto">
            <MoneyInput value={discount} onChange={setDiscount} />
          </Field>
          <Field label="Vencimento">
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="Situação">
            <Select value={status} onChange={(e) => setStatus(e.target.value as Participant["status"])}>
              <option value="registered">Inscrito (reservado)</option>
              <option value="confirmed">Confirmado</option>
              {participant && <option value="canceled">Cancelado</option>}
            </Select>
          </Field>
        </section>
        <InfoBox>
          Total combinado: <b>{formatBRL(total)}</b>
          {feeMode === "per_day" ? ` (${formatBRL(fee ?? 0)} × ${days.length} dia(s)` : " (valor único"}
          {discount ? ` − desconto ${formatBRL(discount)})` : ")"}. Este valor fica preservado mesmo que a taxa padrão do evento mude.
        </InfoBox>
        <Field label="Observações">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}
