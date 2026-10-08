-- Reservas do site white-label no painel do parceiro, fase 2: leitura no Operator.
-- Spec: docs/specs/reservas-wl-no-hub.md (§ 9). Fase 1: 20261128233000_wl_booking_importacao.sql.
--
-- O parceiro vê, na tela de Reservas, as reservas que o próprio site dele vendeu, numa aba à
-- parte ("Pelo seu site"), só leitura. Ações (comparecimento, check-in, placa) dependem de rotas
-- novas no legado e ficam para a fase 4.
--
-- Escopo próprio, `wl-bookings:read` (ADR-005): os quatro papéis recebem, inclusive Financeiro,
-- que vê reservas mas não opera. Não é atribuível a chave de API: não há rota nem tool que o use,
-- e o guard de escopo órfão (lint:openapi) reprovaria.
--
-- A leitura é por RPC SECURITY DEFINER com o gate no servidor, e não por PostgREST na tabela: a
-- RLS de `wl_booking` segue só de hub_admin, e o único caminho do parceiro é este, que já devolve
-- os nomes de unidade e vaga e aplica os filtros da tela.

insert into public.api_scope (scope, module, description, assignable_to_api_key) values
  ('wl-bookings:read', 'bookings', 'Ver as reservas feitas no site white-label da empresa', false)
on conflict (scope) do update set
  module = excluded.module,
  description = excluded.description,
  assignable_to_api_key = excluded.assignable_to_api_key;

-- O Dono precisa da linha explícita: `member_has_scope` lê o pacote do papel, e a invariante
-- "o Dono tem todo escopo de empresa" (permissions.test.sql) quebraria sem ela.
insert into public.company_role_scope (role, scope) values
  ('owner', 'wl-bookings:read'),
  ('manager', 'wl-bookings:read'),
  ('operator', 'wl-bookings:read'),
  ('finance', 'wl-bookings:read')
on conflict do nothing;

-- Lista para a aba "Pelo seu site". Só devolve reserva de empresa em que quem chama tem o escopo
-- (hub_admin vê todas; impersonando, a tela passa a empresa em p_company_id). Filtra por empresa,
-- e não por unidade, para não esconder a reserva que veio sem De/Para (sem unidade).
create or replace function public.operator_wl_bookings(
  p_company_id uuid default null,
  p_status text default null,
  p_search text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_admin boolean := public.is_hub_admin();
  v_busca text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(x order by x.check_in_at desc nulls last, x.wl_order_number desc)
      from (
        select w.id, w.company_id, w.wl_order_number, w.status, w.wl_status, w.origin,
               w.check_in_at, w.check_out_at, w.license_plate, w.passenger_count, w.has_pcd,
               w.total_cents, w.paid_total_cents, w.attendance_status, w.attendance_marked_at,
               w.customer_name, w.customer_email, w.customer_phone,
               w.wl_created_at, w.synced_at,
               w.location_id, l.name as location_name,
               w.location_parking_type_id, pt.name as parking_type_name,
               w.category_slug, w.product_slug
          from public.wl_booking w
          left join public.location l on l.id = w.location_id
          left join public.location_parking_type lpt on lpt.id = w.location_parking_type_id
          left join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
          left join public.parking_type pt on pt.id = cpt.parking_type_id
         where (v_admin or public.member_has_scope(w.company_id, 'wl-bookings:read'))
           and (p_company_id is null or w.company_id = p_company_id)
           and (p_status is null or w.status = p_status)
           and (p_from is null or w.check_in_at >= p_from)
           and (p_to is null or w.check_in_at <= p_to)
           and (
             v_busca is null
             or w.wl_order_number ilike '%' || v_busca || '%'
             or replace(upper(coalesce(w.license_plate, '')), '-', '') like '%' || replace(upper(v_busca), '-', '') || '%'
           )
         order by w.check_in_at desc nulls last, w.wl_order_number desc
         limit greatest(1, least(coalesce(p_limit, 200), 500))
      ) x
  ), '[]'::jsonb);
end $function$;

revoke all on function public.operator_wl_bookings(uuid, text, text, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.operator_wl_bookings(uuid, text, text, timestamptz, timestamptz, integer) to authenticated;

-- Quantas reservas do site existem para quem chama: a aba só aparece quando há alguma. Enquanto
-- a importação estiver desligada, ou para empresa sem site, devolve zero e a tela não muda.
create or replace function public.operator_wl_bookings_count(p_company_id uuid default null)
returns integer
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select case when auth.uid() is null then 0 else (
    select count(*)::integer
      from public.wl_booking w
     where (public.is_hub_admin() or public.member_has_scope(w.company_id, 'wl-bookings:read'))
       and (p_company_id is null or w.company_id = p_company_id)
  ) end;
$function$;

revoke all on function public.operator_wl_bookings_count(uuid) from public, anon;
grant execute on function public.operator_wl_bookings_count(uuid) to authenticated;
