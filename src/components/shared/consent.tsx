"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button, Checkbox, InfoBox, Modal, Spinner } from "@/components/ui/ui";
import { VENDOR_FIELDS } from "@/lib/labels";
import { getSupabase } from "@/lib/supabase/client";

export type Term = { code: string; version: number; title: string; body: string };

export function useTerm(code: "link" | "publication") {
  const [term, setTerm] = useState<Term | null>(null);
  useEffect(() => {
    getSupabase()
      .rpc("current_term", { p_code: code })
      .then(({ data }) => setTerm((data as Term[] | null)?.[0] ?? null));
  }, [code]);
  return term;
}

export const SHAREABLE_VENDOR_FIELDS = ["responsible_name", "phone", "whatsapp", "email", "segment", "products"] as const;

/** Seleção do que o feirante autoriza compartilhar (nome comercial é sempre compartilhado). */
export function ScopePicker({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Checkbox label={VENDOR_FIELDS.trade_name} checked disabled onChange={() => {}} />
      {SHAREABLE_VENDOR_FIELDS.map((f) => (
        <Checkbox
          key={f}
          label={VENDOR_FIELDS[f]}
          checked={value.includes(f)}
          disabled={disabled}
          onChange={(on) => onChange(on ? [...value, f] : value.filter((x) => x !== f))}
        />
      ))}
    </div>
  );
}

/**
 * Termo de permissão com aceite explícito. Mostra as partes, o evento, os dados
 * compartilhados, a finalidade, as atualizações e como revogar.
 */
export function ConsentDialog({
  open,
  onClose,
  code,
  parties,
  extra,
  confirmLabel,
  onAccept,
}: {
  open: boolean;
  onClose: () => void;
  code: "link" | "publication";
  parties: { label: string; value: ReactNode }[];
  extra?: ReactNode;
  confirmLabel: string;
  onAccept: () => Promise<void>;
}) {
  const term = useTerm(code);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setAccepted(false);
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={term?.title ?? "Termo de permissão"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Voltar
          </Button>
          <Button
            disabled={!accepted}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onAccept();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {!term ? (
        <Spinner />
      ) : (
        <div className="space-y-4 text-sm">
          <dl className="grid gap-2 rounded-xl bg-cream p-3 ring-1 ring-line sm:grid-cols-2">
            {parties.map((p) => (
              <div key={p.label}>
                <dt className="text-xs font-semibold uppercase text-muted">{p.label}</dt>
                <dd className="font-semibold">{p.value}</dd>
              </div>
            ))}
          </dl>
          {extra}
          <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border border-line p-3 leading-relaxed">{term.body}</div>
          <InfoBox>
            Versão do termo: <b>{term.version}</b>. Registramos a versão, a data, o usuário responsável e o evento ao qual esta autorização se aplica.
          </InfoBox>
          <Checkbox label="Li e aceito este termo." checked={accepted} onChange={setAccepted} />
        </div>
      )}
    </Modal>
  );
}
