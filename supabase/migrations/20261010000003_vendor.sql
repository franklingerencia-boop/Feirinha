-- =====================================================================
-- SR - Feirinhas | 0003 - Módulo do feirante
-- Feiras e edições (agenda), fornecedores, produtos, composição de custo,
-- vendas com registro de preço/custo histórico e lançamento financeiro único.
-- =====================================================================

create type public.fee_mode as enum ('per_day', 'per_event');
create type public.edition_status as enum ('planned', 'confirmed', 'completed', 'canceled');

-- Converte texto em uuid sem erro (usado nas políticas do Storage)
create or replace function public.try_uuid(p text)
returns uuid
language plpgsql immutable set search_path = ''
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- Feiras e edições
-- ---------------------------------------------------------------------
create table public.fairs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  organizer_name text,
  organizer_phone text,
  organizer_whatsapp text,
  organizer_email text,
  default_location_name text,
  default_address text,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index fairs_company_idx on public.fairs (company_id);

-- Cada edição guarda as próprias condições (taxa, forma de cobrança, local),
-- preservando o histórico mesmo que a feira mude no futuro.
create table public.fair_editions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  fair_id uuid not null references public.fairs (id) on delete restrict,
  name text not null,
  location_name text,
  address text,
  map_url text,
  organizer_contact text,
  stall_label text,
  fee_mode public.fee_mode not null default 'per_event',
  fee_cents bigint not null default 0 check (fee_cents >= 0),
  fee_due_date date,
  status public.edition_status not null default 'planned',
  notes text,
  linked_event_id uuid,
  link_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index fair_editions_company_idx on public.fair_editions (company_id);
create index fair_editions_fair_idx on public.fair_editions (fair_id);

create table public.edition_days (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  edition_id uuid not null references public.fair_editions (id) on delete cascade,
  day date not null,
  open_time time,
  close_time time,
  setup_time time,
  teardown_time time,
  participating boolean not null default true,
  unique (edition_id, day)
);
create index edition_days_company_idx on public.edition_days (company_id, day);

alter table public.transactions
  add constraint transactions_edition_fk foreign key (fair_edition_id)
  references public.fair_editions (id) on delete set null;

-- Total da taxa: por dia = taxa x dias de participação; valor único = cobrado uma vez
create or replace function public._edition_fee_total(p_edition uuid)
returns bigint
language sql stable security definer set search_path = ''
as $$
  select case
    when e.fee_mode = 'per_day' then e.fee_cents * (
      select count(*) from public.edition_days d where d.edition_id = e.id and d.participating)
    else e.fee_cents
  end::bigint
  from public.fair_editions e where e.id = p_edition;
$$;
revoke execute on function public._edition_fee_total(uuid) from public, anon, authenticated;

-- Gestão de cadastros do negócio: proprietário/admin ou quem tem permissão
-- de configurações ou finanças.
create or replace function public.can_manage(p_company uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.can_settings(p_company) or public.can_finance(p_company);
$$;

-- Versão pública: só retorna valores para quem gerencia a empresa
create or replace function public.edition_fee_total(p_edition uuid)
returns bigint
language sql stable security definer set search_path = ''
as $$
  select public._edition_fee_total(e.id)
  from public.fair_editions e where e.id = p_edition and public.can_manage(e.company_id);
$$;

-- Mantém um único lançamento de "taxa de feira" por edição (despesa prevista)
create or replace function public.sync_edition_fee(p_edition uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  e public.fair_editions;
  v_total bigint;
  v_first date;
  v_tx public.transactions;
  v_cat uuid;
  v_fair text;
begin
  select * into e from public.fair_editions where id = p_edition;
  if not found then return; end if;
  v_total := coalesce(public._edition_fee_total(p_edition), 0);
  select min(day) into v_first from public.edition_days where edition_id = p_edition and participating;
  select * into v_tx from public.transactions where source_type = 'fair_fee' and source_id = p_edition;
  select name into v_fair from public.fairs where id = e.fair_id;

  perform set_config('app.system_write', 'on', true);
  if e.status = 'canceled' or v_total <= 0 then
    if v_tx.id is not null and v_tx.status = 'planned' then
      update public.transactions set status = 'canceled', canceled_at = now(),
        cancel_reason = case when e.status = 'canceled' then 'Participação cancelada' else 'Taxa zerada' end
      where id = v_tx.id;
    end if;
  elsif v_tx.id is null then
    select id into v_cat from public.fin_categories
      where company_id = e.company_id and system_code = 'fair_fee' and kind = 'expense' limit 1;
    insert into public.transactions (company_id, kind, status, description, amount_cents, category_id,
      due_date, competence_date, fair_edition_id, source_type, source_id)
    values (e.company_id, 'expense', 'planned',
      'Taxa da feira: ' || coalesce(v_fair, '') || ' - ' || e.name, v_total, v_cat,
      coalesce(e.fee_due_date, v_first, public.company_today(e.company_id)),
      coalesce(v_first, e.fee_due_date, public.company_today(e.company_id)),
      e.id, 'fair_fee', e.id);
  elsif v_tx.status = 'planned' then
    update public.transactions set
      amount_cents = v_total,
      due_date = coalesce(e.fee_due_date, v_first, v_tx.due_date),
      competence_date = coalesce(v_first, v_tx.competence_date)
    where id = v_tx.id;
  elsif v_tx.status = 'canceled' then
    -- Participação reativada: cria novo lançamento? Reutiliza o cancelado não é permitido;
    -- registramos um novo lançamento com outra origem para manter o histórico.
    insert into public.transactions (company_id, kind, status, description, amount_cents, category_id,
      due_date, competence_date, fair_edition_id, source_type, source_id)
    select e.company_id, 'expense', 'planned',
      'Taxa da feira: ' || coalesce(v_fair, '') || ' - ' || e.name, v_total, v_tx.category_id,
      coalesce(e.fee_due_date, v_first, public.company_today(e.company_id)),
      coalesce(v_first, public.company_today(e.company_id)), e.id, 'fair_fee_reopen', gen_random_uuid()
    where not exists (select 1 from public.transactions t where t.fair_edition_id = e.id
                      and t.source_type = 'fair_fee_reopen' and t.status <> 'canceled');
  end if;
  perform set_config('app.system_write', 'off', true);
end;
$$;
revoke execute on function public.sync_edition_fee(uuid) from public, anon, authenticated;

create or replace function public.tg_fair_editions_before()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_same_company('fairs', new.fair_id, new.company_id);
  new.updated_at := now();
  return new;
end;
$$;
create trigger fair_editions_before before insert or update on public.fair_editions
  for each row execute function public.tg_fair_editions_before();

create or replace function public.tg_fair_editions_after()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.fee_cents <> old.fee_cents or new.fee_mode <> old.fee_mode
     or new.status <> old.status or new.fee_due_date is distinct from old.fee_due_date
     or new.name <> old.name then
    perform public.sync_edition_fee(new.id);
  end if;
  return null;
end;
$$;
create trigger fair_editions_after after insert or update on public.fair_editions
  for each row execute function public.tg_fair_editions_after();
create trigger fair_editions_audit after insert or update on public.fair_editions
  for each row execute function public.tg_audit();

create or replace function public.tg_edition_days_before()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_same_company('fair_editions', new.edition_id, new.company_id);
  return new;
end;
$$;
create trigger edition_days_before before insert or update on public.edition_days
  for each row execute function public.tg_edition_days_before();

create or replace function public.tg_edition_days_after()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.sync_edition_fee(coalesce(new.edition_id, old.edition_id));
  return null;
end;
$$;
create trigger edition_days_after after insert or update or delete on public.edition_days
  for each row execute function public.tg_edition_days_after();

-- ---------------------------------------------------------------------
-- Fornecedores
-- ---------------------------------------------------------------------
create table public.supplier_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  archived boolean not null default false,
  unique (company_id, name)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  contact_name text,
  phone text,
  whatsapp text,
  email text,
  city text,
  address text,
  products text,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index suppliers_company_idx on public.suppliers (company_id);

create table public.supplier_category_links (
  company_id uuid not null references public.companies (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  category_id uuid not null references public.supplier_categories (id) on delete cascade,
  primary key (supplier_id, category_id)
);

create or replace function public.tg_supplier_links_before()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_same_company('suppliers', new.supplier_id, new.company_id);
  perform public.assert_same_company('supplier_categories', new.category_id, new.company_id);
  return new;
end;
$$;
create trigger supplier_links_before before insert or update on public.supplier_category_links
  for each row execute function public.tg_supplier_links_before();

-- ---------------------------------------------------------------------
-- Produtos e composição de custo
-- ---------------------------------------------------------------------
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  sort int not null default 100,
  archived boolean not null default false,
  unique (company_id, name)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  category_id uuid references public.product_categories (id) on delete set null,
  name text not null,
  description text,
  unit text not null default 'un',
  price_cents bigint not null default 0 check (price_cents >= 0),
  cost_mode text not null default 'direct' check (cost_mode in ('direct', 'composition')),
  cost_cents bigint not null default 0 check (cost_cents >= 0),
  packaging_cost_cents bigint not null default 0 check (packaging_cost_cents >= 0),
  other_cost_cents bigint not null default 0 check (other_cost_cents >= 0),
  yield_qty numeric(12, 3) not null default 1 check (yield_qty > 0),
  photo_path text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_company_idx on public.products (company_id);

create table public.product_components (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  name text not null,
  quantity numeric(12, 3) not null default 1,
  unit text,
  total_cost_cents bigint not null default 0 check (total_cost_cents >= 0),
  supplier_id uuid references public.suppliers (id) on delete set null,
  sort int not null default 100
);
create index product_components_product_idx on public.product_components (product_id);

create table public.product_price_history (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  price_cents bigint not null,
  unit_cost_cents bigint not null,
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now()
);
create index product_price_history_idx on public.product_price_history (product_id, changed_at desc);

create or replace function public.product_unit_cost(p public.products)
returns bigint
language sql immutable set search_path = ''
as $$
  select (p.cost_cents + p.packaging_cost_cents + p.other_cost_cents)::bigint;
$$;

create or replace function public.tg_products_before()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_sum bigint;
begin
  perform public.assert_same_company('product_categories', new.category_id, new.company_id);
  if new.cost_mode = 'composition' and tg_op = 'UPDATE' then
    select coalesce(sum(total_cost_cents), 0) into v_sum from public.product_components where product_id = new.id;
    new.cost_cents := round(v_sum / new.yield_qty)::bigint;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger products_before before insert or update on public.products
  for each row execute function public.tg_products_before();

create or replace function public.tg_products_history()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.price_cents <> old.price_cents
     or public.product_unit_cost(new) <> public.product_unit_cost(old) then
    insert into public.product_price_history (company_id, product_id, price_cents, unit_cost_cents)
    values (new.company_id, new.id, new.price_cents, public.product_unit_cost(new));
  end if;
  return null;
end;
$$;
create trigger products_history after insert or update on public.products
  for each row execute function public.tg_products_history();

create or replace function public.tg_components_before()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_same_company('products', new.product_id, new.company_id);
  perform public.assert_same_company('suppliers', new.supplier_id, new.company_id);
  return new;
end;
$$;
create trigger components_before before insert or update on public.product_components
  for each row execute function public.tg_components_before();

-- Recalcula o custo do produto quando a composição muda
create or replace function public.tg_components_after()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.products set updated_at = now()
  where id = coalesce(new.product_id, old.product_id) and cost_mode = 'composition';
  return null;
end;
$$;
create trigger components_after after insert or update or delete on public.product_components
  for each row execute function public.tg_components_after();

-- ---------------------------------------------------------------------
-- Vendas
-- ---------------------------------------------------------------------
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  number bigint not null,
  fair_edition_id uuid references public.fair_editions (id) on delete set null,
  sold_at timestamptz not null default now(),
  sale_date date not null,
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  discount_type text not null default 'none' check (discount_type in ('none', 'amount', 'percent')),
  discount_value numeric(12, 2) not null default 0,
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  total_cents bigint not null check (total_cents > 0),
  payment_method_id uuid references public.payment_methods (id) on delete set null,
  payment_method_name text not null,
  settlement public.settlement_kind not null,
  account_id uuid references public.accounts (id) on delete set null,
  status text not null default 'completed' check (status in ('completed', 'canceled')),
  notes text,
  cancel_reason text,
  canceled_at timestamptz,
  canceled_by uuid,
  idempotency_key text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (company_id, idempotency_key),
  unique (company_id, number)
);
create index sales_company_idx on public.sales (company_id, sale_date desc);
create index sales_edition_idx on public.sales (fair_edition_id);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  sale_id uuid not null references public.sales (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  unit text,
  quantity numeric(12, 3) not null check (quantity > 0),
  unit_price_cents bigint not null,
  unit_cost_cents bigint not null,
  total_cents bigint not null,
  total_cost_cents bigint not null
);
create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_company_idx on public.sale_items (company_id);

create trigger sales_audit after insert or update on public.sales
  for each row execute function public.tg_audit();

-- Registra uma venda de forma atômica e idempotente.
-- p_items: [{"product_id": "...", "quantity": 2}]
-- p_discount_value: centavos quando 'amount'; percentual quando 'percent'.
create or replace function public.create_sale(
  p_company uuid,
  p_idempotency_key text,
  p_items jsonb,
  p_payment_method_id uuid,
  p_account_id uuid default null,
  p_discount_type text default 'none',
  p_discount_value numeric default 0,
  p_fair_edition_id uuid default null,
  p_notes text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_existing uuid;
  v_sale uuid := gen_random_uuid();
  v_number bigint;
  v_subtotal bigint := 0;
  v_discount bigint := 0;
  v_total bigint;
  v_pm public.payment_methods;
  v_account uuid;
  v_item jsonb;
  v_prod public.products;
  v_qty numeric;
  v_line bigint;
  v_today date;
  v_cat uuid;
  v_fee_cat uuid;
  v_fee bigint;
  v_status public.tx_status;
  v_due date;
begin
  if not public.is_member(p_company) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 8 then
    raise exception 'Identificador da venda inválido.' using errcode = 'P0001';
  end if;

  -- Evita duplicidade em cliques repetidos
  perform pg_advisory_xact_lock(hashtextextended(p_company::text || p_idempotency_key, 0));
  select id into v_existing from public.sales where company_id = p_company and idempotency_key = p_idempotency_key;
  if v_existing is not null then return v_existing; end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Adicione pelo menos um produto.' using errcode = 'P0001';
  end if;

  select * into v_pm from public.payment_methods where id = p_payment_method_id and company_id = p_company and not archived;
  if not found then
    raise exception 'Forma de pagamento inválida.' using errcode = 'P0001';
  end if;
  v_account := coalesce(p_account_id, v_pm.default_account_id);
  if v_account is null or not exists (select 1 from public.accounts where id = v_account and company_id = p_company and not archived) then
    raise exception 'Selecione a conta que receberá o pagamento.' using errcode = 'P0001';
  end if;
  if p_fair_edition_id is not null then
    perform public.assert_same_company('fair_editions', p_fair_edition_id, p_company);
  end if;

  v_today := public.company_today(p_company);
  perform pg_advisory_xact_lock(hashtextextended('sale-number-' || p_company::text, 0));
  select coalesce(max(number), 0) + 1 into v_number from public.sales where company_id = p_company;

  -- Cabeçalho provisório (valores atualizados após os itens)
  insert into public.sales (id, company_id, number, fair_edition_id, sale_date, subtotal_cents, discount_type,
    discount_value, discount_cents, total_cents, payment_method_id, payment_method_name, settlement,
    account_id, notes, idempotency_key)
  values (v_sale, p_company, v_number, p_fair_edition_id, v_today, 0, coalesce(p_discount_type, 'none'),
    coalesce(p_discount_value, 0), 0, 1, v_pm.id, v_pm.name, v_pm.settlement, v_account, p_notes, p_idempotency_key);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantidade inválida.' using errcode = 'P0001';
    end if;
    select * into v_prod from public.products
      where id = (v_item ->> 'product_id')::uuid and company_id = p_company and active;
    if not found then
      raise exception 'Produto indisponível.' using errcode = 'P0001';
    end if;
    v_line := round(v_prod.price_cents * v_qty)::bigint;
    v_subtotal := v_subtotal + v_line;
    insert into public.sale_items (company_id, sale_id, product_id, product_name, unit, quantity,
      unit_price_cents, unit_cost_cents, total_cents, total_cost_cents)
    values (p_company, v_sale, v_prod.id, v_prod.name, v_prod.unit, v_qty, v_prod.price_cents,
      public.product_unit_cost(v_prod), v_line, round(public.product_unit_cost(v_prod) * v_qty)::bigint);
  end loop;

  if p_discount_type = 'amount' then
    v_discount := round(coalesce(p_discount_value, 0))::bigint;
  elsif p_discount_type = 'percent' then
    if p_discount_value < 0 or p_discount_value > 100 then
      raise exception 'Percentual de desconto inválido.' using errcode = 'P0001';
    end if;
    v_discount := round(v_subtotal * p_discount_value / 100)::bigint;
  end if;
  if v_discount < 0 or v_discount >= v_subtotal then
    raise exception 'O desconto deve ser menor que o valor da venda.' using errcode = 'P0001';
  end if;
  v_total := v_subtotal - v_discount;

  update public.sales set subtotal_cents = v_subtotal, discount_cents = v_discount, total_cents = v_total
  where id = v_sale;

  -- Lançamento financeiro único da venda
  select id into v_cat from public.fin_categories
    where company_id = p_company and system_code = 'sales' and kind = 'income' limit 1;
  if v_pm.settlement = 'immediate' then
    v_status := 'settled'; v_due := v_today;
  else
    v_status := 'planned'; v_due := v_today + v_pm.settle_days;
  end if;

  perform set_config('app.system_write', 'on', true);
  insert into public.transactions (company_id, kind, status, description, amount_cents, category_id, account_id,
    due_date, paid_date, competence_date, fair_edition_id, source_type, source_id)
  values (p_company, 'income', v_status, 'Venda nº ' || v_number || ' (' || v_pm.name || ')', v_total, v_cat,
    v_account, v_due, case when v_status = 'settled' then v_today end, v_today, p_fair_edition_id, 'sale', v_sale);

  if v_pm.fee_percent > 0 then
    v_fee := round(v_total * v_pm.fee_percent / 100)::bigint;
    if v_fee > 0 then
      select id into v_fee_cat from public.fin_categories
        where company_id = p_company and system_code = 'card_fee' and kind = 'expense' limit 1;
      insert into public.transactions (company_id, kind, status, description, amount_cents, category_id, account_id,
        due_date, paid_date, competence_date, fair_edition_id, source_type, source_id)
      values (p_company, 'expense', v_status, 'Taxa ' || v_pm.name || ' - venda nº ' || v_number, v_fee, v_fee_cat,
        v_account, v_due, case when v_status = 'settled' then v_today end, v_today, p_fair_edition_id, 'sale_fee', v_sale);
    end if;
  end if;
  perform set_config('app.system_write', 'off', true);

  return v_sale;
end;
$$;

-- Cancela uma venda e seus efeitos financeiros, de forma rastreável
create or replace function public.cancel_sale(p_sale uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_sale public.sales;
begin
  select * into v_sale from public.sales where id = p_sale for update;
  if not found then
    raise exception 'Venda não encontrada.' using errcode = 'P0001';
  end if;
  if not public.can_finance(v_sale.company_id) then
    raise exception 'Você não tem permissão para cancelar vendas.' using errcode = '42501';
  end if;
  if v_sale.status = 'canceled' then return; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Informe o motivo do cancelamento.' using errcode = 'P0001';
  end if;

  update public.sales set status = 'canceled', cancel_reason = trim(p_reason),
    canceled_at = now(), canceled_by = auth.uid()
  where id = p_sale;

  perform set_config('app.system_write', 'on', true);
  update public.transactions set status = 'canceled', canceled_at = now(),
    cancel_reason = 'Venda cancelada: ' || trim(p_reason)
  where source_id = p_sale and source_type in ('sale', 'sale_fee') and status <> 'canceled';
  perform set_config('app.system_write', 'off', true);
end;
$$;

-- Produtos para a tela de vendas (sem custos), acessível a operadores
create or replace function public.pos_products(p_company uuid)
returns table (id uuid, name text, description text, unit text, price_cents bigint,
               category_id uuid, category_name text, photo_path text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_member(p_company) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return query
    select p.id, p.name, p.description, p.unit, p.price_cents, p.category_id, c.name, p.photo_path
    from public.products p
    left join public.product_categories c on c.id = p.category_id
    where p.company_id = p_company and p.active
    order by c.sort nulls last, c.name nulls last, p.name;
end;
$$;

-- Edições para associar vendas (sem valores de taxa), acessível a operadores
create or replace function public.pos_editions(p_company uuid)
returns table (id uuid, fair_name text, edition_name text, first_day date, last_day date,
               location_name text, address text, status public.edition_status)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_member(p_company) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return query
    select e.id, f.name, e.name,
      (select min(d.day) from public.edition_days d where d.edition_id = e.id and d.participating),
      (select max(d.day) from public.edition_days d where d.edition_id = e.id and d.participating),
      e.location_name, e.address, e.status
    from public.fair_editions e
    join public.fairs f on f.id = e.fair_id
    where e.company_id = p_company and e.status <> 'canceled'
    order by 4 desc nulls last;
end;
$$;

-- Histórico de vendas (operadores veem as vendas; custos não são retornados)
create or replace function public.sales_history(p_company uuid, p_from date, p_to date)
returns table (id uuid, number bigint, sold_at timestamptz, sale_date date, total_cents bigint,
               discount_cents bigint, payment_method_name text, status text, cancel_reason text,
               fair_edition_id uuid, items jsonb)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_member(p_company) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return query
    select s.id, s.number, s.sold_at, s.sale_date, s.total_cents, s.discount_cents,
      s.payment_method_name, s.status, s.cancel_reason, s.fair_edition_id,
      (select coalesce(jsonb_agg(jsonb_build_object('name', i.product_name, 'quantity', i.quantity,
        'unit_price_cents', i.unit_price_cents, 'total_cents', i.total_cents) order by i.product_name), '[]'::jsonb)
       from public.sale_items i where i.sale_id = s.id)
    from public.sales s
    where s.company_id = p_company and s.sale_date between p_from and p_to
    order by s.sold_at desc;
end;
$$;

-- ---------------------------------------------------------------------
-- Visão da agenda (respeita RLS de quem consulta)
-- ---------------------------------------------------------------------
create view public.edition_overview with (security_invoker = true) as
select e.*,
  f.name as fair_name,
  f.organizer_name, f.organizer_phone, f.organizer_whatsapp, f.organizer_email,
  (select min(d.day) from public.edition_days d where d.edition_id = e.id and d.participating) as first_day,
  (select max(d.day) from public.edition_days d where d.edition_id = e.id and d.participating) as last_day,
  (select count(*) from public.edition_days d where d.edition_id = e.id and d.participating)::int as days_count,
  public.edition_fee_total(e.id) as fee_total_cents,
  (select t.status from public.transactions t where t.fair_edition_id = e.id
     and t.source_type in ('fair_fee', 'fair_fee_reopen') order by (t.status = 'canceled'), t.created_at desc limit 1) as fee_status
from public.fair_editions e
join public.fairs f on f.id = e.fair_id;

-- ---------------------------------------------------------------------
-- RLS do módulo do feirante
-- Leitura e escrita: proprietário/admin ou quem tem permissão de configurações
-- ou finanças. Operadores usam as funções pos_* (sem custos/taxas).
-- ---------------------------------------------------------------------

alter table public.fairs enable row level security;
alter table public.fair_editions enable row level security;
alter table public.edition_days enable row level security;
alter table public.supplier_categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.supplier_category_links enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.product_components enable row level security;
alter table public.product_price_history enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

create policy fairs_all on public.fairs for all to authenticated
  using (public.can_manage(company_id)) with check (public.can_manage(company_id));
create policy fair_editions_all on public.fair_editions for all to authenticated
  using (public.can_manage(company_id)) with check (public.can_manage(company_id));
create policy edition_days_all on public.edition_days for all to authenticated
  using (public.can_manage(company_id)) with check (public.can_manage(company_id));
create policy supplier_categories_all on public.supplier_categories for all to authenticated
  using (public.can_manage(company_id)) with check (public.can_manage(company_id));
create policy suppliers_all on public.suppliers for all to authenticated
  using (public.can_manage(company_id)) with check (public.can_manage(company_id));
create policy supplier_links_all on public.supplier_category_links for all to authenticated
  using (public.can_manage(company_id)) with check (public.can_manage(company_id));
create policy product_categories_select on public.product_categories for select to authenticated
  using (public.is_member(company_id));
create policy product_categories_write on public.product_categories for insert to authenticated
  with check (public.can_manage(company_id));
create policy product_categories_update on public.product_categories for update to authenticated
  using (public.can_manage(company_id)) with check (public.can_manage(company_id));
create policy product_categories_delete on public.product_categories for delete to authenticated
  using (public.can_manage(company_id));
create policy products_all on public.products for all to authenticated
  using (public.can_manage(company_id)) with check (public.can_manage(company_id));
create policy product_components_all on public.product_components for all to authenticated
  using (public.can_manage(company_id)) with check (public.can_manage(company_id));
create policy product_price_history_select on public.product_price_history for select to authenticated
  using (public.can_manage(company_id));
-- Vendas: leitura completa (com custos) só para quem tem acesso financeiro.
-- Escrita somente pelas funções create_sale/cancel_sale.
create policy sales_select on public.sales for select to authenticated
  using (public.can_finance(company_id));
create policy sale_items_select on public.sale_items for select to authenticated
  using (public.can_finance(company_id));

-- ---------------------------------------------------------------------
-- Storage: imagens de produtos, separadas por empresa ({company_id}/arquivo)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy product_images_select on storage.objects for select to authenticated
  using (bucket_id = 'product-images'
         and public.is_member(public.try_uuid((storage.foldername(name))[1])));
create policy product_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images'
              and public.can_manage(public.try_uuid((storage.foldername(name))[1])));
create policy product_images_update on storage.objects for update to authenticated
  using (bucket_id = 'product-images'
         and public.can_manage(public.try_uuid((storage.foldername(name))[1])));
create policy product_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images'
         and public.can_manage(public.try_uuid((storage.foldername(name))[1])));

-- ---------------------------------------------------------------------
-- Padrões da empresa: inclui categorias de fornecedores para feirantes
-- ---------------------------------------------------------------------
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

  if v_kind = 'vendor' then
    insert into public.supplier_categories (company_id, name)
    values (p_company, 'Embalagens'), (p_company, 'Chocolate'), (p_company, 'Ingredientes'),
           (p_company, 'Bebidas'), (p_company, 'Utensílios'), (p_company, 'Outros')
    on conflict (company_id, name) do nothing;
  end if;
end;
$$;
revoke execute on function public.seed_company_defaults(uuid) from public, anon, authenticated;

revoke execute on function public.create_sale(uuid, text, jsonb, uuid, uuid, text, numeric, uuid, text) from public, anon;
revoke execute on function public.cancel_sale(uuid, text) from public, anon;
revoke execute on function public.pos_products(uuid) from public, anon;
revoke execute on function public.pos_editions(uuid) from public, anon;
revoke execute on function public.sales_history(uuid, date, date) from public, anon;
revoke execute on function public.edition_fee_total(uuid) from public, anon;
