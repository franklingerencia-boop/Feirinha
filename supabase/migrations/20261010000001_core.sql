-- =====================================================================
-- SR - Feirinhas | 0001 - Núcleo: perfis, empresas, vínculos, permissões,
-- convites, administradores da plataforma e auditoria.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

create type public.company_kind as enum ('vendor', 'organizer');
create type public.company_status as enum ('active', 'suspended');
create type public.member_role as enum ('owner', 'admin', 'operator');

-- ---------------------------------------------------------------------
-- Perfis de usuário (1:1 com auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Administradores da plataforma: preenchido apenas via SQL/migração.
-- Nunca exposto ao cadastro público.
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Planos (estrutura para assinaturas futuras; sem cobrança nesta versão)
create table public.plans (
  code text primary key,
  name text not null,
  description text,
  features jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.plans (code, name, description)
values ('free', 'Gratuito', 'Plano inicial sem cobrança');

-- ---------------------------------------------------------------------
-- Empresas
-- ---------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  kind public.company_kind not null,
  name text not null check (length(trim(name)) between 2 and 120),
  document text,
  responsible_name text,
  phone text,
  whatsapp text,
  email text,
  city text,
  segment text,
  products_summary text,
  timezone text not null default 'America/Sao_Paulo',
  status public.company_status not null default 'active',
  suspended_at timestamptz,
  suspended_reason text,
  is_demo boolean not null default false,
  plan_code text not null default 'free' references public.plans (code),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'operator',
  can_finance boolean not null default false,
  can_settings boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null,
  role public.member_role not null default 'operator',
  can_finance boolean not null default false,
  can_settings boolean not null default false,
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  invited_by uuid references auth.users (id) on delete set null,
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now(),
  check (role <> 'owner')
);
create index invitations_company_idx on public.invitations (company_id);

-- ---------------------------------------------------------------------
-- Auditoria (somente inserção via funções/gatilhos)
-- ---------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  company_id uuid references public.companies (id) on delete set null,
  actor_id uuid,
  action text not null,
  entity text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_company_idx on public.audit_log (company_id, created_at desc);

-- ---------------------------------------------------------------------
-- Funções auxiliares de permissão (usadas nas políticas RLS)
-- ---------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid());
$$;

create or replace function public.is_member(p_company uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.companies c on c.id = m.company_id
    where m.company_id = p_company
      and m.user_id = auth.uid()
      and m.active
      and c.status = 'active'
  );
$$;

create or replace function public.has_role(p_company uuid, p_roles public.member_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.companies c on c.id = m.company_id
    where m.company_id = p_company
      and m.user_id = auth.uid()
      and m.active
      and c.status = 'active'
      and m.role = any (p_roles)
  );
$$;

-- Acesso a informações financeiras: proprietário, administrador ou operador autorizado
create or replace function public.can_finance(p_company uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.companies c on c.id = m.company_id
    where m.company_id = p_company
      and m.user_id = auth.uid()
      and m.active
      and c.status = 'active'
      and (m.role in ('owner', 'admin') or m.can_finance)
  );
$$;

-- Acesso a configurações e cadastros: proprietário, administrador ou operador autorizado
create or replace function public.can_settings(p_company uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.companies c on c.id = m.company_id
    where m.company_id = p_company
      and m.user_id = auth.uid()
      and m.active
      and c.status = 'active'
      and (m.role in ('owner', 'admin') or m.can_settings)
  );
$$;

create or replace function public.company_kind_of(p_company uuid)
returns public.company_kind
language sql stable security definer set search_path = ''
as $$
  select kind from public.companies where id = p_company;
$$;

-- "Hoje" no fuso horário da empresa
create or replace function public.company_today(p_company uuid)
returns date
language sql stable security definer set search_path = ''
as $$
  select (now() at time zone coalesce(
    (select timezone from public.companies where id = p_company), 'America/Sao_Paulo'))::date;
$$;

create or replace function public.write_audit(
  p_company uuid, p_action text, p_entity text, p_entity_id text, p_details jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.audit_log (company_id, actor_id, action, entity, entity_id, details)
  values (p_company, auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;
revoke execute on function public.write_audit(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- Gatilho genérico de auditoria (usa a coluna company_id da linha)
create or replace function public.tg_audit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_row jsonb;
  v_old jsonb;
  v_company uuid;
  v_id text;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  v_company := nullif(v_row ->> 'company_id', '')::uuid;
  if tg_table_name = 'companies' then v_company := (v_row ->> 'id')::uuid; end if;
  v_id := coalesce(v_row ->> 'id', v_row ->> 'user_id', v_row ->> 'event_id');
  insert into public.audit_log (company_id, actor_id, action, entity, entity_id, details)
  values (
    v_company, auth.uid(), lower(tg_op), tg_table_name, v_id,
    jsonb_build_object('new', case when tg_op = 'DELETE' then null else v_row end, 'old', v_old)
  );
  return null;
end;
$$;

create or replace function public.tg_touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.tg_touch_updated_at();
create trigger companies_touch before update on public.companies
  for each row execute function public.tg_touch_updated_at();
create trigger memberships_touch before update on public.memberships
  for each row execute function public.tg_touch_updated_at();

create trigger companies_audit after insert or update or delete on public.companies
  for each row execute function public.tg_audit();
create trigger memberships_audit after insert or update or delete on public.memberships
  for each row execute function public.tg_audit();
create trigger invitations_audit after insert or update on public.invitations
  for each row execute function public.tg_audit();

-- Criação automática de perfil ao cadastrar usuário
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Impede alteração de campos protegidos da empresa por usuários comuns
create or replace function public.tg_companies_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if public.is_platform_admin() or current_setting('app.bypass_guard', true) = 'on' then
    return new;
  end if;
  if new.kind is distinct from old.kind
     or new.status is distinct from old.status
     or new.suspended_at is distinct from old.suspended_at
     or new.suspended_reason is distinct from old.suspended_reason
     or new.is_demo is distinct from old.is_demo
     or new.plan_code is distinct from old.plan_code
     or new.created_by is distinct from old.created_by then
    raise exception 'Campos protegidos da empresa não podem ser alterados.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger companies_guard before update on public.companies
  for each row execute function public.tg_companies_guard();

-- Impede que o último proprietário seja removido/rebaixado e protege o papel 'owner'
create or replace function public.tg_memberships_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_owners int;
begin
  if current_setting('app.bypass_guard', true) = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    if new.role = 'owner' then
      raise exception 'Proprietários só podem ser definidos pela criação da empresa.' using errcode = '42501';
    end if;
    return new;
  end if;
  -- Somente proprietários alteram proprietários
  if old.role = 'owner' and not public.has_role(old.company_id, array['owner']::public.member_role[]) then
    raise exception 'Somente o proprietário pode alterar outro proprietário.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.role = 'owner' and old.role <> 'owner'
     and not public.has_role(old.company_id, array['owner']::public.member_role[]) then
    raise exception 'Somente o proprietário pode promover a proprietário.' using errcode = '42501';
  end if;
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner' or not new.active) then
    select count(*) into v_owners from public.memberships
      where company_id = old.company_id and role = 'owner' and active and user_id <> old.user_id;
    if v_owners = 0 then
      raise exception 'A empresa precisa de pelo menos um proprietário ativo.' using errcode = 'P0001';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger memberships_guard before insert or update or delete on public.memberships
  for each row execute function public.tg_memberships_guard();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.plans enable row level security;
alter table public.companies enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_log enable row level security;

-- Perfis: o próprio usuário, ou colegas de empresa (somente leitura)
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.memberships m1
      join public.memberships m2 on m2.company_id = m1.company_id
      where m1.user_id = (select auth.uid()) and m2.user_id = profiles.id and public.is_member(m1.company_id)
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy platform_admins_self on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()));

create policy plans_read on public.plans for select to authenticated using (true);

-- Empresas: membros leem; proprietário/admin atualizam dados cadastrais.
-- Criação somente via função create_company().
create policy companies_select on public.companies for select to authenticated
  using (public.is_member(id));
create policy companies_update on public.companies for update to authenticated
  using (public.has_role(id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_role(id, array['owner', 'admin']::public.member_role[]));

-- Vínculos: o usuário vê os próprios (inclusive de empresas suspensas, para exibir aviso);
-- membros veem a equipe; proprietário/admin gerenciam.
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or public.is_member(company_id));
create policy memberships_update on public.memberships for update to authenticated
  using (public.has_role(company_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_role(company_id, array['owner', 'admin']::public.member_role[]));
create policy memberships_delete on public.memberships for delete to authenticated
  using (public.has_role(company_id, array['owner', 'admin']::public.member_role[]));

create policy invitations_select on public.invitations for select to authenticated
  using (public.has_role(company_id, array['owner', 'admin']::public.member_role[]));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (public.has_role(company_id, array['owner', 'admin']::public.member_role[]) and invited_by = (select auth.uid()));
create policy invitations_update on public.invitations for update to authenticated
  using (public.has_role(company_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_role(company_id, array['owner', 'admin']::public.member_role[]));

-- Auditoria: proprietário/admin leem o histórico da própria empresa
create policy audit_select on public.audit_log for select to authenticated
  using (company_id is not null and public.has_role(company_id, array['owner', 'admin']::public.member_role[]));

-- ---------------------------------------------------------------------
-- Funções de negócio
-- ---------------------------------------------------------------------
create or replace function public.create_company(
  p_kind public.company_kind,
  p_name text,
  p_responsible_name text default null,
  p_phone text default null,
  p_email text default null,
  p_city text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar autenticado.' using errcode = '42501';
  end if;
  insert into public.companies (kind, name, responsible_name, phone, email, city, created_by)
  values (p_kind, trim(p_name), p_responsible_name, p_phone, p_email, p_city, auth.uid())
  returning id into v_id;

  perform set_config('app.bypass_guard', 'on', true);
  insert into public.memberships (company_id, user_id, role, can_finance, can_settings)
  values (v_id, auth.uid(), 'owner', true, true);
  perform set_config('app.bypass_guard', 'off', true);

  perform public.seed_company_defaults(v_id);
  return v_id;
end;
$$;

-- Preenchido nas migrações seguintes (categorias, formas de pagamento etc.)
create or replace function public.seed_company_defaults(p_company uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  return;
end;
$$;
revoke execute on function public.seed_company_defaults(uuid) from public, anon, authenticated;

-- Consulta de convite (sem expor dados além do necessário)
create or replace function public.get_invitation(p_token text)
returns table (company_name text, company_kind public.company_kind, role public.member_role, email text, valid boolean)
language sql stable security definer set search_path = ''
as $$
  select c.name, c.kind, i.role, i.email,
         (i.accepted_at is null and i.revoked_at is null and i.expires_at > now() and c.status = 'active')
  from public.invitations i
  join public.companies c on c.id = i.company_id
  where i.token = p_token;
$$;

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_inv public.invitations;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar autenticado.' using errcode = '42501';
  end if;
  select * into v_inv from public.invitations where token = p_token for update;
  if not found or v_inv.accepted_at is not null or v_inv.revoked_at is not null or v_inv.expires_at < now() then
    raise exception 'Convite inválido, expirado ou já utilizado.' using errcode = 'P0001';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  if lower(v_email) <> lower(v_inv.email) then
    raise exception 'Este convite foi enviado para outro e-mail.' using errcode = '42501';
  end if;

  insert into public.memberships (company_id, user_id, role, can_finance, can_settings)
  values (v_inv.company_id, auth.uid(), v_inv.role, v_inv.can_finance, v_inv.can_settings)
  on conflict (company_id, user_id) do update
    set role = excluded.role, can_finance = excluded.can_finance,
        can_settings = excluded.can_settings, active = true;

  update public.invitations set accepted_at = now(), accepted_by = auth.uid() where id = v_inv.id;
  return v_inv.company_id;
end;
$$;

-- Lista de empresas do usuário (inclui suspensas, para orientar o usuário)
create or replace function public.my_companies()
returns table (
  id uuid, name text, kind public.company_kind, status public.company_status,
  role public.member_role, can_finance boolean, can_settings boolean, is_demo boolean, timezone text)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.name, c.kind, c.status, m.role,
         (m.role in ('owner', 'admin') or m.can_finance),
         (m.role in ('owner', 'admin') or m.can_settings),
         c.is_demo, c.timezone
  from public.memberships m
  join public.companies c on c.id = m.company_id
  where m.user_id = auth.uid() and m.active
  order by c.name;
$$;

-- Equipe da empresa com e-mail (somente membros)
create or replace function public.company_team(p_company uuid)
returns table (user_id uuid, full_name text, email text, role public.member_role,
               can_finance boolean, can_settings boolean, active boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_member(p_company) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return query
    select m.user_id, p.full_name, p.email, m.role, m.can_finance, m.can_settings, m.active, m.created_at
    from public.memberships m
    left join public.profiles p on p.id = m.user_id
    where m.company_id = p_company
    order by m.created_at;
end;
$$;

revoke execute on function public.create_company(public.company_kind, text, text, text, text, text) from public, anon;
revoke execute on function public.accept_invitation(text) from public, anon;
revoke execute on function public.my_companies() from public, anon;
revoke execute on function public.company_team(uuid) from public, anon;
revoke execute on function public.get_invitation(text) from public;
grant execute on function public.get_invitation(text) to anon, authenticated;
