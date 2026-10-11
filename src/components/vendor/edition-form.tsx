"use client";

import { useEffect, useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { Button, Field, InfoBox, Input, Modal, MoneyInput, Select, Textarea } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { dateRange, formatDate } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { formatBRL, feeTotal } from "@/lib/money";
import { getSupabase } from "@/lib/supabase/client";

type Fair = { id: string; name: string; organizer_name: string | null; default_location_name: string | null; default_address: string | null };

/** Cadastro manual de participação em feira (inclusive de organizadores fora da plataforma). */
export function NewEditionDialog({ open, onClose, onCreated, fairId }: { open: boolean; onClose: () => void; onCreated: (id: string) => void; fairId?: string }) {
  const { company } = useActiveCompany();
  const toast = useToast();
  const [fairs, setFairs] = useState<Fair[]>([]);
  const [fairMode, setFairMode] = useState<"existing" | "new">("new");
  const [form, setForm] = useState({
    fair_id: fairId ?? "",
    fair_name: "",
    organizer_name: "",
    organizer_phone: "",
    organizer_whatsapp: "",
    organizer_email: "",
    name: "",
    location_name: "",
    address: "",
    map_url: "",
    stall_label: "",
    fee_mode: "per_day" as "per_day" | "per_event",
    fee_cents: 0 as number | null,
    fee_due_date: "",
    status: "planned",
    notes: "",
    start: "",
    end: "",
    open_time: "",
    close_time: "",
    setup_time: "",
    teardown_time: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setError(null);
    getSupabase()
      .from("fairs")
      .select("id,name,organizer_name,default_location_name,default_address")
      .eq("company_id", company.id)
      .eq("archived", false)
      .order("name")
      .then(({ data }) => {
        setFairs(data ?? []);
        if (fairId || (data && data.length > 0)) setFairMode(fairId ? "existing" : "existing");
        if (!data?.length) setFairMode("new");
      });
  }, [open, company.id, fairId]);

  const days = form.start ? dateRange(form.start, form.end || form.start) : [];
  const total = feeTotal(form.fee_mode, form.fee_cents ?? 0, days.length);

  const save = async () => {
    setError(null);
    if (fairMode === "new" && form.fair_name.trim().length < 2) return setError("Informe o nome da feira.");
    if (fairMode === "existing" && !form.fair_id) return setError("Escolha a feira.");
    if (!form.start) return setError("Informe a data de início.");
    if (form.end && form.end < form.start) return setError("A data final deve ser depois da inicial.");
    if (days.length > 60) return setError("Período muito longo (máximo de 60 dias por edição).");
    setBusy(true);
    const s = getSupabase();
    try {
      let fid = form.fair_id;
      if (fairMode === "new") {
        const { data, error } = await s
          .from("fairs")
          .insert({
            company_id: company.id,
            name: form.fair_name.trim(),
            organizer_name: form.organizer_name || null,
            organizer_phone: form.organizer_phone || null,
            organizer_whatsapp: form.organizer_whatsapp || null,
            organizer_email: form.organizer_email || null,
            default_location_name: form.location_name || null,
            default_address: form.address || null,
          })
          .select("id")
          .single();
        if (error) throw error;
        fid = data.id;
      }
      const fair = fairs.find((f) => f.id === fid);
      const { data: ed, error: e2 } = await s
        .from("fair_editions")
        .insert({
          company_id: company.id,
          fair_id: fid,
          name: form.name.trim() || `Edição ${formatDate(form.start)}`,
          location_name: form.location_name || fair?.default_location_name || null,
          address: form.address || fair?.default_address || null,
          map_url: form.map_url || null,
          organizer_contact: [form.organizer_name, form.organizer_phone].filter(Boolean).join(" - ") || null,
          stall_label: form.stall_label || null,
          fee_mode: form.fee_mode,
          fee_cents: form.fee_cents ?? 0,
          fee_due_date: form.fee_due_date || null,
          status: form.status,
          notes: form.notes || null,
        })
        .select("id")
        .single();
      if (e2) throw e2;
      const { error: e3 } = await s.from("edition_days").insert(
        days.map((d) => ({
          company_id: company.id,
          edition_id: ed.id,
          day: d,
          open_time: form.open_time || null,
          close_time: form.close_time || null,
          setup_time: form.setup_time || null,
          teardown_time: form.teardown_time || null,
        })),
      );
      if (e3) throw e3;
      toast.success("Participação cadastrada na agenda.");
      onCreated(ed.id);
      onClose();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova participação em feira"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={busy}>
            Salvar na agenda
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error && <InfoBox tone="danger">{error}</InfoBox>}
        <section className="space-y-3">
          <h3 className="font-bold">1. Feira</h3>
          {fairs.length > 0 && (
            <div className="flex gap-2">
              <Button size="sm" variant={fairMode === "existing" ? "primary" : "secondary"} onClick={() => setFairMode("existing")}>
                Feira já cadastrada
              </Button>
              <Button size="sm" variant={fairMode === "new" ? "primary" : "secondary"} onClick={() => setFairMode("new")}>
                Nova feira
              </Button>
            </div>
          )}
          {fairMode === "existing" ? (
            <Field label="Feira" required>
              <Select value={form.fair_id} onChange={(e) => set("fair_id", e.target.value)}>
                <option value="">Selecione...</option>
                {fairs.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                    {f.organizer_name ? ` (${f.organizer_name})` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome da feira" required className="sm:col-span-2">
                <Input value={form.fair_name} onChange={(e) => set("fair_name", e.target.value)} placeholder="Ex.: Feira da Praça XV" />
              </Field>
              <Field label="Organizador" hint="Pode ser alguém que não usa o app">
                <Input value={form.organizer_name} onChange={(e) => set("organizer_name", e.target.value)} />
              </Field>
              <Field label="Telefone do organizador">
                <Input inputMode="tel" value={form.organizer_phone} onChange={(e) => set("organizer_phone", e.target.value)} />
              </Field>
              <Field label="WhatsApp do organizador">
                <Input inputMode="tel" value={form.organizer_whatsapp} onChange={(e) => set("organizer_whatsapp", e.target.value)} />
              </Field>
              <Field label="E-mail do organizador">
                <Input type="email" value={form.organizer_email} onChange={(e) => set("organizer_email", e.target.value)} />
              </Field>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="font-bold">2. Edição, local e datas</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome da edição" hint="Ex.: Natal 2026 (opcional)">
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Situação">
              <Select value={form.status} onChange={(e) => set("status", e.target.value)}>
                <option value="planned">Planejada</option>
                <option value="confirmed">Confirmada</option>
                <option value="completed">Concluída</option>
              </Select>
            </Field>
            <Field label="Local">
              <Input value={form.location_name} onChange={(e) => set("location_name", e.target.value)} placeholder="Ex.: Praça Central" />
            </Field>
            <Field label="Endereço">
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
            <Field label="Link do mapa" hint="Cole o link do Google Maps, se tiver">
              <Input type="url" value={form.map_url} onChange={(e) => set("map_url", e.target.value)} />
            </Field>
            <Field label="Barraca (número ou identificação)">
              <Input value={form.stall_label} onChange={(e) => set("stall_label", e.target.value)} />
            </Field>
            <Field label="Primeiro dia" required>
              <Input type="date" value={form.start} onChange={(e) => set("start", e.target.value)} />
            </Field>
            <Field label="Último dia" hint="Deixe vazio se for um dia só">
              <Input type="date" value={form.end} min={form.start} onChange={(e) => set("end", e.target.value)} />
            </Field>
            <Field label="Abertura">
              <Input type="time" value={form.open_time} onChange={(e) => set("open_time", e.target.value)} />
            </Field>
            <Field label="Encerramento">
              <Input type="time" value={form.close_time} onChange={(e) => set("close_time", e.target.value)} />
            </Field>
            <Field label="Montagem (opcional)">
              <Input type="time" value={form.setup_time} onChange={(e) => set("setup_time", e.target.value)} />
            </Field>
            <Field label="Desmontagem (opcional)">
              <Input type="time" value={form.teardown_time} onChange={(e) => set("teardown_time", e.target.value)} />
            </Field>
          </div>
          {days.length > 1 && <p className="text-xs text-muted">{days.length} dias. Depois de salvar, você pode desmarcar os dias em que não vai participar.</p>}
        </section>

        <section className="space-y-3">
          <h3 className="font-bold">3. Taxa de participação</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Forma de cobrança">
              <Select value={form.fee_mode} onChange={(e) => set("fee_mode", e.target.value)}>
                <option value="per_day">Por dia</option>
                <option value="per_event">Valor único por evento</option>
              </Select>
            </Field>
            <Field label={form.fee_mode === "per_day" ? "Valor por dia" : "Valor único"}>
              <MoneyInput value={form.fee_cents} onChange={(v) => set("fee_cents", v)} />
            </Field>
            <Field label="Vencimento">
              <Input type="date" value={form.fee_due_date} onChange={(e) => set("fee_due_date", e.target.value)} />
            </Field>
          </div>
          <InfoBox>
            Total da taxa: <b>{formatBRL(total)}</b>
            {form.fee_mode === "per_day" ? ` (${formatBRL(form.fee_cents ?? 0)} × ${days.length} dia(s))` : " (cobrado uma única vez)"}. A taxa entra
            automaticamente em contas a pagar.
          </InfoBox>
          <Field label="Observações">
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </section>
      </div>
    </Modal>
  );
}
