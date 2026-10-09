-- Reservas unificadas, fase 3 (09/10/2026): o detalhe da reserva do site white-label no layout do
-- Hub. Spec: docs/specs/reservas-unificadas-hub-wl.md § 4.2 e D1.
--
--   1. `wl_booking_detail(p_id)`: uma reserva do site com o status já no vocabulário do Hub (D2),
--      a unidade, o tipo de vaga e a linha do tempo das ações feitas pelo Hub (comparecimento e
--      troca de placa), com quem fez. SECURITY DEFINER só para ler o nome de quem fez (a RLS de
--      `profiles` não deixa o parceiro ler o perfil de outra pessoa); o recorte é o mesmo da lista,
--      `wl_visible_company_ids()`. Ação feita pela equipe da Movepark aparece para o parceiro como
--      "Equipe Movepark", sem o nome.
--   2. A leitura de `wl_booking_action_log` passa a seguir a mesma regra da `wl_booking` (só
--      empresa com white-label), no lugar do `member_has_scope` por linha.

drop policy if exists wl_booking_action_log_select on public.wl_booking_action_log;
create policy wl_booking_action_log_select on public.wl_booking_action_log for select to authenticated
  using (company_id = any ((select public.wl_visible_company_ids())::uuid[]));

create or replace function public.wl_booking_detail(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_admin boolean := public.is_hub_admin();
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;

  select jsonb_build_object(
           'id', w.id, 'company_id', w.company_id, 'company_name', c.name,
           'wl_order_id', w.wl_order_id, 'wl_order_number', w.wl_order_number,
           'status', public.wl_booking_hub_status(w.status, w.attendance_status, w.check_out_at),
           'site_status', w.status, 'wl_status', w.wl_status, 'origin', w.origin,
           'attendance_status', w.attendance_status, 'attendance_marked_at', w.attendance_marked_at,
           'customer_name', w.customer_name, 'customer_email', w.customer_email,
           'customer_phone', w.customer_phone, 'license_plate', w.license_plate,
           'check_in_at', w.check_in_at, 'check_out_at', w.check_out_at,
           'passenger_count', w.passenger_count, 'has_pcd', w.has_pcd, 'is_duplicate', w.is_duplicate,
           'total_cents', w.total_cents, 'paid_total_cents', w.paid_total_cents,
           'location_id', w.location_id, 'location_name', l.name,
           'location_parking_type_id', w.location_parking_type_id, 'parking_type_name', pt.name,
           'category_slug', w.category_slug, 'product_slug', w.product_slug,
           'utm', w.utm, 'wl_created_at', w.wl_created_at, 'wl_updated_at', w.wl_updated_at,
           'synced_at', w.synced_at,
           'actions', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', a.id, 'action', a.action, 'request', a.request, 'result', a.result,
                      'result_code', a.result_code, 'message', a.message, 'created_at', a.created_at,
                      'by_name', case
                                   when a.requested_by is null then null
                                   when v_admin or a.requested_by = auth.uid() then coalesce(p.full_name, 'Sem nome')
                                   when p.role = 'hub_admin' then 'Equipe Movepark'
                                   else coalesce(p.full_name, 'Sem nome')
                                 end)
                    order by a.created_at desc)
               from public.wl_booking_action_log a
               left join public.profiles p on p.id = a.requested_by
              where a.wl_booking_id = w.id), '[]'::jsonb))
    into v_result
    from public.wl_booking w
    join public.company c on c.id = w.company_id
    left join public.location l on l.id = w.location_id
    left join public.location_parking_type lpt on lpt.id = w.location_parking_type_id
    left join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
    left join public.parking_type pt on pt.id = cpt.parking_type_id
   where w.id = p_id
     and w.company_id = any (public.wl_visible_company_ids());

  return v_result;
end $function$;

comment on function public.wl_booking_detail(uuid) is
  'Detalhe de uma reserva do site white-label (fase 3 das reservas unificadas): status no vocabulário do Hub, unidade, vaga e as ações do Hub com quem fez. Recorte: wl_visible_company_ids().';

revoke all on function public.wl_booking_detail(uuid) from public, anon;
grant execute on function public.wl_booking_detail(uuid) to authenticated;
