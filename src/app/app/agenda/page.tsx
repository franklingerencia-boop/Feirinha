"use client";

import { CalendarDays, ChevronLeft, ChevronRight, List, MapPin, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { NewEditionDialog } from "@/components/vendor/edition-form";
import { Badge, Button, Card, EmptyState, Field, PageHeader, Select, Spinner, InfoBox, cx } from "@/components/ui/ui";
import { addDays, formatDate, monthRange, rangeLabel, todayISO } from "@/lib/dates";
import { EDITION_STATUS, FEE_MODE, STATUS_TONE, TX_STATUS } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { getSupabase } from "@/lib/supabase/client";
import { must, useData } from "@/lib/use-data";

type Edition = {
  id: string;
  fair_id: string;
  fair_name: string;
  name: string;
  status: string;
  location_name: string | null;
  address: string | null;
  stall_label: string | null;
  fee_mode: string;
  fee_total_cents: number | null;
  fee_due_date: string | null;
  fee_status: string | null;
  first_day: string | null;
  last_day: string | null;
  days_count: number;
  organizer_name: string | null;
  organizer_phone: string | null;
  link_id: string | null;
};

export default function AgendaPage() {
  const { company, canManage } = useActiveCompany();
  if (!canManage) return <OperatorAgenda />;
  return <ManagerAgenda key={company.id} />;
}

function ManagerAgenda() {
  const { company } = useActiveCompany();
  const router = useRouter();
  const [view, setView] = useState<"list" | "calendar">("list");
  const [status, setStatus] = useState<string>("upcoming");
  const [open, setOpen] = useState(false);
  const today = todayISO(company.timezone);
  const [month, setMonth] = useState(today.slice(0, 7) + "-01");

  const { data, loading, error } = useData(async () => {
    const s = getSupabase();
    const eds = must(await s.from("edition_overview").select("*").eq("company_id", company.id).order("first_day", { ascending: true, nullsFirst: false })) as Edition[];
    const days = must(
      await s.from("edition_days").select("edition_id,day,participating,open_time,close_time").eq("company_id", company.id).eq("participating", true),
    ) as { edition_id: string; day: string }[];
    return { eds, days };
  }, [company.id]);

  const list = useMemo(() => {
    const eds = data?.eds ?? [];
    return eds.filter((e) => {
      if (status === "upcoming") return e.status !== "canceled" && e.status !== "completed" && (!e.last_day || e.last_day >= today);
      if (status === "past") return (e.last_day && e.last_day < today) || e.status === "completed";
      if (status === "all") return true;
      return e.status === status;
    });
  }, [data, status, today]);

  return (
    <div>
      <PageHeader
        title="Agenda de feiras"
        description="Todas as feiras em que você participa — inclusive de organizadores que não usam o aplicativo."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>
            Nova participação
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <Field label="Mostrar" className="min-w-48">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="upcoming">Próximas e em andamento</option>
            <option value="past">Já realizadas</option>
            <option value="planned">Planejadas</option>
            <option value="confirmed">Confirmadas</option>
            <option value="completed">Concluídas</option>
            <option value="canceled">Canceladas</option>
            <option value="all">Todas</option>
          </Select>
        </Field>
        <div className="flex gap-1 rounded-xl bg-white p-1 ring-1 ring-line" role="group" aria-label="Visualização">
          <Button size="sm" variant={view === "list" ? "primary" : "ghost"} icon={<List className="h-4 w-4" />} onClick={() => setView("list")} aria-pressed={view === "list"}>
            Lista
          </Button>
          <Button size="sm" variant={view === "calendar" ? "primary" : "ghost"} icon={<CalendarDays className="h-4 w-4" />} onClick={() => setView("calendar")} aria-pressed={view === "calendar"}>
            Calendário
          </Button>
        </div>
      </div>

      {loading && <Spinner />}
      {error && <InfoBox tone="danger">{error}</InfoBox>}
      {data && view === "list" && (
        <>
          {list.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="h-10 w-10" />}
              title="Nenhuma feira por aqui"
              description="Cadastre as feiras em que você vai participar para acompanhar datas, taxas e pagamentos. Você também pode procurar eventos em “Feiras disponíveis”."
              action={<Button onClick={() => setOpen(true)}>Cadastrar participação</Button>}
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {list.map((e) => (
                <Link key={e.id} href={`/app/agenda/${e.id}`} className="block rounded-2xl border border-line bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-bold">{e.fair_name}</p>
                      <p className="truncate text-sm text-muted">{e.name}</p>
                    </div>
                    <Badge tone={STATUS_TONE[e.status]}>{EDITION_STATUS[e.status]}</Badge>
                  </div>
                  <p className="mt-2 flex items-center gap-1 text-sm font-semibold">
                    <CalendarDays className="h-4 w-4 text-brand-500" /> {rangeLabel(e.first_day, e.last_day)}
                    {e.days_count > 1 && <span className="font-normal text-muted"> · {e.days_count} dias</span>}
                  </p>
                  {(e.location_name || e.address) && (
                    <p className="mt-1 flex items-center gap-1 truncate text-sm text-muted">
                      <MapPin className="h-4 w-4 shrink-0" /> {[e.location_name, e.address].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    {e.stall_label && <Badge tone="brand">Barraca {e.stall_label}</Badge>}
                    <span>
                      Taxa: <b>{formatBRL(e.fee_total_cents)}</b> <span className="text-muted">({FEE_MODE[e.fee_mode]})</span>
                    </span>
                    {e.fee_status && <Badge tone={STATUS_TONE[e.fee_status]}>{e.fee_status === "settled" ? "Paga" : TX_STATUS[e.fee_status]}</Badge>}
                    {e.link_id && <Badge tone="info">Vinculada ao organizador</Badge>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
      {data && view === "calendar" && <MonthCalendar month={month} setMonth={setMonth} today={today} eds={data.eds} days={data.days} />}
      <NewEditionDialog open={open} onClose={() => setOpen(false)} onCreated={(id) => router.push(`/app/agenda/${id}`)} />
    </div>
  );
}

function MonthCalendar({
  month,
  setMonth,
  today,
  eds,
  days,
}: {
  month: string;
  setMonth: (m: string) => void;
  today: string;
  eds: Edition[];
  days: { edition_id: string; day: string }[];
}) {
  const { from, to } = monthRange(month);
  const byId = new Map(eds.map((e) => [e.id, e]));
  const [y, m] = from.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const cells: (string | null)[] = Array(firstWeekday).fill(null);
  for (let d = from; d <= to; d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" size="sm" aria-label="Mês anterior" onClick={() => setMonth(addDays(from, -1).slice(0, 7) + "-01")}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-lg font-bold capitalize">{label}</h2>
        <Button variant="ghost" size="sm" aria-label="Próximo mês" onClick={() => setMonth(addDays(to, 1))}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-muted">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          const items = d ? days.filter((x) => x.day === d).map((x) => byId.get(x.edition_id)).filter((e): e is Edition => !!e && e.status !== "canceled") : [];
          return (
            <div key={i} className={cx("min-h-20 rounded-lg border p-1 text-left", d ? "border-line bg-white" : "border-transparent", d === today && "ring-2 ring-brand-400")}>
              {d && <div className="text-xs font-bold text-muted">{Number(d.slice(8))}</div>}
              {items.map((e) => (
                <Link key={e.id} href={`/app/agenda/${e.id}`} className="mt-0.5 block truncate rounded bg-brand-100 px-1 text-[11px] font-semibold text-brand-800 hover:bg-brand-200" title={`${e.fair_name} - ${e.name}`}>
                  {e.fair_name}
                </Link>
              ))}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">Mostra apenas os dias em que você vai participar.</p>
    </Card>
  );
}

/** Operadores veem a agenda sem valores de taxas. */
function OperatorAgenda() {
  const { company } = useActiveCompany();
  const { data, loading } = useData(async () => must(await getSupabase().rpc("pos_editions", { p_company: company.id })) as {
    id: string;
    fair_name: string;
    edition_name: string;
    first_day: string | null;
    last_day: string | null;
    location_name: string | null;
    address: string | null;
    status: string;
  }[], [company.id]);
  return (
    <div>
      <PageHeader title="Agenda de feiras" description="Próximas feiras da empresa." />
      {loading && <Spinner />}
      {data && data.length === 0 && <EmptyState title="Nenhuma feira cadastrada" />}
      <div className="grid gap-3 md:grid-cols-2">
        {data?.map((e) => (
          <Card key={e.id}>
            <p className="font-bold">{e.fair_name}</p>
            <p className="text-sm text-muted">{e.edition_name}</p>
            <p className="mt-1 text-sm">{rangeLabel(e.first_day, e.last_day)}</p>
            <p className="text-sm text-muted">{[e.location_name, e.address].filter(Boolean).join(" · ")}</p>
          </Card>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted">Hoje: {formatDate(todayISO(company.timezone))}</p>
    </div>
  );
}
