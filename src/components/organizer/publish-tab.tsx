"use client";

import { useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { ConsentDialog } from "@/components/shared/consent";
import { Badge, Button, Card, Checkbox, ConfirmDialog, InfoBox } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase/client";
import type { EventBundle } from "./types";

const OPTIONS: { key: string; label: string; def: boolean }[] = [
  { key: "show_description", label: "Descrição", def: true },
  { key: "show_location", label: "Local, endereço e link de mapa", def: true },
  { key: "show_dates", label: "Datas, horários, montagem e desmontagem", def: true },
  { key: "show_segments", label: "Segmentos aceitos", def: true },
  { key: "show_structure", label: "Estrutura oferecida", def: true },
  { key: "show_vacancies", label: "Vagas disponíveis", def: true },
  { key: "show_fees", label: "Taxas e prazo de pagamento", def: false },
  { key: "show_rules", label: "Regras de participação", def: true },
  { key: "show_contact", label: "Contato do evento (nome, telefone, e-mail)", def: false },
];

export function PublishTab({ b, reload }: { b: EventBundle; reload: () => void }) {
  const { company } = useActiveCompany();
  const toast = useToast();
  const pub = b.publication as Record<string, unknown> | null;
  const [opts, setOpts] = useState<Record<string, boolean>>(Object.fromEntries(OPTIONS.map((o) => [o.key, pub ? Boolean(pub[o.key]) : o.def])));
  const [consent, setConsent] = useState(false);
  const [unpub, setUnpub] = useState(false);
  const published = Boolean(pub?.is_published);
  const canPublish = ["open", "confirmed"].includes(b.event.status);

  return (
    <div className="space-y-4">
      <InfoBox>
        Publicar é <b>opcional</b>. Você pode continuar gerenciando este evento de forma privada. Ao publicar, ele aparece em <b>“Feiras disponíveis”</b> apenas para empresas
        feirantes cadastradas na plataforma, que podem solicitar participação — você aprova cada pedido.
      </InfoBox>
      <Card title="Situação da publicação">
        {published ? (
          <div className="space-y-2 text-sm">
            <Badge tone="success">Publicado</Badge>
            <p>
              Termo de autorização v{String(pub?.terms_version)} aceito em {formatDateTime(pub?.accepted_at as string)}.
            </p>
            <Button variant="danger" onClick={() => setUnpub(true)}>
              Retirar publicação
            </Button>
          </div>
        ) : (
          <p className="text-sm">
            <Badge>Não publicado</Badge>
            {pub?.unpublished_at ? <span className="ml-2 text-muted">Retirado em {formatDateTime(pub.unpublished_at as string)}</span> : null}
          </p>
        )}
      </Card>
      <Card title="O que será exibido">
        <p className="mb-3 text-sm text-muted">O nome do evento e o nome do organizador são sempre exibidos. Escolha o restante:</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {OPTIONS.map((o) => (
            <Checkbox key={o.key} label={o.label} checked={opts[o.key]} onChange={(v) => setOpts((x) => ({ ...x, [o.key]: v }))} />
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">Nunca são exibidos: finanças, pagamentos, documentos e dados dos participantes. Alterar estes itens exige novo aceite do termo.</p>
        {!canPublish && <InfoBox tone="warning">Mude a situação do evento para “Inscrições abertas” ou “Confirmado” antes de publicar.</InfoBox>}
        <Button className="mt-3" disabled={!canPublish} onClick={() => setConsent(true)}>
          {published ? "Atualizar publicação" : "Publicar evento"}
        </Button>
      </Card>
      <ConsentDialog
        open={consent}
        onClose={() => setConsent(false)}
        code="publication"
        confirmLabel={published ? "Aceitar e atualizar" : "Aceitar e publicar"}
        parties={[
          { label: "Organizador", value: company.name },
          { label: "Evento", value: b.event.name },
          { label: "Disponível para", value: "Empresas feirantes autenticadas na plataforma" },
          { label: "Itens exibidos", value: ["Nome", ...OPTIONS.filter((o) => opts[o.key]).map((o) => o.label)].join(", ") },
        ]}
        onAccept={async () => {
          const { error } = await getSupabase().rpc("publish_event", { p_event: b.event.id, p_options: opts, p_accept_terms: true });
          if (error) return toast.error(friendlyError(error));
          toast.success("Evento publicado em Feiras disponíveis.");
          setConsent(false);
          reload();
        }}
      />
      <ConfirmDialog
        open={unpub}
        title="Retirar publicação?"
        message="O evento deixa de aparecer em Feiras disponíveis imediatamente. Solicitações já recebidas continuam no seu histórico."
        confirmLabel="Retirar"
        onClose={() => setUnpub(false)}
        onConfirm={async () => {
          const { error } = await getSupabase().rpc("unpublish_event", { p_event: b.event.id });
          if (error) return toast.error(friendlyError(error));
          toast.success("Publicação retirada.");
          setUnpub(false);
          reload();
        }}
      />
    </div>
  );
}
