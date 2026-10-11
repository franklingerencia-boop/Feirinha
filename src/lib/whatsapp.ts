import { formatDate, formatTime, weekday } from "./dates";

type ShareDay = { day: string; open_time?: string | null; close_time?: string | null };

export function buildEventMessage(opts: {
  name: string;
  days?: ShareDay[] | null;
  locationName?: string | null;
  address?: string | null;
  mapUrl?: string | null;
  url: string;
}): string {
  const lines: string[] = [`*${opts.name}*`];
  if (opts.days && opts.days.length) {
    lines.push("");
    lines.push("📅 Datas e horários:");
    for (const d of opts.days) {
      const hours = d.open_time ? ` — ${formatTime(d.open_time)}${d.close_time ? ` às ${formatTime(d.close_time)}` : ""}` : "";
      lines.push(`• ${weekday(d.day)}, ${formatDate(d.day)}${hours}`);
    }
  }
  if (opts.locationName || opts.address) {
    lines.push("");
    lines.push(`📍 Local: ${[opts.locationName, opts.address].filter(Boolean).join(" - ")}`);
  }
  if (opts.mapUrl) lines.push(`🗺️ Como chegar: ${opts.mapUrl}`);
  lines.push("");
  lines.push(`Mais informações: ${opts.url}`);
  return lines.join("\n");
}

/** Abre o WhatsApp com a mensagem pronta; o usuário escolhe o destinatário e confirma o envio. */
export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function whatsappChatUrl(phone: string, message = ""): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.length <= 11) digits = `55${digits}`;
  return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}
