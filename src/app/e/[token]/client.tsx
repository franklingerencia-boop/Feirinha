"use client";

import { MessageCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { MapLegend, StallMap, type Occ } from "@/components/shared/stall-map";
import { formatDate, weekday } from "@/lib/dates";
import { buildEventMessage, whatsappShareUrl } from "@/lib/whatsapp";

type Day = { id: string; day: string; open_time: string | null; close_time: string | null };

export function PublicMap({ map, days }: { map: { stalls: any[]; elements: any[]; occupancy: any[] }; days: Day[] }) {
  const [dayId, setDayId] = useState(days[0]?.id ?? "");
  const occ = useMemo(() => {
    const o: Record<string, Occ> = {};
    for (const x of map.occupancy) if (!dayId || x.day_id === dayId) o[x.stall_id] = { status: x.status, name: x.name };
    return o;
  }, [map.occupancy, dayId]);
  const showNames = map.occupancy.some((x) => x.name);
  return (
    <section className="rounded-2xl border border-line bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">Mapa das barracas</h2>
        {days.length > 1 && (
          <select className="h-10 rounded-xl border border-line px-3" value={dayId} onChange={(e) => setDayId(e.target.value)} aria-label="Dia do mapa">
            {days.map((d) => (
              <option key={d.id} value={d.id}>
                {weekday(d.day)}, {formatDate(d.day)}
              </option>
            ))}
          </select>
        )}
      </div>
      <StallMap stalls={map.stalls} elements={map.elements} occupancy={occ} showNames={showNames} />
      <div className="mt-2">
        <MapLegend />
      </div>
    </section>
  );
}

export function ShareButton(props: { name: string; days: Day[] | null; locationName: string | null; address: string | null; mapUrl: string | null }) {
  return (
    <a
      onClick={(e) => {
        const msg = buildEventMessage({ ...props, url: window.location.href });
        (e.currentTarget as HTMLAnchorElement).href = whatsappShareUrl(msg);
      }}
      href="#"
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] text-lg font-bold text-white shadow hover:brightness-95"
    >
      <MessageCircle className="h-6 w-6" /> Compartilhar pelo WhatsApp
    </a>
  );
}
