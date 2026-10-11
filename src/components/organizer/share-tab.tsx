"use client";

import { Copy, ExternalLink, MessageCircle, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button, Card, Checkbox, ConfirmDialog, InfoBox, Spinner } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { friendlyError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase/client";
import { must, useData } from "@/lib/use-data";
import { buildEventMessage, whatsappShareUrl } from "@/lib/whatsapp";
import type { EventBundle } from "./types";

const OPTIONS: { key: string; label: string; def: boolean }[] = [
  { key: "show_description", label: "Descrição", def: true },
  { key: "show_dates", label: "Datas e horários", def: true },
  { key: "show_address", label: "Local e endereço", def: true },
  { key: "show_map_link", label: "Link de localização", def: true },
  { key: "show_arrival", label: "Orientações de chegada", def: true },
  { key: "show_setup", label: "Montagem e desmontagem", def: true },
  { key: "show_stall_map", label: "Mapa das barracas", def: true },
  { key: "show_participant_names", label: "Nomes dos participantes no mapa", def: false },
  { key: "show_contact", label: "Contato do organizador", def: false },
];

export function ShareTab({ b }: { b: EventBundle }) {
  const toast = useToast();
  const [renew, setRenew] = useState(false);
  const [revoke, setRevoke] = useState(false);
  const { data: link, loading, reload } = useData(
    async () => must(await getSupabase().from("share_links").select("*").eq("event_id", b.event.id).eq("active", true).maybeSingle()) as Record<string, any> | null,
    [b.event.id],
  ) as { data: Record<string, any> | null; loading: boolean; reload: () => void };
  const [opts, setOpts] = useState<Record<string, boolean> | null>(null);
  const current = opts ?? Object.fromEntries(OPTIONS.map((o) => [o.key, link ? Boolean(link[o.key]) : o.def]));
  const url = link ? `${typeof window !== "undefined" ? window.location.origin : ""}/e/${link.token}` : "";

  const create = async () => {
    const { error } = await getSupabase().rpc("create_share_link", { p_event: b.event.id, p_options: current });
    if (error) return toast.error(friendlyError(error));
    toast.success(link ? "Link renovado. O endereço anterior deixou de funcionar." : "Link criado.");
    setRenew(false);
    setOpts(null);
    reload();
  };
  const saveOpts = async () => {
    const { error } = await getSupabase().rpc("update_share_link", { p_event: b.event.id, p_options: current });
    if (error) return toast.error(friendlyError(error));
    toast.success("Itens públicos atualizados.");
    setOpts(null);
    reload();
  };

  const message = buildEventMessage({
    name: b.event.name,
    days: current.show_dates ? b.days : null,
    locationName: current.show_address ? b.event.location_name : null,
    address: current.show_address ? b.event.address : null,
    mapUrl: current.show_map_link ? b.event.map_url : null,
    url,
  });

  if (loading && !link) return <Spinner />;
  return (
    <div className="space-y-4">
      {b.event.status === "draft" && <InfoBox tone="warning">Eventos em rascunho não são exibidos no link público. Mude a situação na aba Dados.</InfoBox>}
      <Card title="Itens visíveis na página compartilhada">
        <div className="grid gap-2 sm:grid-cols-2">
          {OPTIONS.map((o) => (
            <Checkbox key={o.key} label={o.label} checked={current[o.key]} onChange={(v) => setOpts({ ...current, [o.key]: v })} />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Dados financeiros, documentos e contatos privados dos participantes nunca aparecem na página pública.</p>
        {link && opts && (
          <Button className="mt-3" onClick={saveOpts}>
            Salvar itens públicos
          </Button>
        )}
      </Card>
      <Card title="Link do evento">
        {!link ? (
          <Button onClick={create}>Criar link compartilhável</Button>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <code className="min-w-0 flex-1 truncate rounded-xl bg-cream px-3 py-2 text-sm ring-1 ring-line">{url}</code>
              <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("Link copiado."))}>
                Copiar
              </Button>
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-1 rounded-xl border border-line bg-white px-4 font-semibold">
                <ExternalLink className="h-4 w-4" /> Abrir
              </a>
            </div>
            <a
              href={whatsappShareUrl(message)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-14 items-center gap-2 rounded-xl bg-[#25D366] px-6 text-lg font-bold text-white shadow hover:brightness-95"
            >
              <MessageCircle className="h-6 w-6" /> Compartilhar pelo WhatsApp
            </a>
            <p className="text-xs text-muted">O WhatsApp abre com a mensagem pronta; você escolhe o destinatário e confirma o envio. Não há envio automático nem em massa.</p>
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold">Ver mensagem</summary>
              <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-cream p-3 font-sans ring-1 ring-line">{message}</pre>
            </details>
            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={() => setRenew(true)}>
                Renovar link
              </Button>
              <Button variant="ghost" onClick={() => setRevoke(true)}>
                Revogar link
              </Button>
            </div>
          </div>
        )}
      </Card>
      <ConfirmDialog open={renew} title="Renovar o link?" tone="primary" message="Um novo endereço será criado e o anterior deixará de funcionar." confirmLabel="Renovar" onClose={() => setRenew(false)} onConfirm={create} />
      <ConfirmDialog
        open={revoke}
        title="Revogar o link?"
        message="Quem tiver o link não conseguirá mais ver a página do evento."
        confirmLabel="Revogar"
        onClose={() => setRevoke(false)}
        onConfirm={async () => {
          const { error } = await getSupabase().rpc("revoke_share_link", { p_event: b.event.id });
          if (error) return toast.error(friendlyError(error));
          toast.success("Link revogado.");
          setRevoke(false);
          reload();
        }}
      />
    </div>
  );
}
