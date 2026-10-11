-- =====================================================================
-- SR - Feirinhas | 0004 - Módulo do organizador
-- Eventos, dias, tipos de barraca, barracas (planta), elementos do mapa,
-- feirantes (cadastro próprio), participantes, atribuição de barracas
-- (sem conflitos) e pagamentos das taxas de participação.
-- =====================================================================

create type public.event_status as enum ('draft', 'open', 'confirmed', 'completed', 'canceled');
create type public.participant_status as enum ('registered', 'confirmed', 'canceled');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  description text,
  location_name text,
  address text,
  map_url text,
  setup_info text,
  teardown_info text,
  arrival_instructions text,
  rules text,
  segments text,
  structure text,
  default_fee_cents bigint not null default 0 check (default_fee_cents >= 0),
  fee_mode public.fee_mode not null default 'per_event',
  payment_due_date date,
  status public.event_status not null default 'draft',
  contact_name text,
  contact_phone text,
  contact_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index events_company_idx on public.events (company_id);

create table public.event_days (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  day date not null,
  open_time time,
  close_time time,
  setup_time time,
  teardown_time time,
  unique (event_id, day)
);
create index event_days_event_idx on public.event_days (event_id, day);

alter table public.transactions
  add constraint transactions_event_fk foreign key (event_id)
  references public.events (id) on delete set null;

create table public.stall_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  size_label text,
  fee_cents bigint not null default 0 check (fee_cents >= 0),
  fee_mode public.fee_mode not null default 'per_event',
  color text not null default '#f59e0b',
  unique (event_id, name)
);

create table public.stalls (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  stall_type_id uuid references public.stall_types (id) on delete set null,
  code text not null,
  x int not null default 20,
  y int not null default 20,
  w int not null default 60 check (w between 20 and 400),
  h int not null default 60 check (h between 20 and 400),
  rotation int not null default 0,
  notes text,
  unique (event_id, code)
);
create index stalls_event_idx on public.stalls (event_id);

create table public.map_elements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  kind text not null check (kind in ('entrance', 'exit', 'stage', 'restroom', 'support', 'food', 'parking', 'other')),
  label text,
  x int not null default 20,
  y int not null default 20,
  w int not null default 80 check (w between 20 and 1200),
  h int not null default 40 check (h between 20 and 1200)
);
create index map_elements_event_idx on public.map_elements (event_id);

-- Cadastro de feirantes do organizador (inclui quem não tem conta no app)
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  responsible_name text,
  trade_name text not null,
  phone text,
  whatsapp text,
  email text,
  segment text,
  products text,
  needs_space text,
  needs_power boolean not null default false,
  needs_structure text,
  notes text,
  linked_company_id uuid references public.companies (id) on delete set null,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index vendors_company_idx on public.vendors (company_id);

create table public.event_participants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  vendor_id uuid not null references public.vendors (id) on delete restrict,
  stall_type_id uuid references public.stall_types (id) on delete set null,
  status public.participant_status not null default 'registered',
  fee_mode public.fee_mode not null,
  fee_cents bigint not null default 0 check (fee_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  due_date date,
  notes text,
  source text not null default 'manual' check (source in ('manual', 'request', 'invite')),
  canceled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, vendor_id)
);
create index event_participants_event_idx on public.event_participants (event_id);

create table public.event_participant_days (
  company_id uuid not null references public.companies (id) on delete cascade,
  participant_id uuid not null references public.event_participants (id) on delete cascade,
  event_day_id uuid not null references public.event_days (id) on delete cascade,
  primary key (participant_id, event_day_id)
);

-- Uma barraca só pode ter um participante por dia; um participante, uma barraca por dia.
create table public.stall_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  stall_id uuid not null references public.stalls (id) on delete cascade,
  participant_id uuid not null references public.event_participants (id) on delete cascade,
  event_day_id uuid not null references public.event_days (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint stall_assignments_stall_day_uniq unique (stall_id, event_day_id),
  constraint stall_assignments_participant_day_uniq unique (participant_id, event_day_id)
);
create index stall_assignments_event_idx on public.stall_assignments (event_id);

create table public.participant_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  participant_id uuid not null references public.event_participants (id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  paid_date date not null,
  account_id uuid not null references public.accounts (id) on delete restrict,
  method text,
  notes text,
  idempotency_key text,
  canceled_at timestamptz,
  cancel_reason text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index participant_payments_participant_idx on public.participant_payments (participant_id);
create unique index participant_payments_idem_uidx on public.participant_payments (company_id, idempotency_key)
  where idempotency_key is not null;

-- ---------------------------------------------------------------------
-- Gatilhos de integridade
-- ---------------------------------------------------------------------
create or replace function public.tg_event_child_before()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_same_company('events', new.event_id, new.company_id);
  return new;
end;
$$;
create trigger event_days_before before insert or update on public.event_days
  for each row execute function public.tg_event_child_before();
create trigger stall_types_before before insert or update on public.stall_types
  for each row execute function public.tg_event_child_before();
create trigger map_elements_before before insert or update on public.map_elements
  for each row execute function public.tg_event_child_before();

create or replace function public.tg_stalls_before()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_same_company('events', new.event_id, new.company_id);
  if new.stall_type_id is not null and not exists (
    select 1 from public.stall_types where id = new.stall_type_id and event_id = new.event_id) then
    raise exception 'O tipo de barraca não pertence a este evento.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger stalls_before before insert or update on public.stalls
  for each row execute function public.tg_stalls_before();

create or replace function public.tg_participants_before()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_same_company('events', new.event_id, new.company_id);
  perform public.assert_same_company('vendors', new.vendor_id, new.company_id);
  if new.stall_type_id is not null and not exists (
    select 1 from public.stall_types where id = new.stall_type_id and event_id = new.event_id) then
    raise exception 'O tipo de barraca não pertence a este evento.' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    if new.event_id <> old.event_id or new.vendor_id <> old.vendor_id then
      raise exception 'Não é possível mover a participação para outro evento ou feirante.' using errcode = 'P0001';
    end if;
    if new.status = 'canceled' and old.status <> 'canceled' then
      new.canceled_at := now();
    elsif new.status <> 'canceled' then
      new.canceled_at := null;
      new.cancel_reason := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger participants_before before insert or update on public.event_participants
  for each row execute function public.tg_participants_before();

-- Ao cancelar a participação, libera as barracas (o histórico fica na auditoria)
create or replace function public.tg_participants_after()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'canceled' and old.status <> 'canceled' then
    delete from public.stall_assignments where participant_id = new.id;
  end if;
  return null;
end;
$$;
create trigger participants_after after update on public.event_participants
  for each row execute function public.tg_participants_after();
create trigger participants_audit after insert or update or delete on public.event_participants
  for each row execute function public.tg_audit();

create or replace function public.tg_participant_days_before()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_event uuid;
begin
  select event_id into v_event from public.event_participants
    where id = new.participant_id and company_id = new.company_id;
  if v_event is null or not exists (
    select 1 from public.event_days where id = new.event_day_id and event_id = v_event) then
    raise exception 'Dia inválido para esta participação.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger participant_days_before before insert or update on public.event_participant_days
  for each row execute function public.tg_participant_days_before();

-- Remover um dia da participação libera a barraca naquele dia
create or replace function public.tg_participant_days_after_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.stall_assignments
  where participant_id = old.participant_id and event_day_id = old.event_day_id;
  return null;
end;
$$;
create trigger participant_days_after_delete after delete on public.event_participant_days
  for each row execute function public.tg_participant_days_after_delete();

create or replace function public.tg_assignments_before()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  p public.event_participants;
begin
  select * into p from public.event_participants where id = new.participant_id;
  if p.id is null or p.company_id <> new.company_id or p.event_id <> new.event_id then
    raise exception 'Participante inválido para este evento.' using errcode = 'P0001';
  end if;
  if p.status = 'canceled' then
    raise exception 'Participação cancelada não pode receber barraca.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.stalls where id = new.stall_id and event_id = new.event_id) then
    raise exception 'A barraca não pertence a este evento.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.event_participant_days
                 where participant_id = new.participant_id and event_day_id = new.event_day_id) then
    raise exception 'O participante não está inscrito neste dia.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger assignments_before before insert or update on public.stall_assignments
  for each row execute function public.tg_assignments_before();
create trigger assignments_audit after insert or update or delete on public.stall_assignments
  for each row execute function public.tg_audit();

-- Total devido por participante: por dia = taxa x dias; por evento = taxa única; menos desconto
create or replace function public._participant_total(p_participant uuid)
returns bigint
language sql stable security definer set search_path = ''
as $$
  select greatest(0, case
    when p.fee_mode = 'per_day' then p.fee_cents * (
      select count(*) from public.event_participant_days d where d.participant_id = p.id)
    else p.fee_cents
  end - p.discount_cents)::bigint
  from public.event_participants p where p.id = p_participant;
$$;
revoke execute on function public._participant_total(uuid) from public, anon, authenticated;

create or replace function public.participant_total(p_participant uuid)
returns bigint
language sql stable security definer set search_path = ''
as $$
  select public._participant_total(p.id)
  from public.event_participants p where p.id = p_participant and public.can_manage(p.company_id);
$$;

-- Pagamentos: geram um único lançamento de receita recebida
create or replace function public.tg_payments_before()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_same_company('event_participants', new.participant_id, new.company_id);
  perform public.assert_same_company('accounts', new.account_id, new.company_id);
  if tg_op = 'UPDATE' then
    if old.canceled_at is not null then
      raise exception 'Pagamento cancelado não pode ser alterado.' using errcode = 'P0001';
    end if;
    if new.amount_cents <> old.amount_cents or new.participant_id <> old.participant_id
       or new.account_id <> old.account_id or new.paid_date <> old.paid_date then
      raise exception 'Para corrigir um pagamento, cancele-o e registre outro.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
create trigger payments_before before insert or update on public.participant_payments
  for each row execute function public.tg_payments_before();

create or replace function public.tg_payments_after()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_event uuid;
  v_vendor text;
  v_event_name text;
  v_cat uuid;
begin
  perform set_config('app.system_write', 'on', true);
  if tg_op = 'INSERT' then
    select p.event_id, v.trade_name, e.name into v_event, v_vendor, v_event_name
    from public.event_participants p
    join public.vendors v on v.id = p.vendor_id
    join public.events e on e.id = p.event_id
    where p.id = new.participant_id;
    select id into v_cat from public.fin_categories
      where company_id = new.company_id and system_code = 'participant_fee' and kind = 'income' limit 1;
    insert into public.transactions (company_id, kind, status, description, amount_cents, category_id, account_id,
      due_date, paid_date, competence_date, event_id, source_type, source_id)
    values (new.company_id, 'income', 'settled', 'Taxa de participação: ' || v_vendor || ' (' || v_event_name || ')',
      new.amount_cents, v_cat, new.account_id, new.paid_date, new.paid_date, new.paid_date, v_event,
      'charge_payment', new.id);
  elsif new.canceled_at is not null and old.canceled_at is null then
    update public.transactions set status = 'canceled', canceled_at = now(),
      cancel_reason = 'Pagamento cancelado: ' || coalesce(new.cancel_reason, '')
    where source_type = 'charge_payment' and source_id = new.id and status <> 'canceled';
  end if;
  perform set_config('app.system_write', 'off', true);
  return null;
end;
$$;
create trigger payments_after after insert or update on public.participant_payments
  for each row execute function public.tg_payments_after();
create trigger payments_audit after insert or update on public.participant_payments
  for each row execute function public.tg_audit();

create trigger events_touch before update on public.events
  for each row execute function public.tg_touch_updated_at();
create trigger events_audit after insert or update on public.events
  for each row execute function public.tg_audit();

create or replace function public.tg_vendors_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- A associação a uma empresa da plataforma só ocorre pelo fluxo de vínculo com aceite
  if (tg_op = 'INSERT' and new.linked_company_id is not null)
     or (tg_op = 'UPDATE' and new.linked_company_id is distinct from old.linked_company_id) then
    if current_setting('app.system_write', true) is distinct from 'on' then
      raise exception 'A associação a uma empresa da plataforma exige vínculo com aceite.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger vendors_guard before insert or update on public.vendors
  for each row execute function public.tg_vendors_guard();

-- ---------------------------------------------------------------------
-- Visão de participantes com valores (respeita RLS)
-- ---------------------------------------------------------------------
create view public.participant_overview with (security_invoker = true) as
select p.*,
  v.trade_name, v.responsible_name, v.phone as vendor_phone, v.whatsapp as vendor_whatsapp,
  v.email as vendor_email, v.segment as vendor_segment, v.linked_company_id,
  (select count(*) from public.event_participant_days d where d.participant_id = p.id)::int as days_count,
  public.participant_total(p.id) as total_cents,
  coalesce((select sum(pp.amount_cents) from public.participant_payments pp
            where pp.participant_id = p.id and pp.canceled_at is null), 0)::bigint as paid_cents,
  (select string_agg(distinct s.code, ', ' order by s.code) from public.stall_assignments a
     join public.stalls s on s.id = a.stall_id where a.participant_id = p.id) as stall_codes
from public.event_participants p
join public.vendors v on v.id = p.vendor_id;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.events enable row level security;
alter table public.event_days enable row level security;
alter table public.stall_types enable row level security;
alter table public.stalls enable row level security;
alter table public.map_elements enable row level security;
alter table public.vendors enable row level security;
alter table public.event_participants enable row level security;
alter table public.event_participant_days enable row level security;
alter table public.stall_assignments enable row level security;
alter table public.participant_payments enable row level security;

-- Dados do evento: membros leem (operadores ajudam na organização);
-- escrita para quem gerencia.
create policy events_select on public.events for select to authenticated using (public.is_member(company_id));
create policy events_write on public.events for insert to authenticated with check (public.can_manage(company_id));
create policy events_update on public.events for update to authenticated
  using (public.can_manage(company_id)) with check (public.can_manage(company_id));
create policy events_delete on public.events for delete to authenticated
  using (public.can_manage(company_id) and status = 'draft');

create policy event_days_select on public.event_days for select to authenticated using (public.is_member(company_id));
create policy event_days_write on public.event_days for insert to authenticated with check (public.can_manage(company_id));
create policy event_days_update on public.event_days for update to authenticated
  using (public.can_manage(company_id)) with check (public.can_manage(company_id));
create policy event_days_delete on public.event_days for delete to authenticated using (public.can_manage(company_id));

create policy stall_types_select on public.stall_types for select to authenticated using (public.is_member(company_id));
create policy stall_types_write on public.stall_types for all to authenticated
  using (public.can_manage(company_id)) with check (public.can_manage(company_id));

create policy stalls_select on public.stalls for select to authenticated using (public.is_member(company_id));
create policy stalls_write on public.stalls for all to authenticated
  using (public.can_manage(company_id)) with check (public.can_manage(company_id));

create policy map_elements_select on public.map_elements for select to authenticated using (public.is_member(company_id));
create policy map_elements_write on public.map_elements for all to authenticated
  using (public.can_manage(company_id)) with check (public.can_manage(company_id));

create policy vendors_all on public.vendors for all to authenticated
  using (public.can_manage(company_id)) with check (public.can_manage(company_id));
create policy participants_all on public.event_participants for all to authenticated
  using (public.can_manage(company_id)) with check (public.can_manage(company_id));
create policy participant_days_all on public.event_participant_days for all to authenticated
  using (public.can_manage(company_id)) with check (public.can_manage(company_id));
create policy assignments_select on public.stall_assignments for select to authenticated
  using (public.is_member(company_id));
create policy assignments_write on public.stall_assignments for insert to authenticated
  with check (public.can_manage(company_id));
create policy assignments_update on public.stall_assignments for update to authenticated
  using (public.can_manage(company_id)) with check (public.can_manage(company_id));
create policy assignments_delete on public.stall_assignments for delete to authenticated
  using (public.can_manage(company_id));
create policy payments_select on public.participant_payments for select to authenticated
  using (public.can_finance(company_id));
create policy payments_insert on public.participant_payments for insert to authenticated
  with check (public.can_finance(company_id));
create policy payments_update on public.participant_payments for update to authenticated
  using (public.can_finance(company_id)) with check (public.can_finance(company_id));

revoke execute on function public.participant_total(uuid) from public, anon;
