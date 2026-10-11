"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { Button, Card, ConfirmDialog, Field, InfoBox, Input, MoneyInput, Select, Table, Td, Textarea, Th } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatTime, weekday } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { EVENT_STATUS } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase/client";
import type { EventBundle, EventDay } from "./types";

export function EventDataTab({ b, reload }: { b: EventBundle; reload: () => void }) {
  const { company, canManage } = useActiveCompany();
  const toast = useToast();
  const ev = b.event;
  const [f, setF] = useState({
    name: ev.name,
    description: ev.description ?? "",
    location_name: ev.location_name ?? "",
    address: ev.address ?? "",
    map_url: ev.map_url ?? "",
    setup_info: ev.setup_info ?? "",
    teardown_info: ev.teardown_info ?? "",
    arrival_instructions: ev.arrival_instructions ?? "",
    rules: ev.rules ?? "",
    segments: ev.segments ?? "",
    structure: ev.structure ?? "",
    default_fee_cents: ev.default_fee_cents as number | null,
    fee_mode: ev.fee_mode,
    payment_due_date: ev.payment_due_date ?? "",
    status: ev.status,
    contact_name: ev.contact_name ?? "",
    contact_phone: ev.contact_phone ?? "",
    contact_email: ev.contact_email ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [newDay, setNewDay] = useState("");
  const [removing, setRemoving] = useState<EventDay | null>(null);
  const set = (k: keyof typeof f, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const s = getSupabase();

  const save = async () => {
    if (f.name.trim().length < 2) return toast.error("Informe o nome.");
    setBusy(true);
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(f)) payload[k] = typeof v === "string" ? v.trim() || null : v;
    payload.name = f.name.trim();
    payload.status = f.status;
    payload.fee_mode = f.fee_mode;
    payload.default_fee_cents = f.default_fee_cents ?? 0;
    const { error } = await s.from("events").update(payload).eq("id", ev.id);
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    toast.success("Evento salvo. Feirantes vinculados são avisados sobre mudanças relevantes.");
    reload();
  };

  const updDay = async (d: EventDay, patch: Partial<EventDay>) => {
    const { error } = await s.from("event_days").update(patch).eq("id", d.id);
    if (error) toast.error(friendlyError(error));
    reload();
  };

  return (
    <div className="space-y-4">
      <Card title="Informações do evento">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome" required>
            <Input value={f.name} onChange={(e) => set("name", e.target.value)} disabled={!canManage} />
          </Field>
          <Field label="Situação">
            <Select value={f.status} onChange={(e) => set("status", e.target.value)} disabled={!canManage}>
              {Object.entries(EVENT_STATUS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Descrição" className="sm:col-span-2">
            <Textarea value={f.description} onChange={(e) => set("description", e.target.value)} disabled={!canManage} />
          </Field>
          <Field label="Local">
            <Input value={f.location_name} onChange={(e) => set("location_name", e.target.value)} disabled={!canManage} />
          </Field>
          <Field label="Endereço">
            <Input value={f.address} onChange={(e) => set("address", e.target.value)} disabled={!canManage} />
          </Field>
          <Field label="Link de localização" className="sm:col-span-2" hint="A localização geográfica fica aqui; o mapa de barracas é a planta interna do evento.">
            <Input type="url" value={f.map_url} onChange={(e) => set("map_url", e.target.value)} disabled={!canManage} />
          </Field>
          <Field label="Montagem (orientações)">
            <Textarea value={f.setup_info} onChange={(e) => set("setup_info", e.target.value)} rows={2} disabled={!canManage} />
          </Field>
          <Field label="Desmontagem (orientações)">
            <Textarea value={f.teardown_info} onChange={(e) => set("teardown_info", e.target.value)} rows={2} disabled={!canManage} />
          </Field>
          <Field label="Orientações de chegada" className="sm:col-span-2">
            <Textarea value={f.arrival_instructions} onChange={(e) => set("arrival_instructions", e.target.value)} rows={2} disabled={!canManage} />
          </Field>
          <Field label="Regras e orientações gerais" className="sm:col-span-2">
            <Textarea value={f.rules} onChange={(e) => set("rules", e.target.value)} rows={3} disabled={!canManage} />
          </Field>
          <Field label="Segmentos aceitos">
            <Input value={f.segments} onChange={(e) => set("segments", e.target.value)} placeholder="Ex.: alimentação, artesanato" disabled={!canManage} />
          </Field>
          <Field label="Estrutura oferecida">
            <Input value={f.structure} onChange={(e) => set("structure", e.target.value)} placeholder="Ex.: tenda 3x3, energia, mesa" disabled={!canManage} />
          </Field>
          <Field label="Cobrança padrão">
            <Select value={f.fee_mode} onChange={(e) => set("fee_mode", e.target.value)} disabled={!canManage}>
              <option value="per_event">Valor único por evento</option>
              <option value="per_day">Por dia</option>
            </Select>
          </Field>
          <Field label="Taxa padrão" hint="Mudar não altera valores já combinados com participantes">
            <MoneyInput value={f.default_fee_cents} onChange={(v) => set("default_fee_cents", v)} disabled={!canManage} />
          </Field>
          <Field label="Prazo de pagamento">
            <Input type="date" value={f.payment_due_date} onChange={(e) => set("payment_due_date", e.target.value)} disabled={!canManage} />
          </Field>
          <div />
          <Field label="Contato do evento — nome">
            <Input value={f.contact_name} onChange={(e) => set("contact_name", e.target.value)} disabled={!canManage} />
          </Field>
          <Field label="Contato — telefone/WhatsApp">
            <Input value={f.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} disabled={!canManage} />
          </Field>
          <Field label="Contato — e-mail">
            <Input type="email" value={f.contact_email} onChange={(e) => set("contact_email", e.target.value)} disabled={!canManage} />
          </Field>
        </div>
        <p className="mt-2 text-xs text-muted">O contato só aparece em páginas públicas ou em “Feiras disponíveis” se você autorizar na publicação/compartilhamento.</p>
        {canManage && (
          <Button className="mt-4" onClick={save} loading={busy}>
            Salvar evento
          </Button>
        )}
      </Card>

      <Card title={`Dias do evento (${b.days.length})`}>
        <Table>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Abertura</Th>
              <Th>Encerramento</Th>
              <Th>Montagem</Th>
              <Th>Desmontagem</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {b.days.map((d) => (
              <tr key={d.id}>
                <Td className="whitespace-nowrap font-semibold">
                  {weekday(d.day)}, {formatDate(d.day)}
                </Td>
                {(["open_time", "close_time", "setup_time", "teardown_time"] as const).map((k) => (
                  <Td key={k}>
                    <Input
                      type="time"
                      className="h-9 w-28"
                      aria-label={k}
                      defaultValue={formatTime(d[k])}
                      disabled={!canManage}
                      onBlur={(e) => {
                        const v = e.target.value || null;
                        if (v !== (d[k] ? formatTime(d[k]) : null)) updDay(d, { [k]: v } as Partial<EventDay>);
                      }}
                    />
                  </Td>
                ))}
                <Td>
                  {canManage && (
                    <Button size="sm" variant="ghost" aria-label="Remover dia" onClick={() => setRemoving(d)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {canManage && (
          <div className="mt-3 flex items-end gap-2">
            <Field label="Adicionar dia">
              <Input type="date" value={newDay} onChange={(e) => setNewDay(e.target.value)} />
            </Field>
            <Button
              variant="secondary"
              icon={<Plus className="h-4 w-4" />}
              disabled={!newDay}
              onClick={async () => {
                const ref = b.days[0];
                const { error } = await s.from("event_days").insert({ company_id: company.id, event_id: ev.id, day: newDay, open_time: ref?.open_time, close_time: ref?.close_time });
                if (error) return toast.error(friendlyError(error));
                setNewDay("");
                reload();
              }}
            >
              Adicionar
            </Button>
          </div>
        )}
        <InfoBox tone="info">Mudanças de datas, local, regras e taxas são sinalizadas aos feirantes vinculados, sem alterar valores já combinados.</InfoBox>
      </Card>
      <ConfirmDialog
        open={!!removing}
        title={`Remover o dia ${formatDate(removing?.day)}?`}
        message="As barracas atribuídas e a inscrição dos participantes neste dia serão removidas. Taxas por dia serão recalculadas."
        confirmLabel="Remover dia"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          const { error } = await s.from("event_days").delete().eq("id", removing!.id);
          if (error) toast.error(friendlyError(error));
          setRemoving(null);
          reload();
        }}
      />
    </div>
  );
}
