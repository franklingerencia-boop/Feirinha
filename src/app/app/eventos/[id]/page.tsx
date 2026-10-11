"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { ChargesTab } from "@/components/organizer/charges-tab";
import { CostsTab } from "@/components/organizer/costs-tab";
import { EventDataTab } from "@/components/organizer/event-data-tab";
import { MapTab } from "@/components/organizer/map-tab";
import { ParticipantsTab } from "@/components/organizer/participants-tab";
import { PendingTab } from "@/components/organizer/pending-tab";
import { PublishTab } from "@/components/organizer/publish-tab";
import { ShareTab } from "@/components/organizer/share-tab";
import { StallsTab } from "@/components/organizer/stalls-tab";
import type { EventBundle } from "@/components/organizer/types";
import { Badge, InfoBox, PageHeader, Spinner, Tabs } from "@/components/ui/ui";
import { rangeLabel } from "@/lib/dates";
import { EVENT_STATUS, STATUS_TONE } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase/client";
import { must, useData } from "@/lib/use-data";

type Tab = "dados" | "barracas" | "mapa" | "participantes" | "cobrancas" | "custos" | "pendencias" | "publicacao" | "compartilhar";

function EventInner() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const { canFinance, canManage } = useActiveCompany();
  const [tab, setTab] = useState<Tab>((params.get("aba") as Tab) || "dados");

  const { data, loading, error, reload } = useData(async (): Promise<EventBundle> => {
    const s = getSupabase();
    const [event, days, types, stalls, elements, participants, assignments, publication] = await Promise.all([
      s.from("events").select("*").eq("id", id).single(),
      s.from("event_days").select("*").eq("event_id", id).order("day"),
      s.from("stall_types").select("*").eq("event_id", id).order("name"),
      s.from("stalls").select("*").eq("event_id", id).order("code"),
      s.from("map_elements").select("*").eq("event_id", id),
      canManage ? s.from("participant_overview").select("*").eq("event_id", id).order("trade_name") : Promise.resolve({ data: [], error: null }),
      s.from("stall_assignments").select("id,stall_id,participant_id,event_day_id").eq("event_id", id),
      s.from("event_publications").select("*").eq("event_id", id).maybeSingle(),
    ]);
    const parts = must(participants) as EventBundle["participants"];
    const pdays = parts.length
      ? (must(await s.from("event_participant_days").select("participant_id,event_day_id").in("participant_id", parts.map((p) => p.id))) as EventBundle["pdays"])
      : [];
    return {
      event: must(event),
      days: must(days),
      types: must(types),
      stalls: (must(stalls) as EventBundle["stalls"]).sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true })),
      elements: must(elements),
      participants: parts,
      pdays,
      assignments: must(assignments),
      publication: publication.data,
    };
  }, [id, canManage]);

  if (loading && !data) return <Spinner />;
  if (error) return <InfoBox tone="danger">{error}</InfoBox>;
  if (!data) return null;
  const ev = data.event;
  const first = data.days[0]?.day;
  const last = data.days[data.days.length - 1]?.day;

  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: "dados", label: "Dados e dias" },
    { value: "barracas", label: "Barracas", count: data.stalls.length },
    { value: "mapa", label: "Mapa" },
    ...(canManage ? [{ value: "participantes" as Tab, label: "Participantes", count: data.participants.filter((p) => p.status !== "canceled").length }] : []),
    ...(canFinance ? [{ value: "cobrancas" as Tab, label: "Cobranças" }, { value: "custos" as Tab, label: "Custos e resultado" }] : []),
    ...(canManage ? [{ value: "pendencias" as Tab, label: "Pendências" }, { value: "publicacao" as Tab, label: "Publicação" }, { value: "compartilhar" as Tab, label: "Compartilhar" }] : []),
  ];

  return (
    <div>
      <Link href="/app/eventos" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Eventos
      </Link>
      <PageHeader
        title={ev.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {rangeLabel(first, last)} <Badge tone={STATUS_TONE[ev.status]}>{EVENT_STATUS[ev.status]}</Badge>
            {data.publication?.is_published && <Badge tone="info">Publicado em Feiras disponíveis</Badge>}
          </span>
        }
      />
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {tab === "dados" && <EventDataTab b={data} reload={reload} />}
      {tab === "barracas" && <StallsTab b={data} reload={reload} />}
      {tab === "mapa" && <MapTab b={data} reload={reload} />}
      {tab === "participantes" && <ParticipantsTab b={data} reload={reload} />}
      {tab === "cobrancas" && <ChargesTab b={data} reload={reload} />}
      {tab === "custos" && <CostsTab b={data} />}
      {tab === "pendencias" && <PendingTab b={data} goTo={(t) => setTab(t as Tab)} />}
      {tab === "publicacao" && <PublishTab b={data} reload={reload} />}
      {tab === "compartilhar" && <ShareTab b={data} />}
    </div>
  );
}

export default function EventPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <EventInner />
    </Suspense>
  );
}
