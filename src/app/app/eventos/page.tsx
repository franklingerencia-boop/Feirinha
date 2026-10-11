"use client";

import { CalendarDays, MapPin, Plus, Tent } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { Badge, Button, EmptyState, Field, InfoBox, Input, Modal, MoneyInput, PageHeader, Select, Spinner, Textarea } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { dateRange, rangeLabel, todayISO } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { EVENT_STATUS, STATUS_TONE } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase/client";
import { must, useData } from "@/lib/use-data";

type Ev = {
  id: string;
  name: string;
  status: string;
  location_name: string | null;
  address: string | null;
  event_days: { day: string }[];
  stalls: { count: number }[];
  event_participants: { status: string }[];
  event_publications: { is_published: boolean } | null;
};

export default function EventsPage() {
  const { company, canManage } = useActiveCompany();
  const router = useRouter();
  const today = todayISO(company.timezone);
  const [filter, setFilter] = useState("upcoming");
  const [open, setOpen] = useState(false);
  const { data, loading, error } = useData(
    async () =>
      must(
        await getSupabase()
          .from("events")
          .select("id,name,status,location_name,address,event_days(day),stalls(count),event_participants(status),event_publications(is_published)")
          .eq("company_id", company.id)
          .order("created_at", { ascending: false }),
      ) as unknown as Ev[],
    [company.id],
  );

  const list = useMemo(
    () =>
      (data ?? [])
        .map((e) => {
          const days = e.event_days.map((d) => d.day).sort();
          return { ...e, first: days[0] ?? null, last: days[days.length - 1] ?? null };
        })
        .filter((e) => {
          if (filter === "all") return true;
          if (filter === "upcoming") return !["canceled", "completed"].includes(e.status) && (!e.last || e.last >= today);
          if (filter === "past") return e.status === "completed" || (e.last && e.last < today);
          return e.status === filter;
        })
        .sort((a, b) => (a.first ?? "9999").localeCompare(b.first ?? "9999")),
    [data, filter, today],
  );

  return (
    <div>
      <PageHeader
        title="Eventos"
        description="Cadastre suas feiras, monte a planta de barracas e acompanhe participantes e cobranças."
        actions={
          canManage && (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>
              Novo evento
            </Button>
          )
        }
      />
      <Field label="Mostrar" className="mb-4 max-w-xs">
        <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="upcoming">Próximos e em andamento</option>
          <option value="past">Realizados</option>
          <option value="draft">Rascunhos</option>
          <option value="open">Inscrições abertas</option>
          <option value="confirmed">Confirmados</option>
          <option value="canceled">Cancelados</option>
          <option value="all">Todos</option>
        </Select>
      </Field>
      {loading && <Spinner />}
      {error && <InfoBox tone="danger">{error}</InfoBox>}
      {data && list.length === 0 && (
        <EmptyState icon={<Tent className="h-10 w-10" />} title="Nenhum evento aqui" description="Crie seu primeiro evento para organizar barracas e participantes." action={canManage && <Button onClick={() => setOpen(true)}>Criar evento</Button>} />
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((e) => {
          const confirmed = e.event_participants.filter((p) => p.status === "confirmed").length;
          return (
            <Link key={e.id} href={`/app/eventos/${e.id}`} className="block rounded-2xl border border-line bg-white p-4 shadow-sm hover:border-brand-300">
              <div className="flex items-start justify-between gap-2">
                <p className="text-lg font-bold">{e.name}</p>
                <Badge tone={STATUS_TONE[e.status]}>{EVENT_STATUS[e.status]}</Badge>
              </div>
              <p className="mt-1 flex items-center gap-1 text-sm font-semibold">
                <CalendarDays className="h-4 w-4 text-brand-500" /> {rangeLabel(e.first, e.last)}
              </p>
              {(e.location_name || e.address) && (
                <p className="flex items-center gap-1 text-sm text-muted">
                  <MapPin className="h-4 w-4" /> {[e.location_name, e.address].filter(Boolean).join(" · ")}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <Badge>{e.stalls[0]?.count ?? 0} barraca(s)</Badge>
                <Badge tone="success">{confirmed} confirmado(s)</Badge>
                {e.event_publications?.is_published && <Badge tone="info">Publicado</Badge>}
              </div>
            </Link>
          );
        })}
      </div>
      {open && <NewEventDialog onClose={() => setOpen(false)} onCreated={(id) => router.push(`/app/eventos/${id}`)} />}
    </div>
  );
}

function NewEventDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { company } = useActiveCompany();
  const toast = useToast();
  const [f, setF] = useState({
    name: "",
    description: "",
    location_name: "",
    address: "",
    map_url: "",
    start: "",
    end: "",
    open_time: "",
    close_time: "",
    setup_time: "",
    teardown_time: "",
    fee_mode: "per_event",
    default_fee_cents: 0 as number | null,
    payment_due_date: "",
    stalls: "20",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setError(null);
    if (f.name.trim().length < 2) return setError("Informe o nome do evento.");
    if (!f.start) return setError("Informe a data de início.");
    const days = dateRange(f.start, f.end || f.start);
    if (days.length > 60) return setError("Período muito longo (máximo 60 dias).");
    setBusy(true);
    const s = getSupabase();
    try {
      const { data: ev, error } = await s
        .from("events")
        .insert({
          company_id: company.id,
          name: f.name.trim(),
          description: f.description || null,
          location_name: f.location_name || null,
          address: f.address || null,
          map_url: f.map_url || null,
          fee_mode: f.fee_mode,
          default_fee_cents: f.default_fee_cents ?? 0,
          payment_due_date: f.payment_due_date || null,
          status: "draft",
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: e2 } = await s.from("event_days").insert(
        days.map((d) => ({
          company_id: company.id,
          event_id: ev.id,
          day: d,
          open_time: f.open_time || null,
          close_time: f.close_time || null,
          setup_time: f.setup_time || null,
          teardown_time: f.teardown_time || null,
        })),
      );
      if (e2) throw e2;
      const n = Math.min(500, Math.max(0, Number(f.stalls) || 0));
      if (n > 0) {
        const cols = Math.ceil(Math.sqrt(n * 2));
        const { error: e3 } = await s.from("stalls").insert(
          Array.from({ length: n }, (_, i) => ({
            company_id: company.id,
            event_id: ev.id,
            code: String(i + 1),
            x: 40 + (i % cols) * 70,
            y: 100 + Math.floor(i / cols) * 80,
          })),
        );
        if (e3) throw e3;
      }
      toast.success("Evento criado como rascunho.");
      onCreated(ev.id);
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
      title="Novo evento"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={busy}>
            Criar evento
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <InfoBox tone="danger">{error}</InfoBox>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome do evento" required className="sm:col-span-2">
            <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Descrição" className="sm:col-span-2">
            <Textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={2} />
          </Field>
          <Field label="Local">
            <Input value={f.location_name} onChange={(e) => set("location_name", e.target.value)} />
          </Field>
          <Field label="Endereço">
            <Input value={f.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="Link de localização (mapa)" className="sm:col-span-2">
            <Input type="url" value={f.map_url} onChange={(e) => set("map_url", e.target.value)} placeholder="https://maps.google.com/..." />
          </Field>
          <Field label="Primeiro dia" required>
            <Input type="date" value={f.start} onChange={(e) => set("start", e.target.value)} />
          </Field>
          <Field label="Último dia">
            <Input type="date" value={f.end} min={f.start} onChange={(e) => set("end", e.target.value)} />
          </Field>
          <Field label="Abertura">
            <Input type="time" value={f.open_time} onChange={(e) => set("open_time", e.target.value)} />
          </Field>
          <Field label="Encerramento">
            <Input type="time" value={f.close_time} onChange={(e) => set("close_time", e.target.value)} />
          </Field>
          <Field label="Montagem">
            <Input type="time" value={f.setup_time} onChange={(e) => set("setup_time", e.target.value)} />
          </Field>
          <Field label="Desmontagem">
            <Input type="time" value={f.teardown_time} onChange={(e) => set("teardown_time", e.target.value)} />
          </Field>
          <Field label="Cobrança padrão">
            <Select value={f.fee_mode} onChange={(e) => set("fee_mode", e.target.value)}>
              <option value="per_event">Valor único por evento</option>
              <option value="per_day">Por dia</option>
            </Select>
          </Field>
          <Field label="Taxa padrão">
            <MoneyInput value={f.default_fee_cents} onChange={(v) => set("default_fee_cents", v)} />
          </Field>
          <Field label="Prazo de pagamento">
            <Input type="date" value={f.payment_due_date} onChange={(e) => set("payment_due_date", e.target.value)} />
          </Field>
          <Field label="Quantidade de barracas" hint="Criadas numeradas; ajuste depois no mapa">
            <Input inputMode="numeric" value={f.stalls} onChange={(e) => set("stalls", e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
