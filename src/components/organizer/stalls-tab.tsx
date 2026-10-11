"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { Badge, Button, Card, Field, Input, MoneyInput, Select, Table, Td, Th } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { friendlyError } from "@/lib/errors";
import { FEE_MODE } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { getSupabase } from "@/lib/supabase/client";
import type { EventBundle } from "./types";

const COLORS = ["#f59e0b", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#64748b"];

export function StallsTab({ b, reload }: { b: EventBundle; reload: () => void }) {
  const { company, canManage } = useActiveCompany();
  const toast = useToast();
  const s = getSupabase();
  const [t, setT] = useState({ name: "", size_label: "", fee_cents: b.event.default_fee_cents as number | null, fee_mode: b.event.fee_mode as string, color: COLORS[0] });
  const [bulk, setBulk] = useState({ prefix: "", from: String(b.stalls.length + 1), count: "10", type: "" });

  const addType = async () => {
    if (!t.name.trim()) return toast.error("Informe o nome do tipo.");
    const { error } = await s.from("stall_types").insert({ company_id: company.id, event_id: b.event.id, name: t.name.trim(), size_label: t.size_label || null, fee_cents: t.fee_cents ?? 0, fee_mode: t.fee_mode, color: t.color });
    if (error) return toast.error(friendlyError(error));
    setT({ ...t, name: "", size_label: "" });
    reload();
  };
  const addStalls = async () => {
    const n = Math.min(300, Math.max(1, Number(bulk.count) || 0));
    const start = Number(bulk.from) || 1;
    const offset = b.stalls.length;
    const rows = Array.from({ length: n }, (_, i) => ({
      company_id: company.id,
      event_id: b.event.id,
      code: `${bulk.prefix}${start + i}`,
      stall_type_id: bulk.type || null,
      x: 40 + ((offset + i) % 12) * 70,
      y: 100 + Math.floor((offset + i) / 12) * 80,
    }));
    const { error } = await s.from("stalls").insert(rows);
    if (error) return toast.error(friendlyError(error));
    toast.success(`${n} barraca(s) criadas. Organize-as no mapa.`);
    reload();
  };
  const assignedCount = (id: string) => b.assignments.filter((a) => a.stall_id === id).length;

  return (
    <div className="space-y-4">
      <Card title="Tipos de barraca">
        <p className="mb-3 text-sm text-muted">Use tipos para valores diferentes (ex.: alimentação, artesanato, food truck). O valor combinado com cada participante fica guardado na participação.</p>
        {b.types.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>Tipo</Th>
                <Th>Tamanho</Th>
                <Th>Taxa</Th>
                <Th>Barracas</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {b.types.map((x) => (
                <tr key={x.id}>
                  <Td>
                    <span className="mr-2 inline-block h-3 w-3 rounded-full" style={{ background: x.color }} />
                    {x.name}
                  </Td>
                  <Td>{x.size_label ?? "—"}</Td>
                  <Td>
                    {formatBRL(x.fee_cents)} · {FEE_MODE[x.fee_mode]}
                  </Td>
                  <Td>{b.stalls.filter((st) => st.stall_type_id === x.id).length}</Td>
                  <Td>
                    {canManage && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Remover tipo"
                        onClick={async () => {
                          const { error } = await s.from("stall_types").delete().eq("id", x.id);
                          if (error) toast.error(friendlyError(error));
                          reload();
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {canManage && (
          <div className="mt-3 grid gap-2 sm:grid-cols-6">
            <Input className="sm:col-span-2" placeholder="Nome do tipo" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} aria-label="Nome do tipo" />
            <Input placeholder="3x3 m" value={t.size_label} onChange={(e) => setT({ ...t, size_label: e.target.value })} aria-label="Tamanho" />
            <MoneyInput value={t.fee_cents} onChange={(v) => setT({ ...t, fee_cents: v })} aria-label="Taxa" />
            <Select value={t.fee_mode} onChange={(e) => setT({ ...t, fee_mode: e.target.value })} aria-label="Cobrança">
              <option value="per_event">Único</option>
              <option value="per_day">Por dia</option>
            </Select>
            <div className="flex gap-2">
              <select aria-label="Cor" className="h-11 rounded-xl border border-line px-2" value={t.color} onChange={(e) => setT({ ...t, color: e.target.value })} style={{ color: t.color }}>
                {COLORS.map((c) => (
                  <option key={c} value={c} style={{ color: c }}>
                    ●
                  </option>
                ))}
              </select>
              <Button onClick={addType} icon={<Plus className="h-4 w-4" />}>
                Tipo
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card title={`Barracas (${b.stalls.length})`}>
        {canManage && (
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <Field label="Prefixo" hint="Ex.: A">
              <Input className="w-20" value={bulk.prefix} onChange={(e) => setBulk({ ...bulk, prefix: e.target.value })} />
            </Field>
            <Field label="Começar em">
              <Input className="w-24" inputMode="numeric" value={bulk.from} onChange={(e) => setBulk({ ...bulk, from: e.target.value })} />
            </Field>
            <Field label="Quantidade">
              <Input className="w-24" inputMode="numeric" value={bulk.count} onChange={(e) => setBulk({ ...bulk, count: e.target.value })} />
            </Field>
            <Field label="Tipo">
              <Select value={bulk.type} onChange={(e) => setBulk({ ...bulk, type: e.target.value })}>
                <option value="">Sem tipo</option>
                {b.types.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button onClick={addStalls} icon={<Plus className="h-4 w-4" />}>
              Criar barracas
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {b.stalls.map((st) => {
            const type = b.types.find((x) => x.id === st.stall_type_id);
            const used = assignedCount(st.id);
            return (
              <div key={st.id} className="flex items-center gap-1 rounded-xl border border-line bg-white px-2 py-1 text-sm">
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: type?.color ?? "#d6d3d1" }} />
                <b>{st.code}</b>
                {canManage && (
                  <select
                    aria-label={`Tipo da barraca ${st.code}`}
                    className="rounded border-0 bg-transparent text-xs text-muted"
                    value={st.stall_type_id ?? ""}
                    onChange={async (e) => {
                      const { error } = await s.from("stalls").update({ stall_type_id: e.target.value || null }).eq("id", st.id);
                      if (error) toast.error(friendlyError(error));
                      reload();
                    }}
                  >
                    <option value="">sem tipo</option>
                    {b.types.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                )}
                {used > 0 && <Badge tone="success">{used} dia(s)</Badge>}
                {canManage && used === 0 && (
                  <button
                    aria-label={`Remover barraca ${st.code}`}
                    className="text-muted hover:text-red-700"
                    onClick={async () => {
                      const { error } = await s.from("stalls").delete().eq("id", st.id);
                      if (error) toast.error(friendlyError(error));
                      reload();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
