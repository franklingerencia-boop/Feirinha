-- =====================================================================
-- SR - Feirinhas | 0007 - Endurecimento de permissões
-- Funções de gatilho não precisam de EXECUTE para disparar; auxiliares de
-- permissão só são usados por usuários autenticados (políticas RLS).
-- =====================================================================
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end;
$$;

revoke execute on function public.can_finance(uuid) from public, anon;
revoke execute on function public.can_manage(uuid) from public, anon;
revoke execute on function public.can_settings(uuid) from public, anon;
revoke execute on function public.company_kind_of(uuid) from public, anon;
revoke execute on function public.company_today(uuid) from public, anon;
revoke execute on function public.has_role(uuid, public.member_role[]) from public, anon;
revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.is_platform_admin() from public, anon;

-- Funções que nunca devem ser chamadas diretamente por clientes
revoke execute on function public.try_uuid(text) from public, anon;
revoke execute on function public.product_unit_cost(public.products) from public, anon;
revoke execute on function public._normalize_vendor_scope(jsonb) from public, anon;
