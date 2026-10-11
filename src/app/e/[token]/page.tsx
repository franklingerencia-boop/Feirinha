import type { Metadata } from "next";
import { CalendarDays, Clock, MapPin, Phone } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { formatDate, formatTime, weekday } from "@/lib/dates";
import { EVENT_STATUS } from "@/lib/labels";
import { getServerSupabase } from "@/lib/supabase/server";
import { PublicMap, ShareButton } from "./client";

type Shared = {
  name: string;
  status: string;
  organizer_name: string;
  description?: string | null;
  location_name?: string | null;
  address?: string | null;
  map_url?: string | null;
  arrival_instructions?: string | null;
  setup_info?: string | null;
  teardown_info?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  days?: { id: string; day: string; open_time: string | null; close_time: string | null; setup_time: string | null; teardown_time: string | null }[] | null;
  map?: { stalls: any[]; elements: any[]; occupancy: { stall_id: string; day_id: string; status: "reserved" | "confirmed"; name: string | null }[] } | null;
};

async function load(token: string): Promise<Shared | null> {
  const supabase = await getServerSupabase();
  const { data } = await supabase.rpc("get_shared_event", { p_token: token });
  return (data as Shared) ?? null;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const ev = await load(token);
  return { title: ev?.name ?? "Evento", robots: { index: false, follow: false } };
}

export default async function SharedEventPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ev = await load(token);
  if (!ev) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <Logo href="/" />
        <h1 className="mt-6 text-2xl font-extrabold">Link indisponível</h1>
        <p className="mt-2 text-muted">Este link foi revogado, renovado ou não existe. Peça um novo link ao organizador.</p>
      </div>
    );
  }
  return (
    <div className="min-h-dvh">
      <div className="awning h-3 w-full" aria-hidden />
      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
        <div className="flex items-center justify-between">
          <Logo href="/" />
          {ev.status === "canceled" && <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-bold text-red-800">Evento cancelado</span>}
        </div>
        <header>
          <p className="text-sm font-semibold text-brand-600">{ev.organizer_name}</p>
          <h1 className="text-3xl font-extrabold sm:text-4xl">{ev.name}</h1>
          {ev.status !== "canceled" && <p className="text-sm text-muted">{EVENT_STATUS[ev.status]}</p>}
          {ev.description && <p className="mt-3 whitespace-pre-wrap">{ev.description}</p>}
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          {ev.days && ev.days.length > 0 && (
            <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
              <h2 className="mb-2 flex items-center gap-2 font-bold">
                <CalendarDays className="h-5 w-5 text-brand-500" /> Datas e horários
              </h2>
              <ul className="space-y-1 text-sm">
                {ev.days.map((d) => (
                  <li key={d.id}>
                    <b>
                      {weekday(d.day)}, {formatDate(d.day)}
                    </b>
                    {d.open_time && ` — ${formatTime(d.open_time)} às ${formatTime(d.close_time)}`}
                    {(d.setup_time || d.teardown_time) && (
                      <span className="block text-xs text-muted">
                        {d.setup_time && `Montagem ${formatTime(d.setup_time)}`} {d.teardown_time && `· Desmontagem ${formatTime(d.teardown_time)}`}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(ev.location_name || ev.address || ev.map_url) && (
            <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
              <h2 className="mb-2 flex items-center gap-2 font-bold">
                <MapPin className="h-5 w-5 text-brand-500" /> Local
              </h2>
              <p className="text-sm">{ev.location_name}</p>
              <p className="text-sm text-muted">{ev.address}</p>
              {ev.map_url && (
                <a href={ev.map_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white">
                  Abrir no mapa
                </a>
              )}
            </div>
          )}
        </section>

        {(ev.arrival_instructions || ev.setup_info || ev.teardown_info) && (
          <section className="rounded-2xl border border-line bg-white p-4 shadow-sm">
            <h2 className="mb-2 flex items-center gap-2 font-bold">
              <Clock className="h-5 w-5 text-brand-500" /> Orientações
            </h2>
            {ev.arrival_instructions && <p className="whitespace-pre-wrap text-sm">{ev.arrival_instructions}</p>}
            {ev.setup_info && (
              <p className="mt-2 whitespace-pre-wrap text-sm">
                <b>Montagem:</b> {ev.setup_info}
              </p>
            )}
            {ev.teardown_info && (
              <p className="mt-2 whitespace-pre-wrap text-sm">
                <b>Desmontagem:</b> {ev.teardown_info}
              </p>
            )}
          </section>
        )}

        {ev.map && ev.map.stalls.length > 0 && <PublicMap map={ev.map} days={ev.days ?? []} />}

        {(ev.contact_name || ev.contact_phone) && (
          <section className="rounded-2xl border border-line bg-white p-4 shadow-sm">
            <h2 className="mb-1 flex items-center gap-2 font-bold">
              <Phone className="h-5 w-5 text-brand-500" /> Contato do organizador
            </h2>
            <p className="text-sm">{[ev.contact_name, ev.contact_phone].filter(Boolean).join(" · ")}</p>
          </section>
        )}

        <ShareButton name={ev.name} days={ev.days ?? null} locationName={ev.location_name ?? null} address={ev.address ?? null} mapUrl={ev.map_url ?? null} />
        <p className="pb-6 text-center text-xs text-muted">Página compartilhada pelo organizador via SR - Feirinhas. Mostra apenas as informações autorizadas.</p>
      </main>
    </div>
  );
}
