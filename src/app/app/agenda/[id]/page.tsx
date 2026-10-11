"use client";

import { ArrowLeft, Bell, ExternalLink, MapPin, Phone, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { SettleDialog, type SettleTarget } from "@/components/shared/settle-dialog";
import { TransactionDialog } from "@/components/shared/transaction-form";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  Field,
  InfoBox,
  Input,
  Modal,
  MoneyInput,
  PageHeader,
  Select,
  Spinner,
  Table,
  Td,
  Textarea,
  Th,
} from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatDateTime, formatTime, weekday } from "@/lib/dates";
import { friendlyError } from "@/lib/errors";
import { EDITION_STATUS, FEE_MODE, STATUS_TONE, TX_STATUS } from "@/lib/labels";
import { feeTotal, formatBRL } from "@/lib/money";
import { getSupabase } from "@/lib/supabase/client";
import { must, useData } from "@/lib/use-data";
import { whatsappChatUrl } from "@/lib/whatsapp";

type Day = { id: string; day: string; open_time: string | null; close_time: string | null; setup_time: string | null; teardown_time: string | null; participating: boolean };

export default function EditionPage() {
  const { id } = useParams<{ id: string }>();
  const { company, canFinance } = useActiveCompany();
  const toast = useToast();
  const s = getSupabase();
  const [editing, setEditing] = useState(false);
  const [settle, setSettle] = useState<SettleTarget | null>(null);
  const [txOpen, setTxOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [newDay, setNewDay] = useState("");

  const { data, loading, error, reload } = useData(async () => {
    const ed = must(await s.from("fair_editions").select("*, fairs(*)").eq("id", id).single());
    const days = must(await s.from("edition_days").select("*").eq("edition_id", id).order("day")) as Day[];
    const txs = canFinance
      ? (must(await s.from("transactions").select("*").eq("fair_edition_id", id).order("due_date")) as {
          id: string;
          kind: "income" | "expense";
          status: string;
          description: string;
          amount_cents: number;
          due_date: string;
          paid_date: string | null;
          source_type: string;
          account_id: string | null;
        }[])
      : [];
    const sales = canFinance
      ? (must(await s.from("sales").select("total_cents,status").eq("fair_edition_id", id).eq("status", "completed")) as { total_cents: number }[])
      : [];
    return { ed, days, txs, sales };
  }, [id, canFinance]);

  if (loading && !data) return <Spinner />;
  if (error) return <InfoBox tone="danger">{error}</InfoBox>;
  if (!data) return null;
  const { ed, days, txs, sales } = data;
  const fair = ed.fairs;
  const partDays = days.filter((d) => d.participating);
  const total = feeTotal(ed.fee_mode, ed.fee_cents, partDays.length);
  const feeTx = txs.find((t) => (t.source_type === "fair_fee" || t.source_type === "fair_fee_reopen") && t.status !== "canceled");
  const salesTotal = sales.reduce((a, x) => a + Number(x.total_cents), 0);
  const expensesTotal = txs.filter((t) => t.kind === "expense" && t.status !== "canceled").reduce((a, t) => a + Number(t.amount_cents), 0);

  const updateDay = async (d: Day, patch: Partial<Day>) => {
    const { error } = await s.from("edition_days").update(patch).eq("id", d.id);
    if (error) toast.error(friendlyError(error));
    reload();
  };

  const addDay = async () => {
    if (!newDay) return;
    const ref = days[0];
    const { error } = await s.from("edition_days").insert({
      company_id: company.id,
      edition_id: id,
      day: newDay,
      open_time: ref?.open_time ?? null,
      close_time: ref?.close_time ?? null,
    });
    if (error) return toast.error(friendlyError(error));
    setNewDay("");
    reload();
  };

  const removeDay = async (d: Day) => {
    const { error } = await s.from("edition_days").delete().eq("id", d.id);
    if (error) return toast.error(friendlyError(error));
    reload();
  };

  const setStatus = async (status: string) => {
    const { error } = await s.from("fair_editions").update({ status }).eq("id", id);
    if (error) return toast.error(friendlyError(error));
    toast.success(status === "canceled" ? "Participação cancelada. A taxa prevista foi cancelada nas contas a pagar." : "Situação atualizada.");
    reload();
  };

  return (
    <div className="space-y-4">
      <Link href="/app/agenda" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Agenda
      </Link>
      <PageHeader
        title={fair.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {ed.name} <Badge tone={STATUS_TONE[ed.status]}>{EDITION_STATUS[ed.status]}</Badge>
            {ed.link_id && <Badge tone="info">Vinculada ao organizador</Badge>}
          </span>
        }
        actions={
          <>
            <Select value={ed.status} onChange={(e) => (e.target.value === "canceled" ? setConfirmCancel(true) : setStatus(e.target.value))} aria-label="Situação da participação" className="w-44">
              <option value="planned">Planejada</option>
              <option value="confirmed">Confirmada</option>
              <option value="completed">Concluída</option>
              <option value="canceled">Cancelada</option>
            </Select>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Editar dados
            </Button>
          </>
        }
      />

      {ed.link_id && <OfficialData linkId={ed.link_id} onApplied={reload} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Local e organizador" className="lg:col-span-2">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-muted">Local</dt>
              <dd className="flex items-start gap-1">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                <span>
                  {ed.location_name || "—"}
                  {ed.address && <span className="block text-muted">{ed.address}</span>}
                  {ed.map_url && (
                    <a href={ed.map_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline">
                      Abrir mapa <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </span>
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-muted">Barraca</dt>
              <dd className="text-lg font-bold">{ed.stall_label || "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-muted">Organizador</dt>
              <dd>
                {fair.organizer_name || ed.organizer_contact || "—"}
                {fair.organizer_phone && (
                  <span className="block">
                    <Phone className="mr-1 inline h-3 w-3" />
                    {fair.organizer_phone}
                  </span>
                )}
                {fair.organizer_whatsapp && (
                  <a href={whatsappChatUrl(fair.organizer_whatsapp)} target="_blank" rel="noopener noreferrer" className="font-semibold text-leaf-600 hover:underline">
                    Conversar no WhatsApp
                  </a>
                )}
                {fair.organizer_email && <span className="block text-muted">{fair.organizer_email}</span>}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-muted">Observações</dt>
              <dd className="whitespace-pre-wrap">{ed.notes || "—"}</dd>
            </div>
          </dl>
        </Card>

        <Card title="Taxa de participação">
          <p className="text-3xl font-extrabold">{formatBRL(total)}</p>
          <p className="text-sm text-muted">
            {FEE_MODE[ed.fee_mode]}: {formatBRL(ed.fee_cents)}
            {ed.fee_mode === "per_day" ? ` × ${partDays.length} dia(s)` : " — cobrado uma vez"}
          </p>
          <p className="mt-1 text-sm">Vencimento: {formatDate(ed.fee_due_date ?? feeTx?.due_date)}</p>
          {canFinance && (
            <div className="mt-3">
              {feeTx ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={STATUS_TONE[feeTx.status]}>{feeTx.status === "settled" ? `Paga em ${formatDate(feeTx.paid_date)}` : "A pagar"}</Badge>
                  {feeTx.status === "planned" && (
                    <Button size="sm" variant="success" onClick={() => setSettle({ ...feeTx })}>
                      Marcar como paga
                    </Button>
                  )}
                </div>
              ) : (
                total > 0 && <p className="text-xs text-muted">Sem lançamento ativo.</p>
              )}
              {feeTx?.status === "settled" && feeTx.amount_cents !== total && (
                <InfoBox tone="warning">O valor pago ({formatBRL(feeTx.amount_cents)}) é diferente da taxa atual. Registre a diferença no financeiro, se houver.</InfoBox>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card title={`Dias (${partDays.length} de participação)`}>
        <Table>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Participo?</Th>
              <Th>Abertura</Th>
              <Th>Encerramento</Th>
              <Th>Montagem</Th>
              <Th>Desmontagem</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.id} className={d.participating ? "" : "opacity-60"}>
                <Td className="whitespace-nowrap font-semibold">
                  {weekday(d.day)}, {formatDate(d.day)}
                </Td>
                <Td>
                  <Checkbox label={d.participating ? "Sim" : "Não"} checked={d.participating} onChange={(v) => updateDay(d, { participating: v })} />
                </Td>
                {(["open_time", "close_time", "setup_time", "teardown_time"] as const).map((k) => (
                  <Td key={k}>
                    <Input
                      type="time"
                      aria-label={k}
                      defaultValue={formatTime(d[k])}
                      className="h-9 w-28"
                      onBlur={(e) => {
                        const v = e.target.value || null;
                        if (v !== (d[k] ? formatTime(d[k]) : null)) updateDay(d, { [k]: v } as Partial<Day>);
                      }}
                    />
                  </Td>
                ))}
                <Td>
                  <Button size="sm" variant="ghost" aria-label={`Remover dia ${formatDate(d.day)}`} onClick={() => removeDay(d)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Adicionar dia">
            <Input type="date" value={newDay} onChange={(e) => setNewDay(e.target.value)} />
          </Field>
          <Button variant="secondary" onClick={addDay} disabled={!newDay} icon={<Plus className="h-4 w-4" />}>
            Adicionar
          </Button>
        </div>
      </Card>

      {canFinance && (
        <Card
          title="Financeiro desta feira"
          actions={
            <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setTxOpen(true)}>
              Lançar despesa/receita
            </Button>
          }
        >
          <div className="mb-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl bg-leaf-50 p-3">
              <p className="text-xs font-semibold text-leaf-700">Vendas</p>
              <p className="text-xl font-extrabold">{formatBRL(salesTotal)}</p>
            </div>
            <div className="rounded-xl bg-red-50 p-3">
              <p className="text-xs font-semibold text-red-700">Despesas e taxas</p>
              <p className="text-xl font-extrabold">{formatBRL(expensesTotal)}</p>
            </div>
            <div className="rounded-xl bg-brand-50 p-3">
              <p className="text-xs font-semibold text-brand-700">Vendas − despesas</p>
              <p className="text-xl font-extrabold">{formatBRL(salesTotal - expensesTotal)}</p>
              <p className="text-[11px] text-muted">Sem descontar o custo dos produtos (veja o Painel).</p>
            </div>
          </div>
          {txs.length === 0 ? (
            <p className="text-sm text-muted">Nenhum lançamento vinculado.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Descrição</Th>
                  <Th>Vencimento</Th>
                  <Th>Situação</Th>
                  <Th className="text-right">Valor</Th>
                </tr>
              </thead>
              <tbody>
                {txs.map((t) => (
                  <tr key={t.id} className={t.status === "canceled" ? "line-through opacity-50" : ""}>
                    <Td>{t.description}</Td>
                    <Td>{formatDate(t.due_date)}</Td>
                    <Td>
                      <Badge tone={STATUS_TONE[t.status]}>{TX_STATUS[t.status]}</Badge>
                    </Td>
                    <Td className={`text-right font-semibold tabular-nums ${t.kind === "income" ? "text-leaf-600" : "text-red-700"}`}>
                      {t.kind === "income" ? "+" : "−"} {formatBRL(t.amount_cents)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {editing && <EditEditionDialog ed={ed} onClose={() => setEditing(false)} onSaved={reload} />}
      <SettleDialog target={settle} onClose={() => setSettle(null)} onDone={reload} />
      <TransactionDialog open={txOpen} onClose={() => setTxOpen(false)} onSaved={reload} defaults={{ fair_edition_id: id, kind: "expense" }} />
      <ConfirmDialog
        open={confirmCancel}
        title="Cancelar participação?"
        message="A participação ficará como cancelada e a taxa prevista será cancelada nas contas a pagar. Pagamentos já realizados não são apagados."
        confirmLabel="Cancelar participação"
        onClose={() => setConfirmCancel(false)}
        onConfirm={async () => {
          await setStatus("canceled");
          setConfirmCancel(false);
        }}
      />
    </div>
  );
}

function EditEditionDialog({ ed, onClose, onSaved }: { ed: Record<string, any>; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: ed.name ?? "",
    location_name: ed.location_name ?? "",
    address: ed.address ?? "",
    map_url: ed.map_url ?? "",
    stall_label: ed.stall_label ?? "",
    fee_mode: ed.fee_mode,
    fee_cents: ed.fee_cents as number | null,
    fee_due_date: ed.fee_due_date ?? "",
    notes: ed.notes ?? "",
    organizer_name: ed.fairs?.organizer_name ?? "",
    organizer_phone: ed.fairs?.organizer_phone ?? "",
    organizer_whatsapp: ed.fairs?.organizer_whatsapp ?? "",
    organizer_email: ed.fairs?.organizer_email ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true);
    const s = getSupabase();
    const { error } = await s
      .from("fair_editions")
      .update({
        name: f.name,
        location_name: f.location_name || null,
        address: f.address || null,
        map_url: f.map_url || null,
        stall_label: f.stall_label || null,
        fee_mode: f.fee_mode,
        fee_cents: f.fee_cents ?? 0,
        fee_due_date: f.fee_due_date || null,
        notes: f.notes || null,
      })
      .eq("id", ed.id);
    const { error: e2 } = await s
      .from("fairs")
      .update({
        organizer_name: f.organizer_name || null,
        organizer_phone: f.organizer_phone || null,
        organizer_whatsapp: f.organizer_whatsapp || null,
        organizer_email: f.organizer_email || null,
      })
      .eq("id", ed.fair_id);
    setBusy(false);
    if (error || e2) return toast.error(friendlyError(error || e2));
    toast.success("Dados atualizados.");
    onSaved();
    onClose();
  };
  return (
    <ModalShell title="Editar participação" onClose={onClose} onSave={save} busy={busy}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome da edição">
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Barraca">
          <Input value={f.stall_label} onChange={(e) => set("stall_label", e.target.value)} />
        </Field>
        <Field label="Local">
          <Input value={f.location_name} onChange={(e) => set("location_name", e.target.value)} />
        </Field>
        <Field label="Endereço">
          <Input value={f.address} onChange={(e) => set("address", e.target.value)} />
        </Field>
        <Field label="Link do mapa" className="sm:col-span-2">
          <Input type="url" value={f.map_url} onChange={(e) => set("map_url", e.target.value)} />
        </Field>
        <Field label="Forma de cobrança">
          <Select value={f.fee_mode} onChange={(e) => set("fee_mode", e.target.value)}>
            <option value="per_day">Por dia</option>
            <option value="per_event">Valor único por evento</option>
          </Select>
        </Field>
        <Field label="Valor da taxa">
          <MoneyInput value={f.fee_cents} onChange={(v) => set("fee_cents", v)} />
        </Field>
        <Field label="Vencimento da taxa">
          <Input type="date" value={f.fee_due_date} onChange={(e) => set("fee_due_date", e.target.value)} />
        </Field>
        <div />
        <Field label="Organizador">
          <Input value={f.organizer_name} onChange={(e) => set("organizer_name", e.target.value)} />
        </Field>
        <Field label="Telefone do organizador">
          <Input value={f.organizer_phone} onChange={(e) => set("organizer_phone", e.target.value)} />
        </Field>
        <Field label="WhatsApp do organizador">
          <Input value={f.organizer_whatsapp} onChange={(e) => set("organizer_whatsapp", e.target.value)} />
        </Field>
        <Field label="E-mail do organizador">
          <Input value={f.organizer_email} onChange={(e) => set("organizer_email", e.target.value)} />
        </Field>
        <Field label="Observações" className="sm:col-span-2">
          <Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
      <p className="mt-2 text-xs text-muted">Alterar a taxa atualiza o valor previsto em contas a pagar (se ainda não foi paga). O histórico de vendas não muda.</p>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, onSave, busy, children }: { title: string; onClose: () => void; onSave: () => void; busy: boolean; children: React.ReactNode }) {
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onSave} loading={busy}>
            Salvar
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

/** Dados oficiais compartilhados pelo organizador (somente com vínculo ativo). */
function OfficialData({ linkId, onApplied }: { linkId: string; onApplied: () => void }) {
  const toast = useToast();
  const [view, setView] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [applyFee, setApplyFee] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = () =>
    getSupabase()
      .rpc("vendor_link_view", { p_link: linkId })
      .then(({ data, error }) => {
        if (error) setErr(friendlyError(error));
        else setView(data);
      });
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkId]);

  if (err) return <InfoBox tone="warning" title="Vínculo encerrado">{err} Os dados que você já tinha na agenda foram mantidos.</InfoBox>;
  if (!view) return null;
  const unread = (view.notices as any[]).filter((n) => !n.acknowledged_at);
  const p = view.participation;
  return (
    <Card title={`Dados oficiais do organizador: ${view.event.organizer_name}`}>
      {unread.length > 0 && (
        <InfoBox tone="warning" title={`${unread.length} alteração(ões) feitas pelo organizador`}>
          <ul className="list-disc pl-5">
            {unread.map((n: any) => (
              <li key={n.id}>
                <Bell className="mr-1 inline h-3 w-3" />
                {n.summary} <span className="text-xs">({formatDateTime(n.created_at)})</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Checkbox label="Atualizar também a taxa na minha agenda" checked={applyFee} onChange={setApplyFee} hint="Só marque se concordar com o novo valor." />
            <Button
              size="sm"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                const { error } = await getSupabase().rpc("vendor_apply_official", { p_link: linkId, p_apply_fee: applyFee });
                setBusy(false);
                if (error) return toast.error(friendlyError(error));
                toast.success("Agenda atualizada com os dados oficiais.");
                load();
                onApplied();
              }}
            >
              Atualizar minha agenda
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                await getSupabase().rpc("ack_notices", { p_link: linkId });
                load();
              }}
            >
              Marcar como lidas
            </Button>
          </div>
        </InfoBox>
      )}
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="font-semibold text-muted">Evento</dt>
          <dd>{view.event.name}</dd>
          <dd className="text-muted">{[view.event.location_name, view.event.address].filter(Boolean).join(" · ")}</dd>
        </div>
        <div>
          <dt className="font-semibold text-muted">Taxa combinada</dt>
          <dd>
            {formatBRL(p?.total_cents)} ({FEE_MODE[p?.fee_mode]}) — pago: {formatBRL(p?.paid_cents)}
          </dd>
          <dd className="text-muted">Vencimento: {formatDate(p?.due_date)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-muted">Barraca por dia</dt>
          {(view.days as any[])
            .filter((d) => d.participating)
            .map((d) => (
              <dd key={d.id}>
                {formatDate(d.day)}: <b>{d.stall ?? "a definir"}</b>
              </dd>
            ))}
        </div>
        {view.event.arrival_instructions && (
          <div className="sm:col-span-3">
            <dt className="font-semibold text-muted">Orientações</dt>
            <dd className="whitespace-pre-wrap">{view.event.arrival_instructions}</dd>
          </div>
        )}
        {view.event.rules && (
          <div className="sm:col-span-3">
            <dt className="font-semibold text-muted">Regras</dt>
            <dd className="whitespace-pre-wrap">{view.event.rules}</dd>
          </div>
        )}
      </dl>
    </Card>
  );
}
