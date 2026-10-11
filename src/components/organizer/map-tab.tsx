"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { MapLegend, OCC_STYLE, StallMap, type Occ } from "@/components/shared/stall-map";
import { Badge, Button, Card, Field, InfoBox, Input, Select } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { formatDate, weekday } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { MAP_ELEMENT, PARTICIPANT_STATUS } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { getSupabase } from "@/lib/supabase/client";
import type { EventBundle } from "./types";

export function MapTab({ b, reload }: { b: EventBundle; reload: () => void }) {
  const { company, canManage } = useActiveCompany();
  const toast = useToast();
  const s = getSupabase();
  const [dayId, setDayId] = useState(b.days[0]?.id ?? "");
  const [edit, setEdit] = useState(false);
  const [sel, setSel] = useState<{ kind: "stall" | "element"; id: string } | null>(null);
  const [newKind, setNewKind] = useState("entrance");

  const partById = useMemo(() => new Map(b.participants.map((p) => [p.id, p])), [b.participants]);
  const occupancy = useMemo(() => {
    const o: Record<string, Occ> = {};
    for (const a of b.assignments.filter((x) => x.event_day_id === dayId)) {
      const p = partById.get(a.participant_id);
      o[a.stall_id] = { status: p?.status === "confirmed" ? "confirmed" : "reserved", name: p?.trade_name };
    }
    return o;
  }, [b.assignments, dayId, partById]);
  const stalls = b.stalls.map((st) => ({ ...st, color: b.types.find((t) => t.id === st.stall_type_id)?.color }));
  const counts = { total: b.stalls.length, confirmed: Object.values(occupancy).filter((o) => o.status === "confirmed").length, reserved: Object.values(occupancy).filter((o) => o.status === "reserved").length };

  const onMove = async (kind: "stall" | "element", id: string, x: number, y: number) => {
    const { error } = await s.from(kind === "stall" ? "stalls" : "map_elements").update({ x, y }).eq("id", id);
    if (error) toast.error(friendlyError(error));
  };

  const selStall = sel?.kind === "stall" ? b.stalls.find((x) => x.id === sel.id) : null;
  const selEl = sel?.kind === "element" ? b.elements.find((x) => x.id === sel.id) : null;
  const selAssign = selStall ? b.assignments.find((a) => a.stall_id === selStall.id && a.event_day_id === dayId) : null;
  const selPart = selAssign ? partById.get(selAssign.participant_id) : null;
  // Participantes inscritos neste dia e ainda sem barraca no dia
  const assignable = b.participants.filter(
    (p) => p.status !== "canceled" && b.pdays.some((d) => d.participant_id === p.id && d.event_day_id === dayId) && !b.assignments.some((a) => a.participant_id === p.id && a.event_day_id === dayId),
  );

  const assign = async (participantId: string, allDays: boolean) => {
    if (!selStall) return;
    const days = allDays ? b.pdays.filter((d) => d.participant_id === participantId).map((d) => d.event_day_id) : [dayId];
    const rows = days.map((d) => ({ company_id: company.id, event_id: b.event.id, stall_id: selStall.id, participant_id: participantId, event_day_id: d }));
    const { error } = await s.from("stall_assignments").insert(rows);
    if (error) return toast.error(friendlyError(error));
    toast.success("Barraca atribuída.");
    reload();
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <Field label="Dia">
            <Select value={dayId} onChange={(e) => setDayId(e.target.value)}>
              {b.days.map((d) => (
                <option key={d.id} value={d.id}>
                  {weekday(d.day)}, {formatDate(d.day)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="text-sm">
            <b>{counts.total - counts.confirmed - counts.reserved}</b> disponíveis · <b>{counts.reserved}</b> reservadas · <b>{counts.confirmed}</b> confirmadas
          </div>
          {canManage && (
            <Button variant={edit ? "primary" : "secondary"} onClick={() => setEdit((v) => !v)} aria-pressed={edit}>
              {edit ? "Concluir organização" : "Organizar planta"}
            </Button>
          )}
        </div>
        {edit && (
          <div className="flex flex-wrap items-end gap-2 rounded-xl bg-brand-50 p-3 text-sm">
            <span className="w-full text-muted">Arraste barracas e elementos (ou selecione e use as setas do teclado). As posições são salvas automaticamente.</span>
            <Field label="Elemento">
              <Select value={newKind} onChange={(e) => setNewKind(e.target.value)}>
                {Object.entries(MAP_ELEMENT).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              size="sm"
              icon={<Plus className="h-4 w-4" />}
              onClick={async () => {
                const { error } = await s.from("map_elements").insert({ company_id: company.id, event_id: b.event.id, kind: newKind, x: 20, y: 20, w: newKind === "stage" ? 200 : 100, h: newKind === "stage" ? 80 : 40 });
                if (error) return toast.error(friendlyError(error));
                reload();
              }}
            >
              Inserir elemento
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus className="h-4 w-4" />}
              onClick={async () => {
                const nums = b.stalls.map((x) => Number(x.code)).filter((n) => !Number.isNaN(n));
                const next = String((nums.length ? Math.max(...nums) : 0) + 1);
                const { error } = await s.from("stalls").insert({ company_id: company.id, event_id: b.event.id, code: next, x: 40, y: 40 });
                if (error) return toast.error(friendlyError(error));
                reload();
              }}
            >
              Inserir barraca
            </Button>
          </div>
        )}
        <StallMap
          stalls={stalls}
          elements={b.elements}
          occupancy={occupancy}
          selectedId={sel?.id}
          onSelect={(kind, id) => setSel({ kind, id })}
          onMove={edit ? onMove : undefined}
          showNames
        />
        <MapLegend />
        <p className="text-xs text-muted">Esta é a planta interna do evento. A localização geográfica fica no endereço e no link de mapa, na aba Dados.</p>
      </div>

      <Card title={selStall ? `Barraca ${selStall.code}` : selEl ? MAP_ELEMENT[selEl.kind] : "Detalhes"}>
        {!sel && <p className="text-sm text-muted">Selecione uma barraca no mapa para ver o participante ou atribuir uma vaga.</p>}
        {selStall && (
          <div className="space-y-3 text-sm">
            <Badge tone={selPart ? (selPart.status === "confirmed" ? "success" : "warning") : "neutral"}>
              {selPart ? OCC_STYLE[selPart.status === "confirmed" ? "confirmed" : "reserved"].label : "Disponível"} neste dia
            </Badge>
            {selPart ? (
              <div className="space-y-1 rounded-xl bg-cream p-3 ring-1 ring-line">
                <p className="text-base font-bold">{selPart.trade_name}</p>
                {selPart.responsible_name && <p>Responsável: {selPart.responsible_name}</p>}
                {(selPart.vendor_whatsapp || selPart.vendor_phone) && <p>Contato: {selPart.vendor_whatsapp || selPart.vendor_phone}</p>}
                {selPart.vendor_segment && <p>Segmento: {selPart.vendor_segment}</p>}
                <p>Situação: {PARTICIPANT_STATUS[selPart.status]}</p>
                <p>
                  Taxa: {formatBRL(selPart.total_cents)} · pago {formatBRL(selPart.paid_cents)}
                </p>
                <p>Barracas: {selPart.stall_codes}</p>
                {canManage && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-2"
                    onClick={async () => {
                      const { error } = await s.from("stall_assignments").delete().eq("id", selAssign!.id);
                      if (error) return toast.error(friendlyError(error));
                      reload();
                    }}
                  >
                    Liberar barraca neste dia
                  </Button>
                )}
              </div>
            ) : (
              canManage &&
              (assignable.length === 0 ? (
                <InfoBox>Nenhum participante inscrito neste dia está sem barraca.</InfoBox>
              ) : (
                <AssignForm options={assignable.map((p) => ({ id: p.id, name: p.trade_name, status: p.status }))} onAssign={assign} />
              ))
            )}
            {edit && canManage && (
              <div className="space-y-2 border-t border-line pt-3">
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Número">
                    <Input
                      defaultValue={selStall.code}
                      key={selStall.id + "c"}
                      onBlur={async (e) => {
                        if (e.target.value && e.target.value !== selStall.code) {
                          const { error } = await s.from("stalls").update({ code: e.target.value.trim() }).eq("id", selStall.id);
                          if (error) toast.error(friendlyError(error));
                          reload();
                        }
                      }}
                    />
                  </Field>
                  <Field label="Largura">
                    <Input
                      inputMode="numeric"
                      defaultValue={selStall.w}
                      key={selStall.id + "w"}
                      onBlur={async (e) => {
                        await s.from("stalls").update({ w: Math.min(400, Math.max(20, Number(e.target.value) || 60)) }).eq("id", selStall.id);
                        reload();
                      }}
                    />
                  </Field>
                  <Field label="Altura">
                    <Input
                      inputMode="numeric"
                      defaultValue={selStall.h}
                      key={selStall.id + "h"}
                      onBlur={async (e) => {
                        await s.from("stalls").update({ h: Math.min(400, Math.max(20, Number(e.target.value) || 60)) }).eq("id", selStall.id);
                        reload();
                      }}
                    />
                  </Field>
                </div>
                {!b.assignments.some((a) => a.stall_id === selStall.id) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 className="h-4 w-4" />}
                    onClick={async () => {
                      await s.from("stalls").delete().eq("id", selStall.id);
                      setSel(null);
                      reload();
                    }}
                  >
                    Excluir barraca
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
        {selEl && edit && canManage && (
          <div className="space-y-2 text-sm">
            <Field label="Rótulo">
              <Input
                defaultValue={selEl.label ?? ""}
                key={selEl.id}
                onBlur={async (e) => {
                  await s.from("map_elements").update({ label: e.target.value || null }).eq("id", selEl.id);
                  reload();
                }}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Largura">
                <Input
                  inputMode="numeric"
                  defaultValue={selEl.w}
                  key={selEl.id + "w"}
                  onBlur={async (e) => {
                    await s.from("map_elements").update({ w: Math.min(1200, Math.max(20, Number(e.target.value) || 80)) }).eq("id", selEl.id);
                    reload();
                  }}
                />
              </Field>
              <Field label="Altura">
                <Input
                  inputMode="numeric"
                  defaultValue={selEl.h}
                  key={selEl.id + "h"}
                  onBlur={async (e) => {
                    await s.from("map_elements").update({ h: Math.min(1200, Math.max(20, Number(e.target.value) || 40)) }).eq("id", selEl.id);
                    reload();
                  }}
                />
              </Field>
            </div>
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={async () => {
                await s.from("map_elements").delete().eq("id", selEl.id);
                setSel(null);
                reload();
              }}
            >
              Excluir elemento
            </Button>
          </div>
        )}
        {selEl && !edit && <p className="text-sm">{selEl.label || MAP_ELEMENT[selEl.kind]}</p>}
      </Card>
    </div>
  );
}

function AssignForm({ options, onAssign }: { options: { id: string; name: string; status: string }[]; onAssign: (id: string, allDays: boolean) => void }) {
  const [pid, setPid] = useState(options[0]?.id ?? "");
  return (
    <div className="space-y-2">
      <Field label="Atribuir participante">
        <Select value={pid} onChange={(e) => setPid(e.target.value)}>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} ({PARTICIPANT_STATUS[o.status]})
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onAssign(pid, false)} disabled={!pid}>
          Só neste dia
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onAssign(pid, true)} disabled={!pid}>
          Em todos os dias dele
        </Button>
      </div>
      <p className="text-xs text-muted">Se a barraca já estiver ocupada em algum dia, o sistema impede a reserva conflitante.</p>
    </div>
  );
}
