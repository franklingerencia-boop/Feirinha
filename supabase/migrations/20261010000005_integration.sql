-- =====================================================================
-- SR - Feirinhas | 0005 - Integração entre feirantes e organizadores
-- Termos e aceites versionados, publicação opcional de eventos,
-- "Feiras disponíveis", solicitações/convites com aprovação, vínculos
-- com escopo de compartilhamento, avisos de alteração, links públicos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Termos (versionados) e registros de aceite (somente inserção pelo sistema)
-- ---------------------------------------------------------------------
create table public.consent_terms (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code in ('publication', 'link')),
  version int not null,
  title text not null,
  body text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (code, version)
);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  term_code text not null,
  term_version int not null,
  user_id uuid not null,
  company_id uuid not null references public.companies (id) on delete cascade,
  event_id uuid references public.events (id) on delete set null,
  link_id uuid,
  request_id uuid,
  scope jsonb not null default '{}'::jsonb,
  details jsonb not null default '{}'::jsonb,
  accepted_at timestamptz not null default now()
);
create index consent_records_company_idx on public.consent_records (company_id, accepted_at desc);

insert into public.consent_terms (code, version, title, body) values
('publication', 1, 'Autorização para divulgar o evento em "Feiras disponíveis"',
'Ao publicar, você autoriza o SR - Feirinhas a exibir as informações do evento que você marcar (nome, descrição, local, datas e horários, segmentos aceitos, estrutura, vagas, taxas, regras e, somente se autorizado, contato) na área "Feiras disponíveis".
Quem pode ver: apenas empresas feirantes cadastradas e autenticadas na plataforma. A página não é indexada nem aberta ao público.
Finalidade: permitir que feirantes conheçam o evento e solicitem participação. Nenhuma solicitação confirma vaga automaticamente: você aprova ou recusa cada pedido.
Dados que nunca são divulgados: finanças do evento, pagamentos, documentos e dados dos participantes.
Como retirar: a qualquer momento, em Evento > Publicação > "Retirar publicação". A retirada interrompe a exibição imediatamente; solicitações já recebidas permanecem no seu histórico.
Alterar os itens divulgados exige um novo aceite.'),
('link', 1, 'Permissão de compartilhamento entre feirante e organizador',
'Este termo conecta a participação do feirante ao evento do organizador, ambos usuários do SR - Feirinhas.
Dados do organizador compartilhados com o feirante: dados oficiais do evento (nome, datas, horários, montagem e desmontagem, local, endereço e link do mapa, regras e orientações, contato do evento), a barraca atribuída, a taxa combinada, o vencimento e a situação dos pagamentos da taxa.
Dados do feirante compartilhados com o organizador: apenas os itens marcados no escopo (por exemplo, nome comercial, responsável, telefone, WhatsApp, e-mail, segmento, produtos e necessidades de estrutura).
Nunca são compartilhados: vendas, fornecedores, contas bancárias, produtos com custos ou qualquer finança privada do feirante, nem as finanças do organizador.
Finalidade: organização da feira e acompanhamento da participação.
Atualizações entre os módulos: mudanças de data, local, regras, barraca e taxa feitas pelo organizador são sinalizadas ao feirante, sem substituir automaticamente valores já acordados; alterações no cadastro do feirante ficam visíveis ao organizador enquanto o vínculo estiver ativo.
Como cancelar: qualquer uma das partes pode revogar a permissão em "Vínculos". A revogação encerra o compartilhamento e as atualizações futuras, mas preserva os registros de histórico de cada empresa. Revogar não cancela a participação nem apaga pagamentos.
Alterações no escopo exigem novo aceite.');

-- ---------------------------------------------------------------------
-- Publicação de eventos
-- ---------------------------------------------------------------------
create table public.event_publications (
  event_id uuid primary key references public.events (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  is_published boolean not null default false,
  show_description boolean not null default true,
  show_location boolean not null default true,
  show_dates boolean not null default true,
  show_segments boolean not null default true,
  show_structure boolean not null default true,
  show_vacancies boolean not null default true,
  show_fees boolean not null default false,
  show_rules boolean not null default true,
  show_contact boolean not null default false,
  terms_version int,
  accepted_by uuid,
  accepted_at timestamptz,
  published_at timestamptz,
  unpublished_at timestamptz,
  updated_at timestamptz not null default now()
);
create trigger event_publications_audit after insert or update on public.event_publications
  for each row execute function public.tg_audit();

-- ---------------------------------------------------------------------
-- Solicitações (feirante → organizador) e convites (organizador → feirante)
-- ---------------------------------------------------------------------
create table public.participation_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  organizer_company_id uuid not null references public.companies (id) on delete cascade,
  vendor_company_id uuid not null references public.companies (id) on delete cascade,
  direction text not null check (direction in ('request', 'invite')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'canceled')),
  message text,
  response_message text,
  vendor_scope jsonb,
  organizer_vendor_id uuid references public.vendors (id) on delete set null,
  participant_id uuid references public.event_participants (id) on delete set null,
  requested_by uuid,
  decided_by uuid,
  decided_at timestamptz,
  link_id uuid,
  created_at timestamptz not null default now()
);
create unique index participation_requests_pending_uidx on public.participation_requests (event_id, vendor_company_id)
  where status = 'pending';
create trigger participation_requests_audit after insert or update on public.participation_requests
  for each row execute function public.tg_audit();

-- ---------------------------------------------------------------------
-- Vínculos
-- ---------------------------------------------------------------------
create table public.links (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  organizer_company_id uuid not null references public.companies (id) on delete cascade,
  vendor_company_id uuid not null references public.companies (id) on delete cascade,
  organizer_vendor_id uuid references public.vendors (id) on delete set null,
  participant_id uuid references public.event_participants (id) on delete set null,
  vendor_edition_id uuid references public.fair_editions (id) on delete set null,
  scope jsonb not null,
  terms_version int not null,
  organizer_consent_id uuid references public.consent_records (id),
  vendor_consent_id uuid references public.consent_records (id),
  status text not null default 'active' check (status in ('active', 'revoked')),
  pending_scope jsonb,
  pending_by_company uuid,
  pending_consent_id uuid,
  revoked_at timestamptz,
  revoked_by uuid,
  revoked_by_company uuid,
  revoke_reason text,
  created_at timestamptz not null default now()
);
create unique index links_active_uidx on public.links (event_id, vendor_company_id) where status = 'active';
create trigger links_audit after insert or update on public.links
  for each row execute function public.tg_audit();

alter table public.fair_editions
  add constraint fair_editions_link_fk foreign key (link_id) references public.links (id) on delete set null;

create table public.event_change_notices (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.links (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  vendor_company_id uuid not null references public.companies (id) on delete cascade,
  change_type text not null check (change_type in ('date', 'location', 'fee', 'rules', 'status', 'stall')),
  summary text not null,
  old_value jsonb,
  new_value jsonb,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);
create index event_change_notices_vendor_idx on public.event_change_notices (vendor_company_id, created_at desc);

-- ---------------------------------------------------------------------
-- Links públicos do evento (página compartilhável)
-- ---------------------------------------------------------------------
create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  active boolean not null default true,
  show_description boolean not null default true,
  show_dates boolean not null default true,
  show_address boolean not null default true,
  show_map_link boolean not null default true,
  show_arrival boolean not null default true,
  show_setup boolean not null default true,
  show_stall_map boolean not null default true,
  show_participant_names boolean not null default false,
  show_contact boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index share_links_active_uidx on public.share_links (event_id) where active;
create trigger share_links_audit after insert or update on public.share_links
  for each row execute function public.tg_audit();

-- Lançamentos: referências a feira/evento precisam ser da mesma empresa
create or replace function public.tg_transactions_refs()
returns trigger
language plpgsql security definer set search_path = ''
as $
begin
  perform public.assert_same_company('events', new.event_id, new.company_id);
  perform public.assert_same_company('fair_editions', new.fair_edition_id, new.company_id);
  return new;
end;
$;
create trigger transactions_refs before insert or update on public.transactions
  for each row execute function public.tg_transactions_refs();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.consent_terms enable row level security;
alter table public.consent_records enable row level security;
alter table public.event_publications enable row level security;
alter table public.participation_requests enable row level security;
alter table public.links enable row level security;
alter table public.event_change_notices enable row level security;
alter table public.share_links enable row level security;

create policy consent_terms_read on public.consent_terms for select to authenticated using (true);
create policy consent_records_read on public.consent_records for select to authenticated
  using (public.is_member(company_id));
create policy event_publications_read on public.event_publications for select to authenticated
  using (public.is_member(company_id));
-- Solicitações e vínculos: cada parte vê os registros em que participa (sem dados privados)
create policy participation_requests_read on public.participation_requests for select to authenticated
  using (public.can_manage(organizer_company_id) or public.can_manage(vendor_company_id));
create policy links_read on public.links for select to authenticated
  using (public.can_manage(organizer_company_id) or public.can_manage(vendor_company_id));
create policy notices_read on public.event_change_notices for select to authenticated
  using (public.is_member(vendor_company_id));
create policy share_links_read on public.share_links for select to authenticated
  using (public.can_manage(company_id));

-- ---------------------------------------------------------------------
-- Funções auxiliares
-- ---------------------------------------------------------------------
create or replace function public._record_consent(
  p_code text, p_company uuid, p_event uuid, p_scope jsonb, p_details jsonb,
  p_link uuid default null, p_request uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_version int;
  v_id uuid;
begin
  select max(version) into v_version from public.consent_terms where code = p_code and active;
  if v_version is null then
    raise exception 'Termo indisponível.' using errcode = 'P0001';
  end if;
  insert into public.consent_records (term_code, term_version, user_id, company_id, event_id, link_id,
    request_id, scope, details)
  values (p_code, v_version, auth.uid(), p_company, p_event, p_link, p_request,
    coalesce(p_scope, '{}'::jsonb), coalesce(p_details, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public._record_consent(text, uuid, uuid, jsonb, jsonb, uuid, uuid) from public, anon, authenticated;

create or replace function public.current_term(p_code text)
returns table (code text, version int, title text, body text)
language sql stable security definer set search_path = ''
as $$
  select t.code, t.version, t.title, t.body from public.consent_terms t
  where t.code = p_code and t.active order by t.version desc limit 1;
$$;

-- Campos do feirante que podem ser compartilhados (trade_name é sempre compartilhado)
create or replace function public._normalize_vendor_scope(p_scope jsonb)
returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object('vendor_fields', coalesce((
    select jsonb_agg(distinct f) from jsonb_array_elements_text(coalesce(p_scope -> 'vendor_fields', '[]'::jsonb)) f
    where f in ('responsible_name', 'phone', 'whatsapp', 'email', 'segment', 'products', 'needs')
  ), '[]'::jsonb) || '["trade_name"]'::jsonb);
$$;

create or replace function public._event_first_last(p_event uuid, out first_day date, out last_day date)
language sql stable security definer set search_path = ''
as $$
  select min(day), max(day) from public.event_days where event_id = p_event;
$$;
revoke execute on function public._event_first_last(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Publicação
-- ---------------------------------------------------------------------
create or replace function public.publish_event(p_event uuid, p_options jsonb, p_accept_terms boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  e public.events;
  v_consent uuid;
  v_version int;
begin
  select * into e from public.events where id = p_event;
  if e.id is null or not public.can_manage(e.company_id) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if public.company_kind_of(e.company_id) <> 'organizer' then
    raise exception 'Somente organizadores publicam eventos.' using errcode = '42501';
  end if;
  if e.status not in ('open', 'confirmed') then
    raise exception 'Somente eventos com inscrições abertas ou confirmados podem ser publicados.' using errcode = 'P0001';
  end if;
  if not coalesce(p_accept_terms, false) then
    raise exception 'É necessário aceitar o termo de autorização para publicar.' using errcode = 'P0001';
  end if;
  v_consent := public._record_consent('publication', e.company_id, e.id, p_options,
    jsonb_build_object('event_name', e.name));
  select term_version into v_version from public.consent_records where id = v_consent;

  insert into public.event_publications (event_id, company_id, is_published, show_description, show_location,
    show_dates, show_segments, show_structure, show_vacancies, show_fees, show_rules, show_contact,
    terms_version, accepted_by, accepted_at, published_at, unpublished_at, updated_at)
  values (e.id, e.company_id, true,
    coalesce((p_options ->> 'show_description')::boolean, true),
    coalesce((p_options ->> 'show_location')::boolean, true),
    coalesce((p_options ->> 'show_dates')::boolean, true),
    coalesce((p_options ->> 'show_segments')::boolean, true),
    coalesce((p_options ->> 'show_structure')::boolean, true),
    coalesce((p_options ->> 'show_vacancies')::boolean, true),
    coalesce((p_options ->> 'show_fees')::boolean, false),
    coalesce((p_options ->> 'show_rules')::boolean, true),
    coalesce((p_options ->> 'show_contact')::boolean, false),
    v_version, auth.uid(), now(), now(), null, now())
  on conflict (event_id) do update set
    is_published = true,
    show_description = excluded.show_description, show_location = excluded.show_location,
    show_dates = excluded.show_dates, show_segments = excluded.show_segments,
    show_structure = excluded.show_structure, show_vacancies = excluded.show_vacancies,
    show_fees = excluded.show_fees, show_rules = excluded.show_rules, show_contact = excluded.show_contact,
    terms_version = excluded.terms_version, accepted_by = excluded.accepted_by,
    accepted_at = excluded.accepted_at, published_at = now(), unpublished_at = null, updated_at = now();
end;
$$;

create or replace function public.unpublish_event(p_event uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_company uuid;
begin
  select company_id into v_company from public.events where id = p_event;
  if v_company is null or not public.can_manage(v_company) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  update public.event_publications set is_published = false, unpublished_at = now(), updated_at = now()
  where event_id = p_event;
end;
$$;

-- Evento visível em "Feiras disponíveis"?
create or replace function public._event_is_listed(p_event uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.event_publications p
    join public.events e on e.id = p.event_id
    join public.companies c on c.id = e.company_id
    where p.event_id = p_event and p.is_published and p.accepted_at is not null
      and e.status in ('open', 'confirmed') and c.status = 'active'
  );
$$;
revoke execute on function public._event_is_listed(uuid) from public, anon, authenticated;

-- Representação pública (somente campos autorizados) de um evento publicado
create or replace function public._published_event_json(p_event uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', e.id,
    'name', e.name,
    'organizer_name', c.name,
    'description', case when p.show_description then e.description end,
    'location_name', case when p.show_location then e.location_name end,
    'address', case when p.show_location then e.address end,
    'map_url', case when p.show_location then e.map_url end,
    'city', case when p.show_location then c.city end,
    'first_day', case when p.show_dates then (select min(day) from public.event_days where event_id = e.id) end,
    'last_day', case when p.show_dates then (select max(day) from public.event_days where event_id = e.id) end,
    'days', case when p.show_dates then (select coalesce(jsonb_agg(jsonb_build_object('day', d.day,
        'open_time', d.open_time, 'close_time', d.close_time, 'setup_time', d.setup_time,
        'teardown_time', d.teardown_time) order by d.day), '[]'::jsonb)
      from public.event_days d where d.event_id = e.id) end,
    'setup_info', case when p.show_dates then e.setup_info end,
    'teardown_info', case when p.show_dates then e.teardown_info end,
    'segments', case when p.show_segments then e.segments end,
    'structure', case when p.show_structure then e.structure end,
    'rules', case when p.show_rules then e.rules end,
    'stalls_total', case when p.show_vacancies then (select count(*) from public.stalls s where s.event_id = e.id) end,
    'free_slots', case when p.show_vacancies then (
      (select count(*) from public.stalls s where s.event_id = e.id) * (select count(*) from public.event_days d where d.event_id = e.id)
      - (select count(*) from public.stall_assignments a where a.event_id = e.id)) end,
    'fee_mode', case when p.show_fees then e.fee_mode end,
    'default_fee_cents', case when p.show_fees then e.default_fee_cents end,
    'stall_types', case when p.show_fees then (select coalesce(jsonb_agg(jsonb_build_object('name', t.name,
        'size_label', t.size_label, 'fee_cents', t.fee_cents, 'fee_mode', t.fee_mode) order by t.name), '[]'::jsonb)
      from public.stall_types t where t.event_id = e.id) end,
    'payment_due_date', case when p.show_fees then e.payment_due_date end,
    'contact_name', case when p.show_contact then e.contact_name end,
    'contact_phone', case when p.show_contact then e.contact_phone end,
    'contact_email', case when p.show_contact then e.contact_email end,
    'status', e.status
  )
  from public.events e
  join public.event_publications p on p.event_id = e.id
  join public.companies c on c.id = e.company_id
  where e.id = p_event;
$$;
revoke execute on function public._published_event_json(uuid) from public, anon, authenticated;

-- "Feiras disponíveis": lista para empresas feirantes autenticadas
create or replace function public.list_available_events(p_company uuid, p_search text default null)
returns setof jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_member(p_company) or public.company_kind_of(p_company) <> 'vendor' then
    raise exception 'Disponível apenas para empresas feirantes.' using errcode = '42501';
  end if;
  return query
    select public._published_event_json(e.id) || jsonb_build_object(
      'my_request_status', (select r.status from public.participation_requests r
         where r.event_id = e.id and r.vendor_company_id = p_company order by r.created_at desc limit 1),
      'my_link_active', exists (select 1 from public.links l where l.event_id = e.id
         and l.vendor_company_id = p_company and l.status = 'active'))
    from public.events e
    where public._event_is_listed(e.id)
      and coalesce((select max(day) from public.event_days d where d.event_id = e.id), current_date) >= public.company_today(p_company)
      and (p_search is null or p_search = '' or e.name ilike '%' || p_search || '%'
           or (exists (select 1 from public.event_publications p where p.event_id = e.id and p.show_location)
               and (e.address ilike '%' || p_search || '%' or e.location_name ilike '%' || p_search || '%')))
    order by (select min(day) from public.event_days d where d.event_id = e.id) nulls last;
end;
$$;

create or replace function public.get_available_event(p_company uuid, p_event uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_member(p_company) or public.company_kind_of(p_company) <> 'vendor' then
    raise exception 'Disponível apenas para empresas feirantes.' using errcode = '42501';
  end if;
  if not public._event_is_listed(p_event) then
    raise exception 'Este evento não está disponível.' using errcode = 'P0001';
  end if;
  return public._published_event_json(p_event);
end;
$$;

-- ---------------------------------------------------------------------
-- Dados do feirante compartilhados conforme escopo
-- ---------------------------------------------------------------------
create or replace function public._vendor_shared_json(p_vendor_company uuid, p_scope jsonb)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'trade_name', c.name,
    'responsible_name', case when p_scope -> 'vendor_fields' ? 'responsible_name' then c.responsible_name end,
    'phone', case when p_scope -> 'vendor_fields' ? 'phone' then c.phone end,
    'whatsapp', case when p_scope -> 'vendor_fields' ? 'whatsapp' then c.whatsapp end,
    'email', case when p_scope -> 'vendor_fields' ? 'email' then c.email end,
    'segment', case when p_scope -> 'vendor_fields' ? 'segment' then c.segment end,
    'products', case when p_scope -> 'vendor_fields' ? 'products' then c.products_summary end
  ))
  from public.companies c where c.id = p_vendor_company;
$$;
revoke execute on function public._vendor_shared_json(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Fluxo 1: feirante solicita participação em evento publicado
-- ---------------------------------------------------------------------
create or replace function public.request_participation(
  p_vendor_company uuid, p_event uuid, p_message text, p_scope jsonb, p_accept_terms boolean)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  e public.events;
  v_id uuid := gen_random_uuid();
  v_scope jsonb := public._normalize_vendor_scope(p_scope);
  v_consent uuid;
begin
  if not public.can_manage(p_vendor_company) or public.company_kind_of(p_vendor_company) <> 'vendor' then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if not public._event_is_listed(p_event) then
    raise exception 'Este evento não está disponível para solicitações.' using errcode = 'P0001';
  end if;
  if not coalesce(p_accept_terms, false) then
    raise exception 'É necessário aceitar o termo de permissão.' using errcode = 'P0001';
  end if;
  select * into e from public.events where id = p_event;
  if exists (select 1 from public.links where event_id = p_event and vendor_company_id = p_vendor_company and status = 'active') then
    raise exception 'Você já está vinculado a este evento.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.participation_requests where event_id = p_event
             and vendor_company_id = p_vendor_company and status = 'pending') then
    raise exception 'Já existe uma solicitação pendente para este evento.' using errcode = 'P0001';
  end if;

  v_consent := public._record_consent('link', p_vendor_company, p_event, v_scope,
    jsonb_build_object('role', 'vendor', 'event_name', e.name,
      'organizer_company', (select name from public.companies where id = e.company_id),
      'vendor_company', (select name from public.companies where id = p_vendor_company)),
    null, v_id);

  insert into public.participation_requests (id, event_id, organizer_company_id, vendor_company_id, direction,
    message, vendor_scope, requested_by)
  values (v_id, p_event, e.company_id, p_vendor_company, 'request', p_message, v_scope, auth.uid());

  update public.consent_records set request_id = v_id where id = v_consent;
  return v_id;
end;
$$;

create or replace function public.cancel_request(p_request uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  r public.participation_requests;
begin
  select * into r from public.participation_requests where id = p_request for update;
  if r.id is null or r.status <> 'pending' then
    raise exception 'Solicitação não encontrada ou já respondida.' using errcode = 'P0001';
  end if;
  if not ((r.direction = 'request' and public.can_manage(r.vendor_company_id))
       or (r.direction = 'invite' and public.can_manage(r.organizer_company_id))) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  update public.participation_requests set status = 'canceled', decided_by = auth.uid(), decided_at = now()
  where id = p_request;
end;
$$;

-- Lista para o organizador: solicitações recebidas e convites enviados,
-- com os dados autorizados pelo feirante e sugestões de cadastro existente
create or replace function public.organizer_requests(p_company uuid)
returns setof jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.can_manage(p_company) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return query
    select jsonb_build_object(
      'id', r.id, 'event_id', r.event_id, 'event_name', e.name, 'direction', r.direction,
      'status', r.status, 'message', r.message, 'response_message', r.response_message,
      'created_at', r.created_at, 'decided_at', r.decided_at, 'link_id', r.link_id,
      'vendor_company_name', vc.name,
      'vendor', case when r.direction = 'request' then public._vendor_shared_json(r.vendor_company_id, r.vendor_scope) end,
      'vendor_scope', r.vendor_scope,
      'organizer_vendor_id', r.organizer_vendor_id,
      'suggestions', case when r.direction = 'request' and r.status = 'pending' then (
        select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'trade_name', v.trade_name,
          'responsible_name', v.responsible_name, 'email', v.email, 'phone', v.phone)), '[]'::jsonb)
        from public.vendors v
        where v.company_id = p_company and not v.archived and v.linked_company_id is null
          and (lower(v.trade_name) = lower(vc.name)
               or (vc.email is not null and lower(v.email) = lower(vc.email))
               or (vc.phone is not null and regexp_replace(coalesce(v.phone, ''), '\D', '', 'g') = regexp_replace(vc.phone, '\D', '', 'g'))
               or (vc.whatsapp is not null and regexp_replace(coalesce(v.whatsapp, ''), '\D', '', 'g') = regexp_replace(vc.whatsapp, '\D', '', 'g')))
      ) end
    )
    from public.participation_requests r
    join public.events e on e.id = r.event_id
    join public.companies vc on vc.id = r.vendor_company_id
    where r.organizer_company_id = p_company
    order by (r.status = 'pending') desc, r.created_at desc;
end;
$$;

-- Organizador aprova a solicitação (aceite explícito do termo).
-- p_existing_vendor: associa a um cadastro manual já existente (confirmado na tela).
create or replace function public.approve_request(
  p_request uuid, p_accept_terms boolean, p_existing_vendor uuid default null,
  p_fee_mode public.fee_mode default null, p_fee_cents bigint default null,
  p_discount_cents bigint default 0, p_due_date date default null,
  p_day_ids uuid[] default null, p_stall_type_id uuid default null, p_response text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  r public.participation_requests;
  e public.events;
  vc public.companies;
  v_vendor uuid;
  v_participant uuid;
  v_link uuid := gen_random_uuid();
  v_consent uuid;
  v_version int;
  v_vendor_consent uuid;
begin
  select * into r from public.participation_requests where id = p_request for update;
  if r.id is null or r.direction <> 'request' or r.status <> 'pending' then
    raise exception 'Solicitação não encontrada ou já respondida.' using errcode = 'P0001';
  end if;
  if not public.can_manage(r.organizer_company_id) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if not coalesce(p_accept_terms, false) then
    raise exception 'É necessário aceitar o termo de permissão.' using errcode = 'P0001';
  end if;
  select * into e from public.events where id = r.event_id;
  select * into vc from public.companies where id = r.vendor_company_id;

  perform set_config('app.system_write', 'on', true);
  -- Cadastro do feirante no organizador (sem duplicar)
  if p_existing_vendor is not null then
    select id into v_vendor from public.vendors where id = p_existing_vendor and company_id = r.organizer_company_id
      and (linked_company_id is null or linked_company_id = r.vendor_company_id);
    if v_vendor is null then
      raise exception 'Cadastro de feirante inválido para associação.' using errcode = 'P0001';
    end if;
    update public.vendors set linked_company_id = r.vendor_company_id where id = v_vendor;
  else
    select id into v_vendor from public.vendors
      where company_id = r.organizer_company_id and linked_company_id = r.vendor_company_id limit 1;
    if v_vendor is null then
      insert into public.vendors (company_id, trade_name, responsible_name, phone, whatsapp, email, segment, products, linked_company_id)
      select r.organizer_company_id, vc.name,
        case when r.vendor_scope -> 'vendor_fields' ? 'responsible_name' then vc.responsible_name end,
        case when r.vendor_scope -> 'vendor_fields' ? 'phone' then vc.phone end,
        case when r.vendor_scope -> 'vendor_fields' ? 'whatsapp' then vc.whatsapp end,
        case when r.vendor_scope -> 'vendor_fields' ? 'email' then vc.email end,
        case when r.vendor_scope -> 'vendor_fields' ? 'segment' then vc.segment end,
        case when r.vendor_scope -> 'vendor_fields' ? 'products' then vc.products_summary end,
        r.vendor_company_id
      returning id into v_vendor;
    end if;
  end if;

  -- Participação (reaproveita a existente para não duplicar)
  select id into v_participant from public.event_participants where event_id = e.id and vendor_id = v_vendor;
  if v_participant is null then
    insert into public.event_participants (company_id, event_id, vendor_id, stall_type_id, status, fee_mode,
      fee_cents, discount_cents, due_date, source)
    values (e.company_id, e.id, v_vendor, p_stall_type_id, 'confirmed', coalesce(p_fee_mode, e.fee_mode),
      coalesce(p_fee_cents, e.default_fee_cents), coalesce(p_discount_cents, 0),
      coalesce(p_due_date, e.payment_due_date), 'request')
    returning id into v_participant;
  else
    update public.event_participants set status = 'confirmed' where id = v_participant and status <> 'confirmed';
  end if;
  if p_day_ids is not null then
    insert into public.event_participant_days (company_id, participant_id, event_day_id)
    select e.company_id, v_participant, d.id from public.event_days d
    where d.event_id = e.id and d.id = any (p_day_ids)
    on conflict do nothing;
  elsif not exists (select 1 from public.event_participant_days where participant_id = v_participant) then
    insert into public.event_participant_days (company_id, participant_id, event_day_id)
    select e.company_id, v_participant, d.id from public.event_days d where d.event_id = e.id;
  end if;

  select id into v_vendor_consent from public.consent_records where request_id = r.id
    and company_id = r.vendor_company_id order by accepted_at desc limit 1;
  v_consent := public._record_consent('link', r.organizer_company_id, e.id, r.vendor_scope,
    jsonb_build_object('role', 'organizer', 'event_name', e.name, 'organizer_company',
      (select name from public.companies where id = r.organizer_company_id), 'vendor_company', vc.name),
    v_link, r.id);
  select term_version into v_version from public.consent_records where id = v_consent;
  update public.consent_records set link_id = v_link where id = v_vendor_consent;

  insert into public.links (id, event_id, organizer_company_id, vendor_company_id, organizer_vendor_id,
    participant_id, scope, terms_version, organizer_consent_id, vendor_consent_id)
  values (v_link, e.id, r.organizer_company_id, r.vendor_company_id, v_vendor, v_participant,
    r.vendor_scope, v_version, v_consent, v_vendor_consent);

  update public.participation_requests set status = 'approved', decided_by = auth.uid(), decided_at = now(),
    response_message = p_response, organizer_vendor_id = v_vendor, participant_id = v_participant, link_id = v_link
  where id = r.id;
  perform set_config('app.system_write', 'off', true);
  return v_link;
end;
$$;

create or replace function public.reject_request(p_request uuid, p_response text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  r public.participation_requests;
begin
  select * into r from public.participation_requests where id = p_request for update;
  if r.id is null or r.status <> 'pending' then
    raise exception 'Solicitação não encontrada ou já respondida.' using errcode = 'P0001';
  end if;
  if not ((r.direction = 'request' and public.can_manage(r.organizer_company_id))
       or (r.direction = 'invite' and public.can_manage(r.vendor_company_id))) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  update public.participation_requests set status = 'rejected', decided_by = auth.uid(), decided_at = now(),
    response_message = p_response
  where id = p_request;
end;
$$;

-- ---------------------------------------------------------------------
-- Fluxo 2: organizador convida um feirante da plataforma (pelo e-mail)
-- ---------------------------------------------------------------------
create or replace function public.invite_vendor(p_participant uuid, p_email text, p_accept_terms boolean, p_message text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  p public.event_participants;
  e public.events;
  v_target uuid;
  v_count int;
  v_id uuid := gen_random_uuid();
begin
  select * into p from public.event_participants where id = p_participant;
  if p.id is null or not public.can_manage(p.company_id) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p.status = 'canceled' then
    raise exception 'A participação está cancelada.' using errcode = 'P0001';
  end if;
  if not coalesce(p_accept_terms, false) then
    raise exception 'É necessário aceitar o termo de permissão.' using errcode = 'P0001';
  end if;
  select * into e from public.events where id = p.event_id;

  -- Empresas feirantes ativas cujo e-mail da empresa ou do proprietário coincide
  select count(distinct c.id), min(c.id::text)::uuid into v_count, v_target
  from public.companies c
  left join public.memberships m on m.company_id = c.id and m.role = 'owner' and m.active
  left join auth.users u on u.id = m.user_id
  where c.kind = 'vendor' and c.status = 'active'
    and (lower(c.email) = lower(trim(p_email)) or lower(u.email) = lower(trim(p_email)));
  if v_count = 0 then
    raise exception 'Nenhuma empresa feirante da plataforma foi encontrada com este e-mail. O feirante continua cadastrado normalmente, sem vínculo.' using errcode = 'P0001';
  elsif v_count > 1 then
    raise exception 'Mais de uma empresa usa este e-mail. Peça ao feirante para solicitar participação pela área "Feiras disponíveis".' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.links where event_id = e.id and vendor_company_id = v_target and status = 'active') then
    raise exception 'Este feirante já está vinculado ao evento.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.vendors where company_id = p.company_id and linked_company_id = v_target and id <> p.vendor_id) then
    raise exception 'Esta empresa já está associada a outro cadastro de feirante.' using errcode = 'P0001';
  end if;

  insert into public.participation_requests (id, event_id, organizer_company_id, vendor_company_id, direction,
    message, organizer_vendor_id, participant_id, requested_by)
  values (v_id, e.id, p.company_id, v_target, 'invite', p_message, p.vendor_id, p.id, auth.uid());

  perform public._record_consent('link', p.company_id, e.id, '{}'::jsonb,
    jsonb_build_object('role', 'organizer', 'event_name', e.name,
      'organizer_company', (select name from public.companies where id = p.company_id),
      'vendor_company', (select name from public.companies where id = v_target)),
    null, v_id);
  return v_id;
end;
$$;

-- Convites e solicitações do feirante
create or replace function public.vendor_requests(p_company uuid)
returns setof jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.can_manage(p_company) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return query
    select jsonb_build_object(
      'id', r.id, 'event_id', r.event_id, 'direction', r.direction, 'status', r.status,
      'message', r.message, 'response_message', r.response_message, 'created_at', r.created_at,
      'decided_at', r.decided_at, 'link_id', r.link_id,
      'organizer_name', oc.name,
      'event_name', e.name,
      -- Para convites, o feirante vê os dados oficiais básicos do evento
      'event', case when r.direction = 'invite' then jsonb_build_object(
          'location_name', e.location_name, 'address', e.address, 'map_url', e.map_url,
          'first_day', (select min(day) from public.event_days where event_id = e.id),
          'last_day', (select max(day) from public.event_days where event_id = e.id))
        else (case when public._event_is_listed(e.id) then public._published_event_json(e.id) end) end,
      'participant', case when r.direction = 'invite' and r.status = 'pending' then (
        select jsonb_build_object('fee_mode', p.fee_mode, 'fee_cents', p.fee_cents, 'discount_cents', p.discount_cents,
          'due_date', p.due_date, 'total_cents', public._participant_total(p.id))
        from public.event_participants p where p.id = r.participant_id) end
    )
    from public.participation_requests r
    join public.events e on e.id = r.event_id
    join public.companies oc on oc.id = r.organizer_company_id
    where r.vendor_company_id = p_company
    order by (r.status = 'pending') desc, r.created_at desc;
end;
$$;

create or replace function public.accept_invite(p_request uuid, p_scope jsonb, p_accept_terms boolean)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  r public.participation_requests;
  e public.events;
  v_scope jsonb := public._normalize_vendor_scope(p_scope);
  v_link uuid := gen_random_uuid();
  v_consent uuid;
  v_org_consent uuid;
  v_version int;
begin
  select * into r from public.participation_requests where id = p_request for update;
  if r.id is null or r.direction <> 'invite' or r.status <> 'pending' then
    raise exception 'Convite não encontrado ou já respondido.' using errcode = 'P0001';
  end if;
  if not public.can_manage(r.vendor_company_id) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if not coalesce(p_accept_terms, false) then
    raise exception 'É necessário aceitar o termo de permissão.' using errcode = 'P0001';
  end if;
  select * into e from public.events where id = r.event_id;
  if r.participant_id is null or not exists (select 1 from public.event_participants where id = r.participant_id and status <> 'canceled') then
    raise exception 'A participação foi cancelada pelo organizador.' using errcode = 'P0001';
  end if;

  v_consent := public._record_consent('link', r.vendor_company_id, e.id, v_scope,
    jsonb_build_object('role', 'vendor', 'event_name', e.name,
      'organizer_company', (select name from public.companies where id = r.organizer_company_id),
      'vendor_company', (select name from public.companies where id = r.vendor_company_id)),
    v_link, r.id);
  select term_version into v_version from public.consent_records where id = v_consent;
  select id into v_org_consent from public.consent_records where request_id = r.id
    and company_id = r.organizer_company_id order by accepted_at desc limit 1;
  update public.consent_records set link_id = v_link, scope = v_scope where id = v_org_consent;

  perform set_config('app.system_write', 'on', true);
  update public.vendors set linked_company_id = r.vendor_company_id where id = r.organizer_vendor_id;
  perform set_config('app.system_write', 'off', true);

  insert into public.links (id, event_id, organizer_company_id, vendor_company_id, organizer_vendor_id,
    participant_id, scope, terms_version, organizer_consent_id, vendor_consent_id)
  values (v_link, e.id, r.organizer_company_id, r.vendor_company_id, r.organizer_vendor_id,
    r.participant_id, v_scope, v_version, v_org_consent, v_consent);

  update public.participation_requests set status = 'approved', decided_by = auth.uid(), decided_at = now(),
    vendor_scope = v_scope, link_id = v_link
  where id = r.id;
  return v_link;
end;
$$;

-- ---------------------------------------------------------------------
-- Vínculos: consulta, escopo, revogação
-- ---------------------------------------------------------------------
create or replace function public.my_links(p_company uuid)
returns setof jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.can_manage(p_company) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return query
    select jsonb_build_object(
      'id', l.id, 'event_id', l.event_id, 'event_name', e.name, 'status', l.status,
      'scope', l.scope, 'pending_scope', l.pending_scope,
      'pending_by_me', l.pending_by_company = p_company,
      'terms_version', l.terms_version, 'created_at', l.created_at, 'revoked_at', l.revoked_at,
      'revoke_reason', l.revoke_reason,
      'organizer_name', oc.name, 'vendor_name', vc.name,
      'my_side', case when l.organizer_company_id = p_company then 'organizer' else 'vendor' end,
      'vendor_edition_id', case when l.vendor_company_id = p_company then l.vendor_edition_id end,
      'participant_id', case when l.organizer_company_id = p_company then l.participant_id end,
      'first_day', (select min(day) from public.event_days where event_id = e.id),
      'unread_notices', case when l.vendor_company_id = p_company then (
        select count(*) from public.event_change_notices n where n.link_id = l.id and n.acknowledged_at is null) end
    )
    from public.links l
    join public.events e on e.id = l.event_id
    join public.companies oc on oc.id = l.organizer_company_id
    join public.companies vc on vc.id = l.vendor_company_id
    where l.organizer_company_id = p_company or l.vendor_company_id = p_company
    order by (l.status = 'active') desc, l.created_at desc;
end;
$$;

-- Feirante: dados acordados do evento (somente com vínculo ativo)
create or replace function public.vendor_link_view(p_link uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  l public.links;
begin
  select * into l from public.links where id = p_link;
  if l.id is null or not public.is_member(l.vendor_company_id) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if l.status <> 'active' then
    raise exception 'Este vínculo foi encerrado. Os dados do organizador não estão mais disponíveis.' using errcode = 'P0001';
  end if;
  return (
    select jsonb_build_object(
      'link_id', l.id,
      'event', jsonb_build_object('id', e.id, 'name', e.name, 'description', e.description,
        'location_name', e.location_name, 'address', e.address, 'map_url', e.map_url,
        'setup_info', e.setup_info, 'teardown_info', e.teardown_info,
        'arrival_instructions', e.arrival_instructions, 'rules', e.rules, 'status', e.status,
        'contact_name', e.contact_name, 'contact_phone', e.contact_phone, 'contact_email', e.contact_email,
        'organizer_name', (select name from public.companies where id = e.company_id)),
      'days', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'day', d.day, 'open_time', d.open_time,
          'close_time', d.close_time, 'setup_time', d.setup_time, 'teardown_time', d.teardown_time,
          'participating', exists (select 1 from public.event_participant_days pd
                                   where pd.participant_id = l.participant_id and pd.event_day_id = d.id),
          'stall', (select s.code from public.stall_assignments a join public.stalls s on s.id = a.stall_id
                    where a.participant_id = l.participant_id and a.event_day_id = d.id)) order by d.day), '[]'::jsonb)
        from public.event_days d where d.event_id = e.id),
      'participation', (select jsonb_build_object('status', p.status, 'fee_mode', p.fee_mode, 'fee_cents', p.fee_cents,
          'discount_cents', p.discount_cents, 'due_date', p.due_date, 'total_cents', public._participant_total(p.id),
          'paid_cents', coalesce((select sum(pp.amount_cents) from public.participant_payments pp
                                  where pp.participant_id = p.id and pp.canceled_at is null), 0),
          'payments', (select coalesce(jsonb_agg(jsonb_build_object('paid_date', pp.paid_date, 'amount_cents', pp.amount_cents)
                                       order by pp.paid_date), '[]'::jsonb)
                       from public.participant_payments pp where pp.participant_id = p.id and pp.canceled_at is null))
        from public.event_participants p where p.id = l.participant_id),
      'notices', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'change_type', n.change_type,
          'summary', n.summary, 'created_at', n.created_at, 'acknowledged_at', n.acknowledged_at)
          order by n.created_at desc), '[]'::jsonb)
        from public.event_change_notices n where n.link_id = l.id)
    )
    from public.events e where e.id = l.event_id
  );
end;
$$;

-- Organizador: dados do feirante autorizados no escopo (somente com vínculo ativo)
create or replace function public.organizer_link_vendor(p_link uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  l public.links;
begin
  select * into l from public.links where id = p_link;
  if l.id is null or not public.can_manage(l.organizer_company_id) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if l.status <> 'active' then
    raise exception 'Este vínculo foi encerrado.' using errcode = 'P0001';
  end if;
  return public._vendor_shared_json(l.vendor_company_id, l.scope);
end;
$$;

-- Propor novo escopo: exige aceite da outra parte; até lá vale o escopo anterior
create or replace function public.propose_link_scope(p_link uuid, p_scope jsonb, p_accept_terms boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  l public.links;
  v_company uuid;
  v_consent uuid;
begin
  select * into l from public.links where id = p_link for update;
  if l.id is null or l.status <> 'active' then
    raise exception 'Vínculo não encontrado ou encerrado.' using errcode = 'P0001';
  end if;
  if public.can_manage(l.vendor_company_id) then v_company := l.vendor_company_id;
  elsif public.can_manage(l.organizer_company_id) then v_company := l.organizer_company_id;
  else raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if not coalesce(p_accept_terms, false) then
    raise exception 'É necessário aceitar o termo de permissão.' using errcode = 'P0001';
  end if;
  v_consent := public._record_consent('link', v_company, l.event_id, public._normalize_vendor_scope(p_scope),
    jsonb_build_object('action', 'propose_scope'), l.id);
  update public.links set pending_scope = public._normalize_vendor_scope(p_scope),
    pending_by_company = v_company, pending_consent_id = v_consent
  where id = l.id;
end;
$$;

create or replace function public.respond_link_scope(p_link uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  l public.links;
  v_company uuid;
  v_consent uuid;
  v_version int;
begin
  select * into l from public.links where id = p_link for update;
  if l.id is null or l.status <> 'active' or l.pending_scope is null then
    raise exception 'Não há alteração de escopo pendente.' using errcode = 'P0001';
  end if;
  v_company := case when l.pending_by_company = l.vendor_company_id then l.organizer_company_id else l.vendor_company_id end;
  if not public.can_manage(v_company) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if coalesce(p_accept, false) then
    v_consent := public._record_consent('link', v_company, l.event_id, l.pending_scope,
      jsonb_build_object('action', 'accept_scope'), l.id);
    select term_version into v_version from public.consent_records where id = v_consent;
    update public.links set scope = l.pending_scope, terms_version = v_version,
      vendor_consent_id = case when v_company = l.vendor_company_id then v_consent else l.pending_consent_id end,
      organizer_consent_id = case when v_company = l.organizer_company_id then v_consent else l.pending_consent_id end,
      pending_scope = null, pending_by_company = null, pending_consent_id = null
    where id = l.id;
  else
    update public.links set pending_scope = null, pending_by_company = null, pending_consent_id = null where id = l.id;
  end if;
end;
$$;

-- Revogação: encerra compartilhamento e atualizações; não cancela participação nem pagamentos
create or replace function public.revoke_link(p_link uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  l public.links;
  v_company uuid;
begin
  select * into l from public.links where id = p_link for update;
  if l.id is null or l.status <> 'active' then
    raise exception 'Vínculo não encontrado ou já encerrado.' using errcode = 'P0001';
  end if;
  if public.can_manage(l.vendor_company_id) then v_company := l.vendor_company_id;
  elsif public.can_manage(l.organizer_company_id) then v_company := l.organizer_company_id;
  else raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  update public.links set status = 'revoked', revoked_at = now(), revoked_by = auth.uid(),
    revoked_by_company = v_company, revoke_reason = p_reason,
    pending_scope = null, pending_by_company = null, pending_consent_id = null
  where id = l.id;
end;
$$;

-- Feirante: adicionar o evento vinculado à agenda (nova edição) ou associar a uma
-- edição cadastrada manualmente (com confirmação na tela, sem duplicar).
create or replace function public.vendor_attach_link(p_link uuid, p_existing_edition uuid default null,
  p_fair_id uuid default null, p_apply_fee boolean default true)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  l public.links;
  e public.events;
  p public.event_participants;
  v_fair uuid;
  v_edition uuid;
  v_org text;
begin
  select * into l from public.links where id = p_link for update;
  if l.id is null or l.status <> 'active' or not public.can_manage(l.vendor_company_id) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  select * into e from public.events where id = l.event_id;
  select * into p from public.event_participants where id = l.participant_id;
  select name into v_org from public.companies where id = e.company_id;

  if p_existing_edition is not null then
    select id into v_edition from public.fair_editions where id = p_existing_edition and company_id = l.vendor_company_id;
    if v_edition is null then
      raise exception 'Edição inválida.' using errcode = 'P0001';
    end if;
    update public.fair_editions set linked_event_id = e.id, link_id = l.id,
      fee_mode = case when p_apply_fee then (case when p.discount_cents > 0 then 'per_event'::public.fee_mode else p.fee_mode end) else fee_mode end,
      fee_cents = case when p_apply_fee then (case when p.discount_cents > 0 then public._participant_total(p.id) else p.fee_cents end) else fee_cents end,
      fee_due_date = case when p_apply_fee then p.due_date else fee_due_date end
    where id = v_edition;
  else
    v_fair := p_fair_id;
    if v_fair is not null then
      perform public.assert_same_company('fairs', v_fair, l.vendor_company_id);
    else
      insert into public.fairs (company_id, name, organizer_name, organizer_phone, organizer_email, default_location_name, default_address)
      values (l.vendor_company_id, e.name, v_org, e.contact_phone, e.contact_email, e.location_name, e.address)
      returning id into v_fair;
    end if;
    insert into public.fair_editions (company_id, fair_id, name, location_name, address, map_url, organizer_contact,
      fee_mode, fee_cents, fee_due_date, status, linked_event_id, link_id)
    values (l.vendor_company_id, v_fair, e.name, e.location_name, e.address, e.map_url,
      concat_ws(' - ', e.contact_name, e.contact_phone),
      case when p.discount_cents > 0 then 'per_event'::public.fee_mode else p.fee_mode end,
      case when p.discount_cents > 0 then public._participant_total(p.id) else p.fee_cents end,
      p.due_date, case when p.status = 'confirmed' then 'confirmed' else 'planned' end, e.id, l.id)
    returning id into v_edition;
  end if;

  -- Dias do evento (participando conforme o organizador)
  insert into public.edition_days (company_id, edition_id, day, open_time, close_time, setup_time, teardown_time, participating)
  select l.vendor_company_id, v_edition, d.day, d.open_time, d.close_time, d.setup_time, d.teardown_time,
    exists (select 1 from public.event_participant_days pd where pd.participant_id = p.id and pd.event_day_id = d.id)
  from public.event_days d where d.event_id = e.id
  on conflict (edition_id, day) do update set open_time = excluded.open_time, close_time = excluded.close_time,
    setup_time = excluded.setup_time, teardown_time = excluded.teardown_time, participating = excluded.participating;

  update public.fair_editions set stall_label = (
    select string_agg(distinct s.code, ', ') from public.stall_assignments a join public.stalls s on s.id = a.stall_id
    where a.participant_id = p.id)
  where id = v_edition;

  update public.links set vendor_edition_id = v_edition where id = l.id;
  return v_edition;
end;
$$;

-- Feirante aplica os dados oficiais atuais à sua agenda (taxa só se escolher)
create or replace function public.vendor_apply_official(p_link uuid, p_apply_fee boolean default false)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  l public.links;
  e public.events;
  p public.event_participants;
begin
  select * into l from public.links where id = p_link;
  if l.id is null or l.status <> 'active' or not public.can_manage(l.vendor_company_id) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if l.vendor_edition_id is null then
    raise exception 'Adicione o evento à sua agenda primeiro.' using errcode = 'P0001';
  end if;
  select * into e from public.events where id = l.event_id;
  select * into p from public.event_participants where id = l.participant_id;
  update public.fair_editions set location_name = e.location_name, address = e.address, map_url = e.map_url,
    stall_label = (select string_agg(distinct s.code, ', ') from public.stall_assignments a
                   join public.stalls s on s.id = a.stall_id where a.participant_id = p.id),
    fee_mode = case when p_apply_fee then (case when p.discount_cents > 0 then 'per_event'::public.fee_mode else p.fee_mode end) else fee_mode end,
    fee_cents = case when p_apply_fee then (case when p.discount_cents > 0 then public._participant_total(p.id) else p.fee_cents end) else fee_cents end,
    fee_due_date = case when p_apply_fee then p.due_date else fee_due_date end
  where id = l.vendor_edition_id;
  delete from public.edition_days where edition_id = l.vendor_edition_id
    and day not in (select day from public.event_days where event_id = e.id);
  insert into public.edition_days (company_id, edition_id, day, open_time, close_time, setup_time, teardown_time, participating)
  select l.vendor_company_id, l.vendor_edition_id, d.day, d.open_time, d.close_time, d.setup_time, d.teardown_time,
    exists (select 1 from public.event_participant_days pd where pd.participant_id = p.id and pd.event_day_id = d.id)
  from public.event_days d where d.event_id = e.id
  on conflict (edition_id, day) do update set open_time = excluded.open_time, close_time = excluded.close_time,
    setup_time = excluded.setup_time, teardown_time = excluded.teardown_time, participating = excluded.participating;
  update public.event_change_notices set acknowledged_at = now() where link_id = l.id and acknowledged_at is null;
end;
$$;

create or replace function public.ack_notices(p_link uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_company uuid;
begin
  select vendor_company_id into v_company from public.links where id = p_link;
  if v_company is null or not public.is_member(v_company) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  update public.event_change_notices set acknowledged_at = now() where link_id = p_link and acknowledged_at is null;
end;
$$;

-- ---------------------------------------------------------------------
-- Avisos de alteração para feirantes vinculados
-- ---------------------------------------------------------------------
create or replace function public._notify_links(p_event uuid, p_participant uuid, p_type text, p_summary text,
  p_old jsonb, p_new jsonb)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.event_change_notices (link_id, event_id, vendor_company_id, change_type, summary, old_value, new_value)
  select l.id, l.event_id, l.vendor_company_id, p_type, p_summary, p_old, p_new
  from public.links l
  where l.event_id = p_event and l.status = 'active'
    and (p_participant is null or l.participant_id = p_participant);
$$;
revoke execute on function public._notify_links(uuid, uuid, text, text, jsonb, jsonb) from public, anon, authenticated;

create or replace function public.tg_events_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.location_name is distinct from old.location_name or new.address is distinct from old.address
     or new.map_url is distinct from old.map_url then
    perform public._notify_links(new.id, null, 'location', 'O local do evento foi alterado.',
      jsonb_build_object('location_name', old.location_name, 'address', old.address),
      jsonb_build_object('location_name', new.location_name, 'address', new.address));
  end if;
  if new.rules is distinct from old.rules or new.arrival_instructions is distinct from old.arrival_instructions
     or new.setup_info is distinct from old.setup_info or new.teardown_info is distinct from old.teardown_info then
    perform public._notify_links(new.id, null, 'rules', 'Regras ou orientações do evento foram atualizadas.', null, null);
  end if;
  if new.status is distinct from old.status and new.status in ('canceled', 'confirmed', 'completed') then
    perform public._notify_links(new.id, null, 'status', 'A situação do evento mudou para: ' ||
      case new.status when 'canceled' then 'cancelado' when 'confirmed' then 'confirmado' else 'concluído' end || '.',
      to_jsonb(old.status), to_jsonb(new.status));
  end if;
  if new.default_fee_cents is distinct from old.default_fee_cents or new.fee_mode is distinct from old.fee_mode then
    perform public._notify_links(new.id, null, 'fee',
      'A taxa padrão do evento foi alterada. O valor já combinado com você não muda automaticamente.',
      jsonb_build_object('fee_cents', old.default_fee_cents, 'fee_mode', old.fee_mode),
      jsonb_build_object('fee_cents', new.default_fee_cents, 'fee_mode', new.fee_mode));
  end if;
  return null;
end;
$$;
create trigger events_notify after update on public.events
  for each row execute function public.tg_events_notify();

create or replace function public.tg_event_days_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_event uuid := coalesce(new.event_id, old.event_id);
begin
  perform public._notify_links(v_event, null, 'date',
    case tg_op when 'INSERT' then 'Um novo dia foi adicionado ao evento: ' || to_char(new.day, 'DD/MM/YYYY')
               when 'DELETE' then 'Um dia foi removido do evento: ' || to_char(old.day, 'DD/MM/YYYY')
               else 'Datas ou horários do evento foram alterados (' || to_char(new.day, 'DD/MM/YYYY') || ').' end,
    case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end;
$$;
create trigger event_days_notify after insert or update or delete on public.event_days
  for each row execute function public.tg_event_days_notify();

create or replace function public.tg_participants_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.fee_cents is distinct from old.fee_cents or new.fee_mode is distinct from old.fee_mode
     or new.discount_cents is distinct from old.discount_cents or new.due_date is distinct from old.due_date then
    perform public._notify_links(new.event_id, new.id, 'fee', 'A taxa combinada ou o vencimento da sua participação foi alterado pelo organizador.',
      jsonb_build_object('fee_cents', old.fee_cents, 'fee_mode', old.fee_mode, 'discount_cents', old.discount_cents, 'due_date', old.due_date),
      jsonb_build_object('fee_cents', new.fee_cents, 'fee_mode', new.fee_mode, 'discount_cents', new.discount_cents, 'due_date', new.due_date));
  end if;
  if new.status is distinct from old.status then
    perform public._notify_links(new.event_id, new.id, 'status', 'A situação da sua participação mudou para: ' ||
      case new.status when 'canceled' then 'cancelada' when 'confirmed' then 'confirmada' else 'inscrita' end || '.',
      to_jsonb(old.status), to_jsonb(new.status));
  end if;
  return null;
end;
$$;
create trigger participants_notify after update on public.event_participants
  for each row execute function public.tg_participants_notify();

create or replace function public.tg_assignments_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public._notify_links(coalesce(new.event_id, old.event_id), coalesce(new.participant_id, old.participant_id),
    'stall', 'A barraca atribuída a você foi alterada.', null, null);
  return null;
end;
$$;
create trigger assignments_notify after insert or update or delete on public.stall_assignments
  for each row execute function public.tg_assignments_notify();

-- ---------------------------------------------------------------------
-- Página compartilhável (link público revogável/renovável)
-- ---------------------------------------------------------------------
create or replace function public.create_share_link(p_event uuid, p_options jsonb default '{}'::jsonb)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_company uuid;
  v_token text;
begin
  select company_id into v_company from public.events where id = p_event;
  if v_company is null or not public.can_manage(v_company) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  -- Renovar: desativa o link anterior (o endereço antigo deixa de funcionar)
  update public.share_links set active = false, revoked_at = now() where event_id = p_event and active;
  insert into public.share_links (company_id, event_id, show_description, show_dates, show_address, show_map_link,
    show_arrival, show_setup, show_stall_map, show_participant_names, show_contact)
  values (v_company, p_event,
    coalesce((p_options ->> 'show_description')::boolean, true),
    coalesce((p_options ->> 'show_dates')::boolean, true),
    coalesce((p_options ->> 'show_address')::boolean, true),
    coalesce((p_options ->> 'show_map_link')::boolean, true),
    coalesce((p_options ->> 'show_arrival')::boolean, true),
    coalesce((p_options ->> 'show_setup')::boolean, true),
    coalesce((p_options ->> 'show_stall_map')::boolean, true),
    coalesce((p_options ->> 'show_participant_names')::boolean, false),
    coalesce((p_options ->> 'show_contact')::boolean, false))
  returning token into v_token;
  return v_token;
end;
$$;

-- Atualiza o que fica público sem trocar o endereço do link
create or replace function public.update_share_link(p_event uuid, p_options jsonb)
returns void
language plpgsql security definer set search_path = ''
as $
declare
  v_company uuid;
begin
  select company_id into v_company from public.events where id = p_event;
  if v_company is null or not public.can_manage(v_company) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  update public.share_links set
    show_description = coalesce((p_options ->> 'show_description')::boolean, show_description),
    show_dates = coalesce((p_options ->> 'show_dates')::boolean, show_dates),
    show_address = coalesce((p_options ->> 'show_address')::boolean, show_address),
    show_map_link = coalesce((p_options ->> 'show_map_link')::boolean, show_map_link),
    show_arrival = coalesce((p_options ->> 'show_arrival')::boolean, show_arrival),
    show_setup = coalesce((p_options ->> 'show_setup')::boolean, show_setup),
    show_stall_map = coalesce((p_options ->> 'show_stall_map')::boolean, show_stall_map),
    show_participant_names = coalesce((p_options ->> 'show_participant_names')::boolean, show_participant_names),
    show_contact = coalesce((p_options ->> 'show_contact')::boolean, show_contact)
  where event_id = p_event and active;
end;
$;

create or replace function public.revoke_share_link(p_event uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_company uuid;
begin
  select company_id into v_company from public.events where id = p_event;
  if v_company is null or not public.can_manage(v_company) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  update public.share_links set active = false, revoked_at = now() where event_id = p_event and active;
end;
$$;

-- Acesso anônimo: retorna somente o que o organizador marcou como público
create or replace function public.get_shared_event(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  s public.share_links;
  e public.events;
begin
  select * into s from public.share_links where token = p_token and active;
  if s.id is null then return null; end if;
  select * into e from public.events where id = s.event_id;
  if e.id is null or e.status = 'draft'
     or (select status from public.companies where id = e.company_id) <> 'active' then
    return null;
  end if;
  return jsonb_build_object(
    'name', e.name,
    'status', e.status,
    'organizer_name', (select name from public.companies where id = e.company_id),
    'description', case when s.show_description then e.description end,
    'location_name', case when s.show_address then e.location_name end,
    'address', case when s.show_address then e.address end,
    'map_url', case when s.show_map_link then e.map_url end,
    'arrival_instructions', case when s.show_arrival then e.arrival_instructions end,
    'setup_info', case when s.show_setup then e.setup_info end,
    'teardown_info', case when s.show_setup then e.teardown_info end,
    'contact_name', case when s.show_contact then e.contact_name end,
    'contact_phone', case when s.show_contact then e.contact_phone end,
    'days', case when s.show_dates then (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'day', d.day,
        'open_time', d.open_time, 'close_time', d.close_time, 'setup_time', d.setup_time,
        'teardown_time', d.teardown_time) order by d.day), '[]'::jsonb)
      from public.event_days d where d.event_id = e.id) end,
    'map', case when s.show_stall_map then jsonb_build_object(
      'stalls', (select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'code', st.code, 'x', st.x, 'y', st.y,
          'w', st.w, 'h', st.h, 'color', t.color, 'type', t.name) order by st.code), '[]'::jsonb)
        from public.stalls st left join public.stall_types t on t.id = st.stall_type_id where st.event_id = e.id),
      'elements', (select coalesce(jsonb_agg(jsonb_build_object('kind', m.kind, 'label', m.label, 'x', m.x, 'y', m.y,
          'w', m.w, 'h', m.h)), '[]'::jsonb) from public.map_elements m where m.event_id = e.id),
      'occupancy', (select coalesce(jsonb_agg(jsonb_build_object('stall_id', a.stall_id, 'day_id', a.event_day_id,
          'status', case when p.status = 'confirmed' then 'confirmed' else 'reserved' end,
          'name', case when s.show_participant_names then v.trade_name end)), '[]'::jsonb)
        from public.stall_assignments a
        join public.event_participants p on p.id = a.participant_id
        join public.vendors v on v.id = p.vendor_id
        where a.event_id = e.id)
    ) end
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões de execução
-- ---------------------------------------------------------------------
revoke execute on function public.current_term(text) from public, anon;
revoke execute on function public.publish_event(uuid, jsonb, boolean) from public, anon;
revoke execute on function public.unpublish_event(uuid) from public, anon;
revoke execute on function public.list_available_events(uuid, text) from public, anon;
revoke execute on function public.get_available_event(uuid, uuid) from public, anon;
revoke execute on function public.request_participation(uuid, uuid, text, jsonb, boolean) from public, anon;
revoke execute on function public.cancel_request(uuid) from public, anon;
revoke execute on function public.organizer_requests(uuid) from public, anon;
revoke execute on function public.approve_request(uuid, boolean, uuid, public.fee_mode, bigint, bigint, date, uuid[], uuid, text) from public, anon;
revoke execute on function public.reject_request(uuid, text) from public, anon;
revoke execute on function public.invite_vendor(uuid, text, boolean, text) from public, anon;
revoke execute on function public.vendor_requests(uuid) from public, anon;
revoke execute on function public.accept_invite(uuid, jsonb, boolean) from public, anon;
revoke execute on function public.my_links(uuid) from public, anon;
revoke execute on function public.vendor_link_view(uuid) from public, anon;
revoke execute on function public.organizer_link_vendor(uuid) from public, anon;
revoke execute on function public.propose_link_scope(uuid, jsonb, boolean) from public, anon;
revoke execute on function public.respond_link_scope(uuid, boolean) from public, anon;
revoke execute on function public.revoke_link(uuid, text) from public, anon;
revoke execute on function public.vendor_attach_link(uuid, uuid, uuid, boolean) from public, anon;
revoke execute on function public.vendor_apply_official(uuid, boolean) from public, anon;
revoke execute on function public.ack_notices(uuid) from public, anon;
revoke execute on function public.create_share_link(uuid, jsonb) from public, anon;
revoke execute on function public.revoke_share_link(uuid) from public, anon;
revoke execute on function public.update_share_link(uuid, jsonb) from public, anon;
revoke execute on function public.get_shared_event(text) from public;
grant execute on function public.get_shared_event(text) to anon, authenticated;
