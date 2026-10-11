-- =====================================================================
-- SR - Feirinhas | 0002 - Financeiro compartilhado (feirante e organizador)
-- Valores monetários sempre em centavos (bigint).
-- =====================================================================

create type public.account_kind as enum ('bank', 'wallet', 'cash', 'other');
create type public.tx_kind as enum ('income', 'expense');
create type public.tx_status as enum ('planned', 'settled', 'canceled');
create type public.settlement_kind as enum ('immediate', 'future');

-- Categorias padrão (modelo gerenciado pelo administrador da plataforma)
create table public.default_categories (
  id uuid primary key default gen_random_uuid(),
  company_kind public.company_kind not null,
  kind public.tx_kind not null,
  name text not null,
  system_code text,
  is_stock_purchase boolean not null default false,
  sort int not null default 100,
  active boolean not null default true,
  unique (company_kind, kind, name)
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  kind public.account_kind not null default 'bank',
  bank_name text,
  initial_balance_cents bigint not null default 0,
  initial_balance_date date,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (company_id, id)
);
create index accounts_company_idx on public.accounts (company_id);

create table public.fin_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind public.tx_kind not null,
  name text not null,
  system_code text,
  is_stock_purchase boolean not null default false,
  archived boolean not null default false,
  sort int not null default 100,
  created_at timestamptz not null default now(),
  unique (company_id, kind, name)
);
create index fin_categories_company_idx on public.fin_categories (company_id);

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  system_code text,
  settlement public.settlement_kind not null default 'immediate',
  settle_days int not null default 0 check (settle_days between 0 and 365),
  fee_percent numeric(6, 3) not null default 0 check (fee_percent >= 0 and fee_percent < 100),
  default_account_id uuid references public.accounts (id) on delete set null,
  archived boolean not null default false,
  sort int not null default 100,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);
create index payment_methods_company_idx on public.payment_methods (company_id);

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind public.tx_kind not null default 'expense',
  description text not null,
  amount_cents bigint not null check (amount_cents > 0),
  category_id uuid references public.fin_categories (id) on delete set null,
  account_id uuid references public.accounts (id) on delete set null,
  day_of_month int not null check (day_of_month between 1 and 28),
  start_date date not null,
  end_date date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index recurring_rules_company_idx on public.recurring_rules (company_id);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind public.tx_kind not null,
  status public.tx_status not null default 'planned',
  description text not null,
  amount_cents bigint not null check (amount_cents > 0),
  category_id uuid references public.fin_categories (id) on delete set null,
  account_id uuid references public.accounts (id) on delete restrict,
  due_date date not null,
  paid_date date,
  competence_date date not null,
  fair_edition_id uuid,
  event_id uuid,
  source_type text not null default 'manual',
  source_id uuid,
  is_stock_purchase boolean not null default false,
  recurring_rule_id uuid references public.recurring_rules (id) on delete set null,
  idempotency_key text,
  notes text,
  canceled_at timestamptz,
  canceled_by uuid,
  cancel_reason text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'settled' or (paid_date is not null and account_id is not null)),
  check (status <> 'canceled' or canceled_at is not null)
);
create index transactions_company_idx on public.transactions (company_id, competence_date);
create index transactions_due_idx on public.transactions (company_id, status, due_date);
create index transactions_account_idx on public.transactions (account_id);
create unique index transactions_idem_uidx on public.transactions (company_id, idempotency_key)
  where idempotency_key is not null;
-- Garante um único lançamento por origem automática (ex.: uma venda gera um único lançamento)
create unique index transactions_source_uidx on public.transactions (source_type, source_id)
  where source_id is not null;
create unique index transactions_recurring_uidx on public.transactions (recurring_rule_id, due_date)
  where recurring_rule_id is not null;

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  from_account_id uuid not null references public.accounts (id) on delete restrict,
  to_account_id uuid not null references public.accounts (id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  transfer_date date not null,
  description text,
  idempotency_key text,
  canceled_at timestamptz,
  cancel_reason text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (from_account_id <> to_account_id)
);
create index transfers_company_idx on public.transfers (company_id);
create unique index transfers_idem_uidx on public.transfers (company_id, idempotency_key)
  where idempotency_key is not null;

-- ---------------------------------------------------------------------
-- Integridade entre empresas: referências precisam pertencer à mesma empresa
-- ---------------------------------------------------------------------
create or replace function public.assert_same_company(p_table text, p_id uuid, p_company uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_company uuid;
begin
  if p_id is null then return; end if;
  execute format('select company_id from public.%I where id = $1', p_table) into v_company using p_id;
  if v_company is null or v_company <> p_company then
    raise exception 'Registro relacionado (%) não pertence a esta empresa.', p_table using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.assert_same_company(text, uuid, uuid) from public, anon, authenticated;

create or replace function public.tg_transactions_before()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_cat public.fin_categories;
begin
  perform public.assert_same_company('accounts', new.account_id, new.company_id);
  perform public.assert_same_company('fin_categories', new.category_id, new.company_id);
  if new.competence_date is null then new.competence_date := new.due_date; end if;

  if tg_op = 'INSERT' then
    if new.category_id is not null then
      select * into v_cat from public.fin_categories where id = new.category_id;
      if v_cat.kind <> new.kind then
        raise exception 'A categoria não corresponde ao tipo do lançamento.' using errcode = 'P0001';
      end if;
      new.is_stock_purchase := v_cat.is_stock_purchase and new.kind = 'expense';
    end if;
    if new.status = 'canceled' then
      raise exception 'Não é possível criar um lançamento já cancelado.' using errcode = 'P0001';
    end if;
    if new.source_type <> 'manual' and current_setting('app.system_write', true) is distinct from 'on' then
      raise exception 'Lançamentos automáticos são criados apenas pelo sistema.' using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  if old.status = 'canceled' then
    raise exception 'Lançamento cancelado não pode ser alterado.' using errcode = 'P0001';
  end if;
  if new.company_id <> old.company_id or new.kind <> old.kind
     or new.source_type <> old.source_type or new.source_id is distinct from old.source_id then
    raise exception 'Campos de origem do lançamento não podem ser alterados.' using errcode = '42501';
  end if;
  -- Lançamentos gerados por vendas/pagamentos só mudam pelo sistema (exceto baixa de recebimento)
  if old.source_type in ('sale', 'sale_fee', 'charge_payment')
     and current_setting('app.system_write', true) is distinct from 'on'
     and (new.amount_cents <> old.amount_cents or new.status = 'canceled'
          or new.competence_date <> old.competence_date) then
    raise exception 'Este lançamento é controlado pela origem (venda/pagamento). Cancele pela origem.' using errcode = '42501';
  end if;
  if new.category_id is distinct from old.category_id and new.category_id is not null then
    select * into v_cat from public.fin_categories where id = new.category_id;
    if v_cat.kind <> new.kind then
      raise exception 'A categoria não corresponde ao tipo do lançamento.' using errcode = 'P0001';
    end if;
    new.is_stock_purchase := v_cat.is_stock_purchase and new.kind = 'expense';
  end if;
  if new.status = 'canceled' and old.status <> 'canceled' then
    new.canceled_at := coalesce(new.canceled_at, now());
    new.canceled_by := auth.uid();
  end if;
  if new.status = 'planned' then new.paid_date := null; end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger transactions_before before insert or update on public.transactions
  for each row execute function public.tg_transactions_before();
create trigger transactions_audit after insert or update on public.transactions
  for each row execute function public.tg_audit();

create or replace function public.tg_transfers_before()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_same_company('accounts', new.from_account_id, new.company_id);
  perform public.assert_same_company('accounts', new.to_account_id, new.company_id);
  if tg_op = 'UPDATE' then
    if old.canceled_at is not null then
      raise exception 'Transferência cancelada não pode ser alterada.' using errcode = 'P0001';
    end if;
    if new.amount_cents <> old.amount_cents or new.from_account_id <> old.from_account_id
       or new.to_account_id <> old.to_account_id or new.company_id <> old.company_id then
      raise exception 'Para corrigir uma transferência, cancele-a e registre outra.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
create trigger transfers_before before insert or update on public.transfers
  for each row execute function public.tg_transfers_before();
create trigger transfers_audit after insert or update on public.transfers
  for each row execute function public.tg_audit();

create or replace function public.tg_payment_methods_before()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_same_company('accounts', new.default_account_id, new.company_id);
  return new;
end;
$$;
create trigger payment_methods_before before insert or update on public.payment_methods
  for each row execute function public.tg_payment_methods_before();

create or replace function public.tg_recurring_before()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_same_company('accounts', new.account_id, new.company_id);
  perform public.assert_same_company('fin_categories', new.category_id, new.company_id);
  return new;
end;
$$;
create trigger recurring_before before insert or update on public.recurring_rules
  for each row execute function public.tg_recurring_before();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.default_categories enable row level security;
alter table public.accounts enable row level security;
alter table public.fin_categories enable row level security;
alter table public.payment_methods enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.transactions enable row level security;
alter table public.transfers enable row level security;

create policy default_categories_read on public.default_categories for select to authenticated using (true);

-- Contas, categorias, recorrências, lançamentos e transferências: acesso financeiro
create policy accounts_all on public.accounts for all to authenticated
  using (public.can_finance(company_id)) with check (public.can_finance(company_id));
create policy fin_categories_select on public.fin_categories for select to authenticated
  using (public.can_finance(company_id));
create policy fin_categories_write on public.fin_categories for insert to authenticated
  with check (public.can_finance(company_id));
create policy fin_categories_update on public.fin_categories for update to authenticated
  using (public.can_finance(company_id)) with check (public.can_finance(company_id));
create policy recurring_all on public.recurring_rules for all to authenticated
  using (public.can_finance(company_id)) with check (public.can_finance(company_id));
create policy transactions_select on public.transactions for select to authenticated
  using (public.can_finance(company_id));
create policy transactions_insert on public.transactions for insert to authenticated
  with check (public.can_finance(company_id));
create policy transactions_update on public.transactions for update to authenticated
  using (public.can_finance(company_id)) with check (public.can_finance(company_id));
create policy transfers_select on public.transfers for select to authenticated
  using (public.can_finance(company_id));
create policy transfers_insert on public.transfers for insert to authenticated
  with check (public.can_finance(company_id));
create policy transfers_update on public.transfers for update to authenticated
  using (public.can_finance(company_id)) with check (public.can_finance(company_id));

-- Formas de pagamento: todos os membros leem (necessário na tela de vendas);
-- alteração somente com permissão de configurações
create policy payment_methods_select on public.payment_methods for select to authenticated
  using (public.is_member(company_id));
create policy payment_methods_insert on public.payment_methods for insert to authenticated
  with check (public.can_settings(company_id));
create policy payment_methods_update on public.payment_methods for update to authenticated
  using (public.can_settings(company_id)) with check (public.can_settings(company_id));

-- ---------------------------------------------------------------------
-- Funções
-- ---------------------------------------------------------------------

-- Contas disponíveis para receber pagamentos na tela de vendas (sem saldos)
create or replace function public.sale_accounts(p_company uuid)
returns table (id uuid, name text, kind public.account_kind)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_member(p_company) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return query select a.id, a.name, a.kind from public.accounts a
    where a.company_id = p_company and not a.archived order by a.name;
end;
$$;

-- Saldos por conta. Saldo = saldo inicial + receitas recebidas - despesas pagas
-- + transferências recebidas - transferências enviadas. Previstos à parte.
create or replace function public.account_balances(p_company uuid, p_until date default null)
returns table (
  id uuid, name text, kind public.account_kind, archived boolean,
  initial_cents bigint, balance_cents bigint, planned_in_cents bigint, planned_out_cents bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.can_finance(p_company) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return query
  select a.id, a.name, a.kind, a.archived, a.initial_balance_cents,
    (a.initial_balance_cents
      + coalesce((select sum(case when t.kind = 'income' then t.amount_cents else -t.amount_cents end)
                  from public.transactions t
                  where t.account_id = a.id and t.status = 'settled'
                    and (p_until is null or t.paid_date <= p_until)), 0)
      + coalesce((select sum(tr.amount_cents) from public.transfers tr
                  where tr.to_account_id = a.id and tr.canceled_at is null
                    and (p_until is null or tr.transfer_date <= p_until)), 0)
      - coalesce((select sum(tr.amount_cents) from public.transfers tr
                  where tr.from_account_id = a.id and tr.canceled_at is null
                    and (p_until is null or tr.transfer_date <= p_until)), 0)
    )::bigint,
    coalesce((select sum(t.amount_cents) from public.transactions t
              where t.account_id = a.id and t.status = 'planned' and t.kind = 'income'), 0)::bigint,
    coalesce((select sum(t.amount_cents) from public.transactions t
              where t.account_id = a.id and t.status = 'planned' and t.kind = 'expense'), 0)::bigint
  from public.accounts a
  where a.company_id = p_company
  order by a.archived, a.name;
end;
$$;

-- Gera lançamentos previstos de despesas/receitas recorrentes até a data informada (idempotente)
create or replace function public.generate_recurring(p_company uuid, p_until date)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  r public.recurring_rules;
  d date;
  v_count int := 0;
  v_limit date;
begin
  if not public.can_finance(p_company) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  v_limit := least(p_until, public.company_today(p_company) + 120);
  for r in select * from public.recurring_rules where company_id = p_company and active loop
    d := make_date(extract(year from r.start_date)::int, extract(month from r.start_date)::int, r.day_of_month);
    if d < r.start_date then d := (d + interval '1 month')::date; end if;
    while d <= v_limit and (r.end_date is null or d <= r.end_date) loop
      perform set_config('app.system_write', 'on', true);
      insert into public.transactions (company_id, kind, status, description, amount_cents, category_id,
        account_id, due_date, competence_date, source_type, recurring_rule_id)
      values (p_company, r.kind, 'planned', r.description, r.amount_cents, r.category_id,
        r.account_id, d, d, 'recurring', r.id)
      on conflict (recurring_rule_id, due_date) where recurring_rule_id is not null do nothing;
      if found then v_count := v_count + 1; end if;
      perform set_config('app.system_write', 'off', true);
      d := (d + interval '1 month')::date;
    end loop;
  end loop;
  return v_count;
end;
$$;

-- Atualiza o modelo de dados padrão da empresa (categorias, formas de pagamento, caixa)
create or replace function public.seed_company_defaults(p_company uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_kind public.company_kind;
  v_cash uuid;
begin
  select kind into v_kind from public.companies where id = p_company;

  insert into public.fin_categories (company_id, kind, name, system_code, is_stock_purchase, sort)
  select p_company, d.kind, d.name, d.system_code, d.is_stock_purchase, d.sort
  from public.default_categories d
  where d.company_kind = v_kind and d.active
  on conflict (company_id, kind, name) do nothing;

  insert into public.accounts (company_id, name, kind)
  values (p_company, 'Caixa (dinheiro)', 'cash')
  returning id into v_cash;

  insert into public.payment_methods (company_id, name, system_code, settlement, settle_days, default_account_id, sort)
  values
    (p_company, 'Dinheiro', 'cash', 'immediate', 0, v_cash, 1),
    (p_company, 'Pix', 'pix', 'immediate', 0, null, 2),
    (p_company, 'Débito', 'debit', 'future', 1, null, 3),
    (p_company, 'Crédito', 'credit', 'future', 30, null, 4)
  on conflict (company_id, name) do nothing;
end;
$$;
revoke execute on function public.seed_company_defaults(uuid) from public, anon, authenticated;

revoke execute on function public.sale_accounts(uuid) from public, anon;
revoke execute on function public.account_balances(uuid, date) from public, anon;
revoke execute on function public.generate_recurring(uuid, date) from public, anon;

-- Categorias padrão iniciais
insert into public.default_categories (company_kind, kind, name, system_code, is_stock_purchase, sort) values
  ('vendor', 'income', 'Vendas', 'sales', false, 1),
  ('vendor', 'income', 'Outras receitas', null, false, 90),
  ('vendor', 'expense', 'Taxas de feiras', 'fair_fee', false, 1),
  ('vendor', 'expense', 'Compra de mercadorias', 'stock', true, 2),
  ('vendor', 'expense', 'Ingredientes e insumos', null, true, 3),
  ('vendor', 'expense', 'Embalagens', null, true, 4),
  ('vendor', 'expense', 'Combustível', null, false, 5),
  ('vendor', 'expense', 'Transporte', null, false, 6),
  ('vendor', 'expense', 'Aluguel', null, false, 7),
  ('vendor', 'expense', 'MEI / DAS', 'mei_das', false, 8),
  ('vendor', 'expense', 'Taxas de cartão e maquininha', 'card_fee', false, 9),
  ('vendor', 'expense', 'Outras despesas', null, false, 90),
  ('organizer', 'income', 'Taxas de participação', 'participant_fee', false, 1),
  ('organizer', 'income', 'Patrocínios', null, false, 2),
  ('organizer', 'income', 'Outras receitas', null, false, 90),
  ('organizer', 'expense', 'Montagem e desmontagem', null, false, 1),
  ('organizer', 'expense', 'Aluguel de mesas e cadeiras', null, false, 2),
  ('organizer', 'expense', 'Shows e atrações', null, false, 3),
  ('organizer', 'expense', 'Taxas da prefeitura', null, false, 4),
  ('organizer', 'expense', 'Limpeza', null, false, 5),
  ('organizer', 'expense', 'Segurança', null, false, 6),
  ('organizer', 'expense', 'Divulgação', null, false, 7),
  ('organizer', 'expense', 'Energia', null, false, 8),
  ('organizer', 'expense', 'Água', null, false, 9),
  ('organizer', 'expense', 'Aluguel', null, false, 10),
  ('organizer', 'expense', 'MEI / DAS', 'mei_das', false, 11),
  ('organizer', 'expense', 'Outros custos', null, false, 90);
