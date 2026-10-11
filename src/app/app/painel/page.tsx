"use client";

import { CalendarDays, HelpCircle, Inbox, ShoppingBasket, Store, Tent, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useActiveCompany } from "@/components/app/company-context";
import { PeriodFilter, usePeriod } from "@/components/shared/filters";
import { Badge, Card, EmptyState, Field, InfoBox, LinkButton, PageHeader, Select, Spinner, Stat, Table, Td, Th } from "@/components/ui/ui";
import { formatDate, formatDateShort, rangeLabel } from "@/lib/dates";
import { EDITION_STATUS, EVENT_STATUS, STATUS_TONE } from "@/lib/labels";
import { formatBRL, formatPercent } from "@/lib/money";
import { getSupabase } from "@/lib/supabase/client";
import { must, useData } from "@/lib/use-data";

export default function DashboardPage() {
  const { company, canFinance } = useActiveCompany();
  if (!canFinance) return <InfoBox tone="warning">O painel de indicadores está disponível para quem tem acesso financeiro.</InfoBox>;
  return company.kind === "vendor" ? <VendorDashboard key={company.id} /> : <OrganizerDashboard key={company.id} />;
}

function Bars({ items, valueKey, labelKey, format = formatBRL }: { items: any[]; valueKey: string; labelKey: string; format?: (v: number) => string }) {
  const max = Math.max(1, ...items.map((i) => Math.abs(Number(i[valueKey]))));
  return (
    <ul className="space-y-2">
      {items.map((i, k) => (
        <li key={k}>
          <div className="flex justify-between gap-2 text-sm">
            <span className="truncate">{i[labelKey]}</span>
            <span className="font-semibold tabular-nums">{format(Number(i[valueKey]))}</span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-brand-50">
            <div className="h-2.5 rounded-full bg-brand-500" style={{ width: `${(Math.abs(Number(i[valueKey])) / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function VendorDashboard() {
  const { company } = useActiveCompany();
  const period = usePeriod(company.timezone);
  const [edition, setEdition] = useState("");
  const [help, setHelp] = useState(false);
  const { data: eds } = useData(async () => must(await getSupabase().rpc("pos_editions", { p_company: company.id })) as any[], [company.id]);
  const { data: d, loading, error } = useData(
    async () =>
      must(await getSupabase().rpc("vendor_dashboard", { p_company: company.id, p_from: period.range.from, p_to: period.range.to, p_edition: edition || null })) as any,
    [company.id, period.range.from, period.range.to, edition],
  );

  const profit = d ? Number(d.revenue_cents) + Number(d.other_income_cents) - Number(d.cogs_cents) - Number(d.operating_expenses_cents) : 0;

  return (
    <div>
      <PageHeader
        title="Painel"
        description={`Período de ${formatDate(period.range.from)} a ${formatDate(period.range.to)}`}
        actions={
          <LinkButton href="/app/vendas" icon={<ShoppingBasket className="h-5 w-5" />}>
            Vender agora
          </LinkButton>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <PeriodFilter period={period} />
        <Field label="Feira" className="min-w-56">
          <Select value={edition} onChange={(e) => setEdition(e.target.value)}>
            <option value="">Todas (negócio inteiro)</option>
            {(eds ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.fair_name} · {rangeLabel(e.first_day, e.last_day)}
              </option>
            ))}
          </Select>
        </Field>
        <button onClick={() => setHelp((h) => !h)} className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline" aria-expanded={help}>
          <HelpCircle className="h-4 w-4" /> Como os números são calculados?
        </button>
      </div>
      {help && (
        <InfoBox title="Entenda os indicadores">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b>Faturamento</b>: soma das vendas concluídas no período (já com descontos), recebidas ou não.
            </li>
            <li>
              <b>Custo dos produtos vendidos (CMV)</b>: custo de cada produto guardado no momento da venda × quantidade.
            </li>
            <li>
              <b>Despesas</b>: taxas de feiras, combustível, MEI/DAS, taxas de cartão etc. (previstas e pagas). <b>Compras de estoque</b> não entram aqui — elas
              viram CMV quando o produto é vendido, para não descontar o mesmo custo duas vezes.
            </li>
            <li>
              <b>Lucro estimado</b> = faturamento + outras receitas − CMV − despesas.
            </li>
            <li>
              <b>Saldo disponível</b>: dinheiro que está de fato nas contas hoje. Vendas no cartão só entram no saldo quando recebidas.
            </li>
          </ul>
        </InfoBox>
      )}
      {loading && !d && <Spinner />}
      {error && <InfoBox tone="danger">{error}</InfoBox>}
      {d && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Faturamento" value={formatBRL(d.revenue_cents)} hint={`${d.sales_count} venda(s) · ticket médio ${formatBRL(d.sales_count ? Math.round(d.revenue_cents / d.sales_count) : 0)}`} icon={<TrendingUp className="h-5 w-5" />} tone="brand" />
            <Stat label="Lucro estimado" value={formatBRL(profit)} hint="Faturamento − custos dos produtos − despesas" tone={profit >= 0 ? "good" : "bad"} />
            <Stat label="Saldo disponível" value={formatBRL(d.balance_total_cents)} hint="Dinheiro nas contas hoje" icon={<Wallet className="h-5 w-5" />} />
            <Stat label="Despesas e taxas" value={formatBRL(d.operating_expenses_cents)} hint={`Taxas de feiras ${formatBRL(d.fair_fees_cents)} · cartão ${formatBRL(d.payment_fees_cents)}`} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Custo dos produtos vendidos" value={formatBRL(d.cogs_cents)} />
            <Stat label="Compras de estoque" value={formatBRL(d.stock_purchases_cents)} hint="Saída de caixa, não é despesa do resultado" />
            <Stat
              label="A receber"
              value={formatBRL(d.receivables.open_cents)}
              hint={Number(d.receivables.overdue_cents) > 0 ? `${formatBRL(d.receivables.overdue_cents)} em atraso` : `${formatBRL(d.receivables.next7_cents)} nos próximos 7 dias`}
            />
            <Stat
              label="A pagar"
              value={formatBRL(d.payables.open_cents)}
              tone={Number(d.payables.overdue_cents) > 0 ? "bad" : "neutral"}
              hint={Number(d.payables.overdue_cents) > 0 ? `${formatBRL(d.payables.overdue_cents)} vencido` : `${formatBRL(d.payables.next7_cents)} nos próximos 7 dias`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Próximas feiras" className="lg:col-span-1">
              {d.upcoming.length === 0 ? (
                <EmptyState icon={<CalendarDays className="h-8 w-8" />} title="Sem feiras agendadas" action={<LinkButton href="/app/agenda" size="sm">Abrir agenda</LinkButton>} />
              ) : (
                <ul className="space-y-2">
                  {d.upcoming.map((u: any) => (
                    <li key={u.id}>
                      <Link href={`/app/agenda/${u.id}`} className="block rounded-xl border border-line p-3 hover:bg-brand-50">
                        <div className="flex justify-between gap-2">
                          <span className="font-bold">{u.fair_name}</span>
                          <Badge tone={STATUS_TONE[u.status]}>{EDITION_STATUS[u.status]}</Badge>
                        </div>
                        <p className="text-sm text-muted">
                          {rangeLabel(u.first_day, u.last_day)}
                          {u.stall_label && ` · barraca ${u.stall_label}`}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Produtos mais vendidos" className="lg:col-span-1">
              {d.top_products.length === 0 ? <p className="text-sm text-muted">Sem vendas no período.</p> : <Bars items={d.top_products} valueKey="revenue_cents" labelKey="name" />}
            </Card>
            <Card title="Saldo por conta" className="lg:col-span-1">
              <ul className="divide-y divide-line">
                {d.balances.map((b: any) => (
                  <li key={b.id} className="flex justify-between py-2 text-sm">
                    <span>{b.name}</span>
                    <span className={`font-bold tabular-nums ${b.balance_cents < 0 ? "text-red-700" : ""}`}>{formatBRL(b.balance_cents)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card title="Vendas por dia">
            {d.daily.length === 0 ? (
              <p className="text-sm text-muted">Sem vendas no período.</p>
            ) : (
              <div className="flex h-40 items-end gap-1 overflow-x-auto" role="img" aria-label="Gráfico de faturamento diário">
                {(() => {
                  const max = Math.max(1, ...d.daily.map((x: any) => Number(x.revenue_cents)));
                  return d.daily.map((x: any) => (
                    <div key={x.day} className="flex min-w-8 flex-1 flex-col items-center justify-end gap-1" title={`${formatDate(x.day)}: ${formatBRL(x.revenue_cents)}`}>
                      <div className="w-full rounded-t bg-brand-400" style={{ height: `${(Number(x.revenue_cents) / max) * 120}px` }} />
                      <span className="text-[10px] text-muted">{formatDateShort(x.day)}</span>
                    </div>
                  ));
                })()}
              </div>
            )}
          </Card>

          <Card title="Comparação entre feiras">
            {d.by_edition.length === 0 ? (
              <p className="text-sm text-muted">Associe as vendas e despesas às feiras para comparar o desempenho.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Feira</Th>
                    <Th className="text-right">Vendas</Th>
                    <Th className="text-right">Custo produtos</Th>
                    <Th className="text-right">Despesas e taxas</Th>
                    <Th className="text-right">Resultado</Th>
                  </tr>
                </thead>
                <tbody>
                  {d.by_edition.map((e: any) => {
                    const r = Number(e.revenue_cents) + Number(e.other_income_cents) - Number(e.cogs_cents) - Number(e.expenses_cents);
                    return (
                      <tr key={e.id}>
                        <Td>
                          <Link href={`/app/agenda/${e.id}`} className="font-semibold hover:underline">
                            {e.label}
                          </Link>
                          <span className="block text-xs text-muted">{formatDate(e.first_day)} · {e.sales_count} venda(s)</span>
                        </Td>
                        <Td className="text-right tabular-nums">{formatBRL(e.revenue_cents)}</Td>
                        <Td className="text-right tabular-nums">{formatBRL(e.cogs_cents)}</Td>
                        <Td className="text-right tabular-nums">{formatBRL(e.expenses_cents)}</Td>
                        <Td className={`text-right font-bold tabular-nums ${r < 0 ? "text-red-700" : "text-leaf-600"}`}>{formatBRL(r)}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>

          {d.expenses_by_category.length > 0 && (
            <Card title="Despesas por categoria">
              <Bars items={d.expenses_by_category.map((x: any) => ({ ...x, name: x.stock ? `${x.name} (estoque)` : x.name }))} valueKey="amount_cents" labelKey="name" />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function OrganizerDashboard() {
  const { company } = useActiveCompany();
  const period = usePeriod(company.timezone, "this_year");
  const [event, setEvent] = useState("");
  const [help, setHelp] = useState(false);
  const { data: events } = useData(async () => must(await getSupabase().from("events").select("id,name").eq("company_id", company.id).order("created_at", { ascending: false })) as any[], [company.id]);
  const { data: d, loading, error } = useData(
    async () =>
      must(await getSupabase().rpc("organizer_dashboard", { p_company: company.id, p_from: period.range.from, p_to: period.range.to, p_event: event || null })) as any,
    [company.id, period.range.from, period.range.to, event],
  );
  const t = d?.totals;
  const occ = t && Number(t.slots) > 0 ? ((Number(t.confirmed_slots) + Number(t.reserved_slots)) / Number(t.slots)) * 100 : 0;

  return (
    <div>
      <PageHeader
        title="Painel"
        description={`Eventos com datas entre ${formatDate(period.range.from)} e ${formatDate(period.range.to)}`}
        actions={
          <LinkButton href="/app/eventos" icon={<Tent className="h-5 w-5" />}>
            Eventos
          </LinkButton>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <PeriodFilter period={period} />
        <Field label="Evento" className="min-w-56">
          <Select value={event} onChange={(e) => setEvent(e.target.value)}>
            <option value="">Todos</option>
            {(events ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </Field>
        <button onClick={() => setHelp((h) => !h)} className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
          <HelpCircle className="h-4 w-4" /> Como os números são calculados?
        </button>
      </div>
      {help && (
        <InfoBox title="Entenda os indicadores">
          <ul className="list-disc space-y-1 pl-5">
            <li><b>Vagas</b> = barracas × dias do evento. Ocupação = vagas reservadas ou confirmadas ÷ vagas.</li>
            <li><b>Reservada</b>: participante inscrito com barraca; <b>confirmada</b>: participante confirmado com barraca.</li>
            <li><b>Taxas previstas</b>: total combinado com participantes não cancelados (por dia × dias, ou valor único, menos descontos).</li>
            <li><b>Em atraso</b>: saldo de taxas com vencimento já passado.</li>
            <li><b>Resultado previsto</b> = taxas previstas + outras receitas − custos do evento. <b>Realizado</b> = taxas recebidas + receitas recebidas − custos pagos.</li>
          </ul>
        </InfoBox>
      )}
      {loading && !d && <Spinner />}
      {error && <InfoBox tone="danger">{error}</InfoBox>}
      {d && (
        <div className="space-y-4">
          {d.pending_requests > 0 && (
            <InfoBox tone="warning">
              <Inbox className="mr-1 inline h-4 w-4" />
              Você tem <b>{d.pending_requests}</b> solicitação(ões) de participação aguardando resposta.{" "}
              <Link href="/app/solicitacoes" className="font-bold underline">
                Ver solicitações
              </Link>
            </InfoBox>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Ocupação" value={formatPercent(occ)} hint={`${t.confirmed_slots} confirmadas · ${t.reserved_slots} reservadas · ${t.available_slots} livres`} tone="brand" icon={<Store className="h-5 w-5" />} />
            <Stat label="Participantes confirmados" value={t.participants_confirmed} />
            <Stat label="Taxas previstas" value={formatBRL(t.fees_expected_cents)} hint={`Recebidas ${formatBRL(t.fees_received_cents)}`} />
            <Stat label="Taxas em atraso" value={formatBRL(t.fees_overdue_cents)} tone={Number(t.fees_overdue_cents) > 0 ? "bad" : "neutral"} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Custos previstos" value={formatBRL(t.costs_total_cents)} hint={`Pagos ${formatBRL(t.costs_paid_cents)}`} />
            <Stat label="Resultado previsto" value={formatBRL(t.result_planned_cents)} tone={Number(t.result_planned_cents) >= 0 ? "good" : "bad"} />
            <Stat label="Resultado realizado" value={formatBRL(t.result_realized_cents)} tone={Number(t.result_realized_cents) >= 0 ? "good" : "bad"} />
            <Stat label="Saldo disponível" value={formatBRL(d.balance_total_cents)} icon={<Wallet className="h-5 w-5" />} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Próximos eventos">
              {d.upcoming.length === 0 ? (
                <p className="text-sm text-muted">Nenhum evento futuro.</p>
              ) : (
                <ul className="space-y-2">
                  {d.upcoming.map((u: any) => (
                    <li key={u.id}>
                      <Link href={`/app/eventos/${u.id}`} className="block rounded-xl border border-line p-3 hover:bg-brand-50">
                        <div className="flex justify-between gap-2">
                          <span className="font-bold">{u.name}</span>
                          <Badge tone={STATUS_TONE[u.status]}>{EVENT_STATUS[u.status]}</Badge>
                        </div>
                        <p className="text-sm text-muted">{rangeLabel(u.first_day, u.last_day)}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Resultado por evento" className="lg:col-span-2">
              {d.events.length === 0 ? (
                <p className="text-sm text-muted">Nenhum evento no período.</p>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Evento</Th>
                      <Th className="text-right">Ocupação</Th>
                      <Th className="text-right">Taxas (prev./receb.)</Th>
                      <Th className="text-right">Custos</Th>
                      <Th className="text-right">Resultado prev./real.</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.events.map((e: any) => (
                      <tr key={e.id}>
                        <Td>
                          <Link href={`/app/eventos/${e.id}`} className="font-semibold hover:underline">
                            {e.name}
                          </Link>
                          <span className="block text-xs text-muted">
                            {rangeLabel(e.first_day, e.last_day)} · {e.available_slots} vaga(s) livre(s)
                            {e.days_without_stall > 0 && ` · ${e.days_without_stall} dia(s) sem barraca atribuída`}
                          </span>
                        </Td>
                        <Td className="text-right tabular-nums">{formatPercent(Number(e.occupancy_pct))}</Td>
                        <Td className="text-right tabular-nums">
                          {formatBRL(e.fees_expected_cents)}
                          <span className="block text-xs text-muted">{formatBRL(e.fees_received_cents)}</span>
                        </Td>
                        <Td className="text-right tabular-nums">{formatBRL(e.costs_total_cents)}</Td>
                        <Td className="text-right tabular-nums">
                          <span className={Number(e.result_planned_cents) < 0 ? "text-red-700" : "text-leaf-600"}>{formatBRL(e.result_planned_cents)}</span>
                          <span className="block text-xs">{formatBRL(e.result_realized_cents)}</span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
