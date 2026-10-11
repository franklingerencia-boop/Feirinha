"use client";

import { useActiveCompany } from "@/components/app/company-context";
import { Button, Card, InfoBox, Table, Td, Th } from "@/components/ui/ui";
import { formatDate, todayISO, weekday } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import type { EventBundle } from "./types";

/** Vagas e pendências para concluir a organização do evento. */
export function PendingTab({ b, goTo }: { b: EventBundle; goTo: (tab: string) => void }) {
  const { company } = useActiveCompany();
  const today = todayISO(company.timezone);
  const active = b.participants.filter((p) => p.status !== "canceled");
  const perDay = b.days.map((d) => {
    const used = b.assignments.filter((a) => a.event_day_id === d.id).length;
    const enrolled = b.pdays.filter((x) => x.event_day_id === d.id && active.some((p) => p.id === x.participant_id));
    const withoutStall = enrolled.filter((x) => !b.assignments.some((a) => a.participant_id === x.participant_id && a.event_day_id === d.id));
    return { d, free: b.stalls.length - used, enrolled: enrolled.length, withoutStall: withoutStall.map((x) => active.find((p) => p.id === x.participant_id)!.trade_name) };
  });
  const notConfirmed = active.filter((p) => p.status === "registered");
  const overdue = active.filter((p) => Number(p.total_cents) > Number(p.paid_cents) && p.due_date && p.due_date < today);
  const noDays = active.filter((p) => p.days_count === 0);
  const issues = perDay.reduce((a, x) => a + x.withoutStall.length, 0) + notConfirmed.length + overdue.length + noDays.length + (b.event.status === "draft" ? 1 : 0) + (b.stalls.length === 0 ? 1 : 0);

  return (
    <div className="space-y-4">
      {issues === 0 ? <InfoBox tone="success">Tudo certo! Nenhuma pendência encontrada para este evento.</InfoBox> : <InfoBox tone="warning">{issues} pendência(s) para concluir a organização.</InfoBox>}
      {b.event.status === "draft" && (
        <InfoBox tone="warning">
          O evento ainda está como <b>rascunho</b>. Mude a situação para “Inscrições abertas” ou “Confirmado” na aba Dados.{" "}
          <Button size="sm" variant="secondary" onClick={() => goTo("dados")}>
            Ir para Dados
          </Button>
        </InfoBox>
      )}
      <Card title="Vagas por dia">
        <Table>
          <thead>
            <tr>
              <Th>Dia</Th>
              <Th className="text-right">Barracas livres</Th>
              <Th className="text-right">Inscritos</Th>
              <Th>Inscritos sem barraca</Th>
            </tr>
          </thead>
          <tbody>
            {perDay.map((x) => (
              <tr key={x.d.id}>
                <Td className="font-semibold">
                  {weekday(x.d.day)}, {formatDate(x.d.day)}
                </Td>
                <Td className="text-right">{x.free}</Td>
                <Td className="text-right">{x.enrolled}</Td>
                <Td className={x.withoutStall.length ? "text-amber-800" : "text-muted"}>{x.withoutStall.length ? x.withoutStall.join(", ") : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {perDay.some((x) => x.withoutStall.length) && (
          <Button size="sm" className="mt-3" onClick={() => goTo("mapa")}>
            Atribuir barracas no mapa
          </Button>
        )}
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title={`Inscrições a confirmar (${notConfirmed.length})`}>
          {notConfirmed.length === 0 ? <p className="text-sm text-muted">Nenhuma.</p> : <ul className="list-disc pl-5 text-sm">{notConfirmed.map((p) => <li key={p.id}>{p.trade_name}</li>)}</ul>}
        </Card>
        <Card title={`Pagamentos em atraso (${overdue.length})`}>
          {overdue.length === 0 ? (
            <p className="text-sm text-muted">Nenhum.</p>
          ) : (
            <ul className="text-sm">
              {overdue.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>{p.trade_name}</span>
                  <span className="font-semibold text-red-700">{formatBRL(Number(p.total_cents) - Number(p.paid_cents))}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
