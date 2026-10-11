-- =====================================================================
-- SR - Feirinhas | 0006 - Painéis de indicadores e administração da plataforma
-- =====================================================================

-- ---------------------------------------------------------------------
-- Painel do feirante
-- Faturamento = soma das vendas concluídas (já com desconto).
-- CMV = custo registrado nos itens vendidos (preço/custo do momento da venda).
-- Despesas operacionais = despesas não canceladas (previstas + pagas), exceto
-- compras de estoque (que viram CMV quando vendidas, evitando contar duas vezes).
-- Lucro estimado = faturamento + outras receitas - CMV - despesas operacionais.
-- Saldo disponível = dinheiro nas contas (saldo inicial + recebido - pago ± transferências).
-- ---------------------------------------------------------------------
create or replace function public.vendor_dashboard(p_company uuid, p_from date, p_to date, p_edition uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today date;
  r jsonb;
begin
  if not public.can_finance(p_company) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  v_today := public.company_today(p_company);

  with s as (
    select * from public.sales
    where company_id = p_company and status = 'completed' and sale_date between p_from and p_to
      and (p_edition is null or fair_edition_id = p_edition)
  ), si as (
    select i.*, s.fair_edition_id from public.sale_items i join s on s.id = i.sale_id
  ), t as (
    select * from public.transactions
    where company_id = p_company and status <> 'canceled' and competence_date between p_from and p_to
      and (p_edition is null or fair_edition_id = p_edition)
  ), bal as (
    select * from public.account_balances(p_company, null)
  )
  select jsonb_build_object(
    'revenue_cents', coalesce((select sum(total_cents) from s), 0),
    'sales_count', (select count(*) from s),
    'discounts_cents', coalesce((select sum(discount_cents) from s), 0),
    'cogs_cents', coalesce((select sum(total_cost_cents) from si), 0),
    'other_income_cents', coalesce((select sum(amount_cents) from t where kind = 'income' and source_type <> 'sale'), 0),
    'fair_fees_cents', coalesce((select sum(amount_cents) from t where kind = 'expense' and source_type in ('fair_fee', 'fair_fee_reopen')), 0),
    'payment_fees_cents', coalesce((select sum(amount_cents) from t where kind = 'expense' and source_type = 'sale_fee'), 0),
    'operating_expenses_cents', coalesce((select sum(amount_cents) from t where kind = 'expense' and not is_stock_purchase), 0),
    'stock_purchases_cents', coalesce((select sum(amount_cents) from t where kind = 'expense' and is_stock_purchase), 0),
    'received_cents', coalesce((select sum(amount_cents) from t where kind = 'income' and status = 'settled'), 0),
    'expenses_paid_cents', coalesce((select sum(amount_cents) from t where kind = 'expense' and status = 'settled'), 0),
    'balance_total_cents', coalesce((select sum(balance_cents) from bal where not archived), 0),
    'balances', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'kind', kind,
        'balance_cents', balance_cents) order by name), '[]'::jsonb) from bal where not archived),
    'payables', jsonb_build_object(
      'open_cents', coalesce((select sum(amount_cents) from public.transactions where company_id = p_company
        and kind = 'expense' and status = 'planned'), 0),
      'overdue_cents', coalesce((select sum(amount_cents) from public.transactions where company_id = p_company
        and kind = 'expense' and status = 'planned' and due_date < v_today), 0),
      'next7_cents', coalesce((select sum(amount_cents) from public.transactions where company_id = p_company
        and kind = 'expense' and status = 'planned' and due_date between v_today and v_today + 7), 0)),
    'receivables', jsonb_build_object(
      'open_cents', coalesce((select sum(amount_cents) from public.transactions where company_id = p_company
        and kind = 'income' and status = 'planned'), 0),
      'overdue_cents', coalesce((select sum(amount_cents) from public.transactions where company_id = p_company
        and kind = 'income' and status = 'planned' and due_date < v_today), 0),
      'next7_cents', coalesce((select sum(amount_cents) from public.transactions where company_id = p_company
        and kind = 'income' and status = 'planned' and due_date between v_today and v_today + 7), 0)),
    'expenses_by_category', (select coalesce(jsonb_agg(x order by (x ->> 'amount_cents')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object('name', coalesce(c.name, 'Sem categoria'), 'amount_cents', sum(t.amount_cents),
          'stock', bool_or(t.is_stock_purchase)) x
        from t left join public.fin_categories c on c.id = t.category_id
        where t.kind = 'expense' group by c.name) q),
    'top_products', (select coalesce(jsonb_agg(x order by (x ->> 'revenue_cents')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object('name', product_name, 'quantity', sum(quantity), 'revenue_cents', sum(total_cents),
          'cost_cents', sum(total_cost_cents)) x
        from si group by product_name order by sum(total_cents) desc limit 10) q),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'revenue_cents', v) order by d), '[]'::jsonb) from (
        select sale_date d, sum(total_cents) v from s group by sale_date) q),
    'by_edition', (select coalesce(jsonb_agg(x order by (x ->> 'revenue_cents')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'id', e.id, 'label', f.name || ' - ' || e.name,
          'first_day', (select min(day) from public.edition_days d where d.edition_id = e.id and d.participating),
          'revenue_cents', coalesce((select sum(total_cents) from s where s.fair_edition_id = e.id), 0),
          'sales_count', (select count(*) from s where s.fair_edition_id = e.id),
          'cogs_cents', coalesce((select sum(total_cost_cents) from si where si.fair_edition_id = e.id), 0),
          'expenses_cents', coalesce((select sum(amount_cents) from t where t.fair_edition_id = e.id
                                       and t.kind = 'expense' and not t.is_stock_purchase), 0),
          'other_income_cents', coalesce((select sum(amount_cents) from t where t.fair_edition_id = e.id
                                       and t.kind = 'income' and t.source_type <> 'sale'), 0)) x
        from public.fair_editions e join public.fairs f on f.id = e.fair_id
        where e.company_id = p_company
          and (e.id in (select fair_edition_id from s) or e.id in (select fair_edition_id from t))) q),
    'upcoming', (select coalesce(jsonb_agg(x order by x ->> 'first_day'), '[]'::jsonb) from (
        select jsonb_build_object('id', e.id, 'fair_name', f.name, 'edition_name', e.name, 'status', e.status,
          'location_name', e.location_name, 'stall_label', e.stall_label,
          'first_day', min(d.day), 'last_day', max(d.day)) x
        from public.fair_editions e join public.fairs f on f.id = e.fair_id
        join public.edition_days d on d.edition_id = e.id and d.participating
        where e.company_id = p_company and e.status in ('planned', 'confirmed')
        group by e.id, f.name
        having max(d.day) >= v_today
        order by min(d.day) limit 6) q)
  ) into r;
  return r;
end;
$$;

-- ---------------------------------------------------------------------
-- Painel do organizador
-- Ocupação = vagas (barraca x dia) reservadas ou confirmadas / vagas totais.
-- Taxas previstas = total combinado dos participantes não cancelados.
-- Resultado previsto = taxas previstas + outras receitas - custos (previstos e pagos).
-- Resultado realizado = taxas recebidas + outras receitas recebidas - custos pagos.
-- ---------------------------------------------------------------------
create or replace function public.organizer_dashboard(p_company uuid, p_from date, p_to date, p_event uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today date;
  r jsonb;
begin
  if not public.can_finance(p_company) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  v_today := public.company_today(p_company);

  with ev as (
    select e.* from public.events e
    where e.company_id = p_company and e.status <> 'canceled'
      and (p_event is not null and e.id = p_event
        or p_event is null and (
          exists (select 1 from public.event_days d where d.event_id = e.id and d.day between p_from and p_to)
          or (not exists (select 1 from public.event_days d where d.event_id = e.id)
              and (e.created_at at time zone 'America/Sao_Paulo')::date between p_from and p_to)))
  ), m as (
    select e.id, e.name, e.status,
      (select min(day) from public.event_days d where d.event_id = e.id) first_day,
      (select max(day) from public.event_days d where d.event_id = e.id) last_day,
      (select count(*) from public.event_days d where d.event_id = e.id) days,
      (select count(*) from public.stalls s where s.event_id = e.id) stalls,
      (select count(*) from public.stall_assignments a join public.event_participants p on p.id = a.participant_id
        where a.event_id = e.id and p.status = 'confirmed') confirmed_slots,
      (select count(*) from public.stall_assignments a join public.event_participants p on p.id = a.participant_id
        where a.event_id = e.id and p.status = 'registered') reserved_slots,
      (select count(*) from public.event_participants p where p.event_id = e.id and p.status = 'confirmed') participants_confirmed,
      (select count(*) from public.event_participants p where p.event_id = e.id and p.status = 'registered') participants_registered,
      coalesce((select sum(public._participant_total(p.id)) from public.event_participants p
        where p.event_id = e.id and p.status <> 'canceled'), 0) fees_expected,
      coalesce((select sum(pp.amount_cents) from public.participant_payments pp join public.event_participants p on p.id = pp.participant_id
        where p.event_id = e.id and pp.canceled_at is null), 0) fees_received,
      coalesce((select sum(greatest(0, public._participant_total(p.id) - coalesce((select sum(pp.amount_cents)
          from public.participant_payments pp where pp.participant_id = p.id and pp.canceled_at is null), 0)))
        from public.event_participants p where p.event_id = e.id and p.status <> 'canceled' and p.due_date < v_today), 0) fees_overdue,
      coalesce((select sum(amount_cents) from public.transactions t where t.event_id = e.id and t.kind = 'expense'
        and t.status <> 'canceled'), 0) costs_total,
      coalesce((select sum(amount_cents) from public.transactions t where t.event_id = e.id and t.kind = 'expense'
        and t.status = 'settled'), 0) costs_paid,
      coalesce((select sum(amount_cents) from public.transactions t where t.event_id = e.id and t.kind = 'income'
        and t.status <> 'canceled' and t.source_type <> 'charge_payment'), 0) other_income,
      coalesce((select sum(amount_cents) from public.transactions t where t.event_id = e.id and t.kind = 'income'
        and t.status = 'settled' and t.source_type <> 'charge_payment'), 0) other_income_received,
      (select count(*) from public.event_participant_days pd join public.event_participants p on p.id = pd.participant_id
        where p.event_id = e.id and p.status <> 'canceled'
          and not exists (select 1 from public.stall_assignments a where a.participant_id = p.id
                          and a.event_day_id = pd.event_day_id)) days_without_stall
    from ev e
  )
  select jsonb_build_object(
    'events', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'status', status, 'first_day', first_day, 'last_day', last_day,
        'days', days, 'stalls', stalls, 'slots', stalls * days,
        'confirmed_slots', confirmed_slots, 'reserved_slots', reserved_slots,
        'available_slots', greatest(0, stalls * days - confirmed_slots - reserved_slots),
        'occupancy_pct', case when stalls * days > 0 then round(100.0 * (confirmed_slots + reserved_slots) / (stalls * days), 1) else 0 end,
        'participants_confirmed', participants_confirmed, 'participants_registered', participants_registered,
        'fees_expected_cents', fees_expected, 'fees_received_cents', fees_received, 'fees_overdue_cents', fees_overdue,
        'costs_total_cents', costs_total, 'costs_paid_cents', costs_paid,
        'other_income_cents', other_income,
        'result_planned_cents', fees_expected + other_income - costs_total,
        'result_realized_cents', fees_received + other_income_received - costs_paid,
        'days_without_stall', days_without_stall) order by first_day nulls last), '[]'::jsonb) from m),
    'totals', (select jsonb_build_object(
        'slots', coalesce(sum(stalls * days), 0),
        'confirmed_slots', coalesce(sum(confirmed_slots), 0),
        'reserved_slots', coalesce(sum(reserved_slots), 0),
        'available_slots', coalesce(sum(greatest(0, stalls * days - confirmed_slots - reserved_slots)), 0),
        'participants_confirmed', coalesce(sum(participants_confirmed), 0),
        'fees_expected_cents', coalesce(sum(fees_expected), 0),
        'fees_received_cents', coalesce(sum(fees_received), 0),
        'fees_overdue_cents', coalesce(sum(fees_overdue), 0),
        'costs_total_cents', coalesce(sum(costs_total), 0),
        'costs_paid_cents', coalesce(sum(costs_paid), 0),
        'result_planned_cents', coalesce(sum(fees_expected + other_income - costs_total), 0),
        'result_realized_cents', coalesce(sum(fees_received + other_income_received - costs_paid), 0)) from m),
    'upcoming', (select coalesce(jsonb_agg(x order by x ->> 'first_day'), '[]'::jsonb) from (
        select jsonb_build_object('id', e.id, 'name', e.name, 'status', e.status, 'location_name', e.location_name,
          'first_day', min(d.day), 'last_day', max(d.day)) x
        from public.events e join public.event_days d on d.event_id = e.id
        where e.company_id = p_company and e.status not in ('canceled', 'completed')
        group by e.id having max(d.day) >= v_today order by min(d.day) limit 6) q),
    'balance_total_cents', coalesce((select sum(balance_cents) from public.account_balances(p_company, null) where not archived), 0),
    'pending_requests', (select count(*) from public.participation_requests where organizer_company_id = p_company
      and direction = 'request' and status = 'pending')
  ) into r;
  return r;
end;
$$;

revoke execute on function public.vendor_dashboard(uuid, date, date, uuid) from public, anon;
revoke execute on function public.organizer_dashboard(uuid, date, date, uuid) from public, anon;

-- ---------------------------------------------------------------------
-- Administração da plataforma
-- ---------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- E-mails que se tornam administradores da plataforma após confirmar o e-mail
create table private.bootstrap_admins (email text primary key);
insert into private.bootstrap_admins (email) values ('franklingerencia@gmail.com');

create or replace function public.tg_bootstrap_admin()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.email_confirmed_at is not null
     and exists (select 1 from private.bootstrap_admins b where lower(b.email) = lower(new.email)) then
    insert into public.platform_admins (user_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger on_auth_user_bootstrap_admin after insert or update of email_confirmed_at on auth.users
  for each row execute function public.tg_bootstrap_admin();

-- Usuário já existente e confirmado (caso o cadastro ocorra antes desta migração)
insert into public.platform_admins (user_id)
select u.id from auth.users u join private.bootstrap_admins b on lower(b.email) = lower(u.email)
where u.email_confirmed_at is not null
on conflict do nothing;

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.platform_settings (key, value, description) values
  ('support_contact', '""'::jsonb, 'Contato de suporte exibido aos usuários'),
  ('signup_enabled', 'true'::jsonb, 'Permitir novos cadastros'),
  ('default_timezone', '"America/Sao_Paulo"'::jsonb, 'Fuso horário padrão de novas empresas');

alter table public.platform_settings enable row level security;
create policy platform_settings_read on public.platform_settings for select to authenticated using (true);
create policy platform_settings_admin on public.platform_settings for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy default_categories_admin_insert on public.default_categories for insert to authenticated
  with check (public.is_platform_admin());
create policy default_categories_admin_update on public.default_categories for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy plans_admin_insert on public.plans for insert to authenticated with check (public.is_platform_admin());
create policy plans_admin_update on public.plans for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create or replace function public._require_admin()
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito ao administrador da plataforma.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.admin_stats()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public._require_admin();
  return jsonb_build_object(
    'companies_total', (select count(*) from public.companies),
    'companies_vendor', (select count(*) from public.companies where kind = 'vendor'),
    'companies_organizer', (select count(*) from public.companies where kind = 'organizer'),
    'companies_suspended', (select count(*) from public.companies where status = 'suspended'),
    'companies_demo', (select count(*) from public.companies where is_demo),
    'users_total', (select count(*) from auth.users),
    'users_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'events_total', (select count(*) from public.events),
    'events_published', (select count(*) from public.event_publications where is_published),
    'events_upcoming', (select count(distinct e.id) from public.events e join public.event_days d on d.event_id = e.id
                        where d.day >= current_date and e.status <> 'canceled'),
    'editions_total', (select count(*) from public.fair_editions),
    'links_active', (select count(*) from public.links where status = 'active'),
    'sales_30d', (select count(*) from public.sales where created_at > now() - interval '30 days' and status = 'completed')
  );
end;
$$;

create or replace function public.admin_companies(p_search text default null, p_kind public.company_kind default null,
  p_status public.company_status default null)
returns table (id uuid, name text, kind public.company_kind, status public.company_status, is_demo boolean,
  city text, plan_code text, created_at timestamptz, suspended_reason text, members int, owner_email text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public._require_admin();
  return query
    select c.id, c.name, c.kind, c.status, c.is_demo, c.city, c.plan_code, c.created_at, c.suspended_reason,
      (select count(*) from public.memberships m where m.company_id = c.id and m.active)::int,
      (select u.email::text from public.memberships m join auth.users u on u.id = m.user_id
        where m.company_id = c.id and m.role = 'owner' and m.active order by m.created_at limit 1)
    from public.companies c
    where (p_search is null or p_search = '' or c.name ilike '%' || p_search || '%' or c.city ilike '%' || p_search || '%')
      and (p_kind is null or c.kind = p_kind)
      and (p_status is null or c.status = p_status)
    order by c.created_at desc
    limit 500;
end;
$$;

create or replace function public.admin_set_company_status(p_company uuid, p_status public.company_status, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public._require_admin();
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Informe o motivo.' using errcode = 'P0001';
  end if;
  update public.companies set status = p_status,
    suspended_at = case when p_status = 'suspended' then now() else null end,
    suspended_reason = case when p_status = 'suspended' then trim(p_reason) else null end
  where id = p_company;
  perform public.write_audit(p_company, 'admin.company_status', 'companies', p_company::text,
    jsonb_build_object('status', p_status, 'reason', p_reason));
end;
$$;

create or replace function public.admin_users(p_search text default null)
returns table (id uuid, email text, full_name text, created_at timestamptz, last_sign_in_at timestamptz,
  email_confirmed boolean, is_admin boolean, memberships jsonb)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public._require_admin();
  return query
    select u.id, u.email::text, p.full_name, u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null,
      exists (select 1 from public.platform_admins a where a.user_id = u.id),
      (select coalesce(jsonb_agg(jsonb_build_object('company_id', c.id, 'company_name', c.name, 'kind', c.kind,
         'role', m.role, 'active', m.active, 'company_status', c.status)), '[]'::jsonb)
       from public.memberships m join public.companies c on c.id = m.company_id where m.user_id = u.id)
    from auth.users u left join public.profiles p on p.id = u.id
    where p_search is null or p_search = '' or u.email ilike '%' || p_search || '%' or p.full_name ilike '%' || p_search || '%'
    order by u.created_at desc
    limit 500;
end;
$$;

create or replace function public.admin_set_membership(p_company uuid, p_user uuid, p_active boolean, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  m public.memberships;
begin
  perform public._require_admin();
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Informe o motivo.' using errcode = 'P0001';
  end if;
  select * into m from public.memberships where company_id = p_company and user_id = p_user;
  if m.user_id is null then
    raise exception 'Vínculo não encontrado.' using errcode = 'P0001';
  end if;
  if not p_active and m.role = 'owner' and not exists (select 1 from public.memberships
      where company_id = p_company and role = 'owner' and active and user_id <> p_user) then
    raise exception 'A empresa precisa de pelo menos um proprietário ativo.' using errcode = 'P0001';
  end if;
  perform set_config('app.bypass_guard', 'on', true);
  update public.memberships set active = p_active where company_id = p_company and user_id = p_user;
  perform set_config('app.bypass_guard', 'off', true);
  perform public.write_audit(p_company, 'admin.membership', 'memberships', p_user::text,
    jsonb_build_object('active', p_active, 'reason', p_reason));
end;
$$;

-- Acesso limitado a dados de uma empresa cliente: exige motivo e fica registrado
create or replace function public.admin_company_detail(p_company uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  perform public._require_admin();
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'Informe o motivo do acesso (mínimo 5 caracteres).' using errcode = 'P0001';
  end if;
  perform public.write_audit(p_company, 'admin.view_company', 'companies', p_company::text,
    jsonb_build_object('reason', p_reason));
  return (
    select jsonb_build_object(
      'company', jsonb_build_object('id', c.id, 'name', c.name, 'kind', c.kind, 'status', c.status,
        'city', c.city, 'email', c.email, 'phone', c.phone, 'created_at', c.created_at, 'is_demo', c.is_demo,
        'suspended_reason', c.suspended_reason, 'plan_code', c.plan_code),
      'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', u.email,
          'role', m.role, 'active', m.active)), '[]'::jsonb)
        from public.memberships m join auth.users u on u.id = m.user_id where m.company_id = c.id),
      'counts', jsonb_build_object(
        'products', (select count(*) from public.products where company_id = c.id),
        'fairs', (select count(*) from public.fairs where company_id = c.id),
        'sales', (select count(*) from public.sales where company_id = c.id),
        'events', (select count(*) from public.events where company_id = c.id),
        'vendors', (select count(*) from public.vendors where company_id = c.id),
        'links_active', (select count(*) from public.links where (organizer_company_id = c.id or vendor_company_id = c.id) and status = 'active'))
    )
    from public.companies c where c.id = p_company
  );
end;
$$;

create or replace function public.admin_audit(p_company uuid default null, p_action text default null, p_limit int default 200)
returns table (id bigint, created_at timestamptz, company_id uuid, company_name text, actor_email text,
  action text, entity text, entity_id text, details jsonb)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public._require_admin();
  return query
    select a.id, a.created_at, a.company_id, c.name, u.email::text, a.action, a.entity, a.entity_id, a.details
    from public.audit_log a
    left join public.companies c on c.id = a.company_id
    left join auth.users u on u.id = a.actor_id
    where (p_company is null or a.company_id = p_company)
      and (p_action is null or p_action = '' or a.action ilike p_action || '%')
    order by a.created_at desc
    limit least(coalesce(p_limit, 200), 1000);
end;
$$;

create or replace function public.admin_publish_term(p_code text, p_title text, p_body text)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_version int;
begin
  perform public._require_admin();
  select coalesce(max(version), 0) + 1 into v_version from public.consent_terms where code = p_code;
  update public.consent_terms set active = false where code = p_code;
  insert into public.consent_terms (code, version, title, body) values (p_code, v_version, p_title, p_body);
  perform public.write_audit(null, 'admin.publish_term', 'consent_terms', p_code || ':' || v_version, '{}'::jsonb);
  return v_version;
end;
$$;

-- Registro de alterações relevantes das configurações gerais
create trigger platform_settings_audit after update on public.platform_settings
  for each row execute function public.tg_audit();
create trigger default_categories_audit after insert or update on public.default_categories
  for each row execute function public.tg_audit();

revoke execute on function public._require_admin() from public, anon, authenticated;
revoke execute on function public.admin_stats() from public, anon;
revoke execute on function public.admin_companies(text, public.company_kind, public.company_status) from public, anon;
revoke execute on function public.admin_set_company_status(uuid, public.company_status, text) from public, anon;
revoke execute on function public.admin_users(text) from public, anon;
revoke execute on function public.admin_set_membership(uuid, uuid, boolean, text) from public, anon;
revoke execute on function public.admin_company_detail(uuid, text) from public, anon;
revoke execute on function public.admin_audit(uuid, text, int) from public, anon;
revoke execute on function public.admin_publish_term(text, text, text) from public, anon;

-- ---------------------------------------------------------------------
-- Segurança geral: funções auxiliares internas não devem ser chamadas por clientes
-- ---------------------------------------------------------------------
revoke execute on function public.tg_audit() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.tg_bootstrap_admin() from public, anon, authenticated;
