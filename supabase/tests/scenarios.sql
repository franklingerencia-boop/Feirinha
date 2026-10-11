-- =====================================================================
-- SR - Feirinhas | Testes de cenários no banco (RLS + regras de negócio)
-- Executa tudo dentro de um bloco que termina com exceção proposital,
-- desfazendo todas as alterações. Resultado esperado: "TODOS OS TESTES PASSARAM".
-- Uso: cole no SQL Editor do Supabase (ou execute via MCP/psql).
-- =====================================================================
do $test$
declare
  uA uuid := gen_random_uuid();  -- feirante A (proprietário)
  uB uuid := gen_random_uuid();  -- organizador B (proprietário)
  uC uuid := gen_random_uuid();  -- feirante C (outra empresa)
  uO uuid := gen_random_uuid();  -- operador da empresa A
  cA uuid; cB uuid; cC uuid;
  v_fair uuid; v_ed1 uuid; v_ed2 uuid; v_d3 uuid;
  v_prod uuid; v_cash uuid; v_bank uuid; v_pm_cash uuid;
  v_sale uuid; v_sale2 uuid;
  v_event uuid; v_day1 uuid; v_day2 uuid; v_s1 uuid; v_s2 uuid; v_s3 uuid;
  v_vend1 uuid; v_vend2 uuid; v_p1 uuid; v_p2 uuid;
  v_req uuid; v_link uuid; v_token text;
  v_int bigint; v_json jsonb; v_ok boolean; v_txt text;
begin
  -- ------------------------------------------------------------- setup
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, aud, role) values
    (uA, 'teste.a@exemplo.test', now(), '{"full_name":"Ana Feirante"}', 'authenticated', 'authenticated'),
    (uB, 'teste.b@exemplo.test', now(), '{"full_name":"Bruno Organizador"}', 'authenticated', 'authenticated'),
    (uC, 'teste.c@exemplo.test', now(), '{"full_name":"Carla Feirante"}', 'authenticated', 'authenticated'),
    (uO, 'teste.o@exemplo.test', now(), '{"full_name":"Otávio Operador"}', 'authenticated', 'authenticated');

  -- ===================== Empresa A (feirante) =====================
  perform set_config('request.jwt.claims', json_build_object('sub', uA, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  cA := public.create_company('vendor', 'Doces da Ana', 'Ana', '11999990000', 'teste.a@exemplo.test', 'São Paulo');
  update public.companies set phone = '11999990000', segment = 'Doces', products_summary = 'Brigadeiros' where id = cA;

  -- 1) Feira de vários dias com taxa diária: 3 dias x R$ 50,00 = R$ 150,00
  insert into public.fairs (company_id, name) values (cA, 'Feira da Praça') returning id into v_fair;
  insert into public.fair_editions (company_id, fair_id, name, fee_mode, fee_cents)
    values (cA, v_fair, 'Outubro', 'per_day', 5000) returning id into v_ed1;
  insert into public.edition_days (company_id, edition_id, day) values
    (cA, v_ed1, date '2026-10-17'), (cA, v_ed1, date '2026-10-18');
  insert into public.edition_days (company_id, edition_id, day) values (cA, v_ed1, date '2026-10-19') returning id into v_d3;
  select amount_cents into v_int from public.transactions where source_type = 'fair_fee' and source_id = v_ed1;
  if v_int <> 15000 then raise exception 'FALHA 1: taxa diária esperada 15000, obtida %', v_int; end if;
  update public.edition_days set participating = false where id = v_d3;
  select amount_cents into v_int from public.transactions where source_type = 'fair_fee' and source_id = v_ed1;
  if v_int <> 10000 then raise exception 'FALHA 1b: após remover um dia esperado 10000, obtido %', v_int; end if;

  -- 2) Taxa única não é multiplicada pelos dias
  insert into public.fair_editions (company_id, fair_id, name, fee_mode, fee_cents)
    values (cA, v_fair, 'Novembro', 'per_event', 8000) returning id into v_ed2;
  insert into public.edition_days (company_id, edition_id, day) values
    (cA, v_ed2, date '2026-11-07'), (cA, v_ed2, date '2026-11-08'), (cA, v_ed2, date '2026-11-09');
  select amount_cents into v_int from public.transactions where source_type = 'fair_fee' and source_id = v_ed2;
  if v_int <> 8000 then raise exception 'FALHA 2: taxa única esperada 8000, obtida %', v_int; end if;
  if public.edition_fee_total(v_ed2) <> 8000 then raise exception 'FALHA 2b'; end if;

  -- 3) Venda gera um único lançamento (inclusive com clique repetido)
  insert into public.products (company_id, name, price_cents, cost_cents, packaging_cost_cents)
    values (cA, 'Brigadeiro', 1000, 300, 100) returning id into v_prod;
  select id into v_cash from public.accounts where company_id = cA and kind = 'cash';
  select id into v_pm_cash from public.payment_methods where company_id = cA and system_code = 'cash';
  v_sale := public.create_sale(cA, 'idem-teste-0001', jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 3)), v_pm_cash, v_cash);
  v_sale2 := public.create_sale(cA, 'idem-teste-0001', jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 3)), v_pm_cash, v_cash);
  if v_sale <> v_sale2 then raise exception 'FALHA 3: clique repetido criou outra venda'; end if;
  select count(*) into v_int from public.sales where company_id = cA;
  if v_int <> 1 then raise exception 'FALHA 3b: % vendas', v_int; end if;
  select count(*) into v_int from public.transactions where source_type = 'sale' and source_id = v_sale;
  if v_int <> 1 then raise exception 'FALHA 3c: % lançamentos para a venda', v_int; end if;
  select amount_cents into v_int from public.transactions where source_type = 'sale' and source_id = v_sale;
  if v_int <> 3000 then raise exception 'FALHA 3d: valor %', v_int; end if;
  select total_cost_cents into v_int from public.sale_items where sale_id = v_sale;
  if v_int <> 1200 then raise exception 'FALHA 3e: custo histórico %', v_int; end if;
  -- custo histórico preservado após mudança de preço
  update public.products set price_cents = 1500, cost_cents = 500 where id = v_prod;
  select unit_price_cents into v_int from public.sale_items where sale_id = v_sale;
  if v_int <> 1000 then raise exception 'FALHA 3f: preço histórico alterado'; end if;

  -- 4) Transferência altera saldos sem aumentar faturamento
  insert into public.accounts (company_id, name, kind) values (cA, 'Banco', 'bank') returning id into v_bank;
  insert into public.transfers (company_id, from_account_id, to_account_id, amount_cents, transfer_date)
    values (cA, v_cash, v_bank, 1000, date '2026-10-10');
  select balance_cents into v_int from public.account_balances(cA) where id = v_cash;
  if v_int <> 2000 then raise exception 'FALHA 4: saldo caixa %', v_int; end if;
  select balance_cents into v_int from public.account_balances(cA) where id = v_bank;
  if v_int <> 1000 then raise exception 'FALHA 4b: saldo banco %', v_int; end if;
  v_json := public.vendor_dashboard(cA, date '2026-01-01', date '2026-12-31');
  if (v_json ->> 'revenue_cents')::bigint <> 3000 then raise exception 'FALHA 4c: faturamento %', v_json ->> 'revenue_cents'; end if;
  if (v_json ->> 'other_income_cents')::bigint <> 0 then raise exception 'FALHA 4d: transferência virou receita'; end if;
  if (v_json ->> 'cogs_cents')::bigint <> 1200 then raise exception 'FALHA 4e: CMV %', v_json ->> 'cogs_cents'; end if;

  -- 4f) Cancelamento rastreável
  perform public.cancel_sale(v_sale, 'Cliente desistiu');
  select status::text into v_txt from public.transactions where source_type = 'sale' and source_id = v_sale;
  if v_txt <> 'canceled' then raise exception 'FALHA 4f: lançamento não cancelado'; end if;
  select balance_cents into v_int from public.account_balances(cA) where id = v_cash;
  if v_int <> -1000 then raise exception 'FALHA 4g: saldo após cancelamento %', v_int; end if;

  -- ===================== Empresa B (organizador) =====================
  perform set_config('request.jwt.claims', json_build_object('sub', uB, 'role', 'authenticated')::text, true);
  cB := public.create_company('organizer', 'Feiras do Bruno', 'Bruno', '11888880000', 'teste.b@exemplo.test', 'São Paulo');

  -- 5) Evento e barracas disponíveis
  insert into public.events (company_id, name, location_name, address, map_url, status, default_fee_cents, fee_mode, contact_name, contact_phone)
    values (cB, 'Feira de Primavera', 'Praça Central', 'Rua das Flores, 100', 'https://maps.example/x', 'open', 6000, 'per_event', 'Bruno', '11888880000')
    returning id into v_event;
  insert into public.event_days (company_id, event_id, day, open_time, close_time) values (cB, v_event, date '2026-10-24', '09:00', '17:00') returning id into v_day1;
  insert into public.event_days (company_id, event_id, day, open_time, close_time) values (cB, v_event, date '2026-10-25', '09:00', '17:00') returning id into v_day2;
  insert into public.stalls (company_id, event_id, code) values (cB, v_event, 'A1') returning id into v_s1;
  insert into public.stalls (company_id, event_id, code) values (cB, v_event, 'A2') returning id into v_s2;
  insert into public.stalls (company_id, event_id, code) values (cB, v_event, 'A3') returning id into v_s3;
  -- feirantes sem conta na plataforma
  insert into public.vendors (company_id, trade_name, phone) values (cB, 'Pastel do Zé', '11777770000') returning id into v_vend1;
  insert into public.vendors (company_id, trade_name) values (cB, 'Artesanato Lu') returning id into v_vend2;
  insert into public.event_participants (company_id, event_id, vendor_id, fee_mode, fee_cents, status, due_date)
    values (cB, v_event, v_vend1, 'per_day', 3000, 'confirmed', date '2026-10-20') returning id into v_p1;
  insert into public.event_participants (company_id, event_id, vendor_id, fee_mode, fee_cents, status)
    values (cB, v_event, v_vend2, 'per_event', 6000, 'registered') returning id into v_p2;
  insert into public.event_participant_days (company_id, participant_id, event_day_id) values
    (cB, v_p1, v_day1), (cB, v_p1, v_day2), (cB, v_p2, v_day1);
  if public.participant_total(v_p1) <> 6000 then raise exception 'FALHA 5: total por dia do participante'; end if;
  if public.participant_total(v_p2) <> 6000 then raise exception 'FALHA 5b: total único do participante'; end if;
  insert into public.stall_assignments (company_id, event_id, stall_id, participant_id, event_day_id)
    values (cB, v_event, v_s1, v_p1, v_day1);
  v_json := public.organizer_dashboard(cB, date '2026-10-01', date '2026-10-31');
  if ((v_json -> 'events' -> 0) ->> 'available_slots')::int <> 5 then
    raise exception 'FALHA 5c: vagas disponíveis %', (v_json -> 'events' -> 0) ->> 'available_slots';
  end if;

  -- 6) Dois participantes não ocupam a mesma barraca no mesmo dia
  v_ok := false;
  begin
    insert into public.stall_assignments (company_id, event_id, stall_id, participant_id, event_day_id)
      values (cB, v_event, v_s1, v_p2, v_day1);
  exception when unique_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA 6: reserva conflitante aceita'; end if;
  -- mesma barraca em outro dia é permitida
  insert into public.stall_assignments (company_id, event_id, stall_id, participant_id, event_day_id)
    values (cB, v_event, v_s1, v_p1, v_day2);

  -- Pagamento parcial gera receita única
  insert into public.participant_payments (company_id, participant_id, amount_cents, paid_date, account_id)
    select cB, v_p1, 2500, date '2026-10-10', id from public.accounts where company_id = cB and kind = 'cash';
  select count(*) into v_int from public.transactions where company_id = cB and source_type = 'charge_payment';
  if v_int <> 1 then raise exception 'FALHA 6b: lançamentos de pagamento %', v_int; end if;

  -- 7) Publicação: só aparece com termo aceito
  v_ok := false;
  begin
    perform public.publish_event(v_event, '{}'::jsonb, false);
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA 7: publicou sem aceite'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', uA, 'role', 'authenticated')::text, true);
  select count(*) into v_int from public.list_available_events(cA);
  if v_int <> 0 then raise exception 'FALHA 7b: evento não publicado apareceu'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', uB, 'role', 'authenticated')::text, true);
  perform public.publish_event(v_event, '{"show_fees": true, "show_contact": false}'::jsonb, true);

  perform set_config('request.jwt.claims', json_build_object('sub', uA, 'role', 'authenticated')::text, true);
  select count(*) into v_int from public.list_available_events(cA);
  if v_int <> 1 then raise exception 'FALHA 7c: evento publicado não apareceu'; end if;
  select x into v_json from public.list_available_events(cA) x limit 1;
  if v_json ->> 'contact_phone' is not null then raise exception 'FALHA 7d: contato exposto sem autorização'; end if;

  -- 8) Solicitação depende de aprovação
  v_req := public.request_participation(cA, v_event, 'Quero participar', '{"vendor_fields":["phone","segment"]}'::jsonb, true);
  select count(*) into v_int from public.links where event_id = v_event;
  if v_int <> 0 then raise exception 'FALHA 8: vínculo criado sem aprovação'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', uB, 'role', 'authenticated')::text, true);
  v_ok := false;
  begin
    perform public.approve_request(v_req, false);
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA 8b: aprovou sem aceite do organizador'; end if;
  v_link := public.approve_request(v_req, true, null, 'per_event', 5000, 0, date '2026-10-20', array[v_day1, v_day2]);

  -- 9) Cada parte vê apenas o autorizado
  v_json := public.organizer_link_vendor(v_link);
  if v_json ->> 'phone' is null or v_json ->> 'email' is not null then
    raise exception 'FALHA 9: escopo do feirante não respeitado: %', v_json;
  end if;
  select count(*) into v_int from public.sales where company_id = cA;
  if v_int <> 0 then raise exception 'FALHA 9b: organizador viu vendas do feirante'; end if;
  select count(*) into v_int from public.accounts where company_id = cA;
  if v_int <> 0 then raise exception 'FALHA 9c: organizador viu contas do feirante'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', uA, 'role', 'authenticated')::text, true);
  v_json := public.vendor_link_view(v_link);
  if (v_json -> 'participation' ->> 'fee_cents')::bigint <> 5000 then raise exception 'FALHA 9d: taxa acordada'; end if;
  if v_json -> 'event' ->> 'address' <> 'Rua das Flores, 100' then raise exception 'FALHA 9e: dados do evento'; end if;
  select count(*) into v_int from public.vendors where company_id = cB;
  if v_int <> 0 then raise exception 'FALHA 9f: feirante viu cadastro do organizador'; end if;

  -- Alteração de taxa padrão gera aviso e não muda valor acordado
  perform set_config('request.jwt.claims', json_build_object('sub', uB, 'role', 'authenticated')::text, true);
  update public.events set default_fee_cents = 9000 where id = v_event;
  perform set_config('request.jwt.claims', json_build_object('sub', uA, 'role', 'authenticated')::text, true);
  v_json := public.vendor_link_view(v_link);
  if (v_json -> 'participation' ->> 'fee_cents')::bigint <> 5000 then raise exception 'FALHA 9g: nova taxa substituiu a acordada'; end if;
  if jsonb_array_length(v_json -> 'notices') < 1 then raise exception 'FALHA 9h: alteração não sinalizada'; end if;

  -- 10) Empresa C não acessa dados de A
  perform set_config('request.jwt.claims', json_build_object('sub', uC, 'role', 'authenticated')::text, true);
  cC := public.create_company('vendor', 'Bolos da Carla');
  select count(*) into v_int from public.products where company_id = cA;
  if v_int <> 0 then raise exception 'FALHA 10: C viu produtos de A'; end if;
  select count(*) into v_int from public.transactions where company_id = cA;
  if v_int <> 0 then raise exception 'FALHA 10b: C viu lançamentos de A'; end if;
  v_ok := false;
  begin
    insert into public.products (company_id, name, price_cents) values (cA, 'Invasor', 1);
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA 10c: C inseriu produto em A'; end if;
  v_ok := false;
  begin
    perform public.vendor_dashboard(cA, date '2026-01-01', date '2026-12-31');
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA 10d: C leu painel de A'; end if;
  v_ok := false;
  begin
    perform public.vendor_link_view(v_link);
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA 10e: C leu vínculo de A'; end if;
  v_ok := false;
  begin
    perform public.create_sale(cA, 'idem-invasor-01', jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)), v_pm_cash, v_cash);
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA 10f: C registrou venda em A'; end if;

  -- 11) Operador: registra vendas, sem acesso financeiro
  reset role;
  insert into public.memberships (company_id, user_id, role) values (cA, uO, 'operator');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', uO, 'role', 'authenticated')::text, true);
  select count(*) into v_int from public.pos_products(cA);
  if v_int <> 1 then raise exception 'FALHA 11: operador não vê produtos no PDV'; end if;
  perform public.create_sale(cA, 'idem-operador-1', jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)), v_pm_cash, v_cash);
  select count(*) into v_int from public.transactions where company_id = cA;
  if v_int <> 0 then raise exception 'FALHA 11b: operador viu lançamentos'; end if;
  v_ok := false;
  begin
    perform public.account_balances(cA);
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA 11c: operador viu saldos'; end if;

  -- 12) Link público mostra só o autorizado; revogação e retirada interrompem acesso
  perform set_config('request.jwt.claims', json_build_object('sub', uB, 'role', 'authenticated')::text, true);
  v_token := public.create_share_link(v_event, '{"show_contact": false, "show_participant_names": false}'::jsonb);
  reset role;
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_json := public.get_shared_event(v_token);
  if v_json is null or v_json ->> 'name' <> 'Feira de Primavera' then raise exception 'FALHA 12: link público'; end if;
  if v_json ->> 'contact_phone' is not null then raise exception 'FALHA 12b: contato exposto'; end if;
  if v_json::text ilike '%Pastel do Zé%' then raise exception 'FALHA 12c: nome de participante exposto'; end if;
  if v_json::text ilike '%fee%' or v_json::text ilike '%amount%' then raise exception 'FALHA 12d: dados financeiros expostos'; end if;
  select count(*) into v_int from public.events;
  if v_int <> 0 then raise exception 'FALHA 12e: anônimo leu eventos'; end if;

  reset role;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', uB, 'role', 'authenticated')::text, true);
  perform public.revoke_share_link(v_event);
  if public.get_shared_event(v_token) is not null then raise exception 'FALHA 12f: link revogado ainda funciona'; end if;

  -- Revogação do vínculo: encerra compartilhamento, preserva participação e pagamentos
  perform set_config('request.jwt.claims', json_build_object('sub', uA, 'role', 'authenticated')::text, true);
  perform public.revoke_link(v_link, 'Teste');
  v_ok := false;
  begin
    perform public.vendor_link_view(v_link);
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA 13: vínculo revogado ainda compartilha'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uB, 'role', 'authenticated')::text, true);
  select count(*) into v_int from public.event_participants
    where event_id = v_event and status <> 'canceled' and vendor_id in (select id from public.vendors where linked_company_id = cA);
  if v_int <> 1 then raise exception 'FALHA 13b: revogação cancelou a participação'; end if;
  v_ok := false;
  begin
    perform public.organizer_link_vendor(v_link);
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHA 13c: organizador ainda vê dados após revogação'; end if;

  -- Retirada da publicação
  perform public.unpublish_event(v_event);
  perform set_config('request.jwt.claims', json_build_object('sub', uA, 'role', 'authenticated')::text, true);
  select count(*) into v_int from public.list_available_events(cA);
  if v_int <> 0 then raise exception 'FALHA 14: evento retirado continua listado'; end if;

  reset role;
  raise exception 'TODOS OS TESTES PASSARAM (alterações desfeitas)';
end;
$test$;
