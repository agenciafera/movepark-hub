-- Tela de saúde do white-label: a entrega leva o código da reserva.
-- Spec: docs/specs/shared-availability.md (§ Saúde da integração).
--
-- A tela da reserva no Manager abre por código (/manager/bookings/<code>), e a fila só guarda o
-- id dentro do `event_id`. Sem o código, a linha da entrega não teria para onde levar.
-- `left join`: reserva apagada (hard delete) segue aparecendo, só sem o link.

-- Tudo o que a tela /manager/white-label mostra, numa chamada.
create or replace function public.manager_wl_health()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.is_hub_admin() then
    raise exception 'Apenas a equipe Movepark lê a saúde do white-label.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'health', public.wl_integration_health(now()),
    'deliveries', coalesce((
      select jsonb_agg(x order by x.created_at desc)
        from (
          select d.id, d.event_id, d.operation, d.status, d.attempts, d.max_attempts,
                 d.last_status, d.last_error, d.next_attempt_at, d.created_at,
                 d.payload->>'start_date' as start_date, d.payload->>'end_date' as end_date,
                 split_part(split_part(d.event_id, ':', 1), '#', 1) as booking_id,
                 b.code as booking_code,
                 c.name as company_name
            from public.wl_delivery d
            join public.company c on c.id = d.company_id
            left join public.booking b on b.id::text = split_part(split_part(d.event_id, ':', 1), '#', 1)
           where d.status = 'failed'
              or (d.status = 'pending' and d.created_at < now() - interval '10 minutes')
           order by d.created_at desc
           limit 100
        ) x
    ), '[]'::jsonb),
    'recent', (
      select jsonb_build_object(
        'delivered_24h', count(*) filter (where status = 'delivered' and delivered_at > now() - interval '24 hours'),
        'pending', count(*) filter (where status = 'pending'),
        'last_delivered_at', max(delivered_at)
      ) from public.wl_delivery
    ),
    'units', coalesce((
      select jsonb_agg(u order by u.company_name, u.location_name, u.parking_type_name)
        from (
          select lpt.id as location_parking_type_id,
                 c.name as company_name, l.name as location_name, pt.name as parking_type_name,
                 l.checkout_mode, c.wl_sync_enabled,
                 lpt.wl_category_slug, lpt.wl_product_slug,
                 (rt.location_parking_type_id is not null) as reconcile_expected,
                 s.reconciled_at, s.reconcile_error, s.reconcile_error_at,
                 pr.mirror_status, pr.mirror_verified_at, pr.mirror_sampled_at, pr.mirror_error
            from public.wl_mirror_target mt
            full join public.wl_reconcile_target rt using (location_parking_type_id)
            join public.location_parking_type lpt on lpt.id = coalesce(mt.location_parking_type_id, rt.location_parking_type_id)
            join public.location l on l.id = lpt.location_id
            join public.company c on c.id = l.company_id
            join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
            join public.parking_type pt on pt.id = cpt.parking_type_id
            left join public.wl_sync_state s on s.location_parking_type_id = lpt.id
            left join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
        ) u
    ), '[]'::jsonb)
  );
end $function$;

revoke all on function public.manager_wl_health() from public, anon;
grant execute on function public.manager_wl_health() to authenticated;
