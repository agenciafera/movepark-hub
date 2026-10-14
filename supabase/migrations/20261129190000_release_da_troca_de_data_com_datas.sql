-- Troca de data no Hub não liberava a vaga antiga no white-label (14/10/2026).
-- Spec: docs/specs/shared-availability.md, tarifas-operacao.md (2.8).
--
-- `wl_enqueue_dates_changed` enfileirava o `release` do id antigo sem `start_date`/`end_date`. O
-- endpoint do WL (`AvailabilityIntegrationController::sync`) exige `start_date` e decrementa
-- exatamente os dias informados, então o release voltava 422 seis vezes e virava `failed`: a vaga
-- antiga ficava contada no site para sempre. Apareceu em 13/10 (Nationpark e BePark), as duas
-- primeiras trocas de data em empresa com sync ligado.
--
-- O release passa a levar as datas que o `reserve` daquele mesmo id mandou (é isso que o WL
-- contou). A função roda depois de a reserva já ter as datas novas, então ler da `booking` daria o
-- período errado. Sem `reserve` do id antigo na fila, o WL nunca soube dele e não há o que liberar.
--
-- As duas entregas que falharam recebem as datas e voltam para a fila.

create or replace function public.wl_enqueue_dates_changed(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_rec record; v_pt uuid; v_old text; v_new text; v_old_reserve jsonb;
begin
  select bi.parking_type_id into v_pt from public.booking_item bi
   where bi.booking_id = p_booking_id and bi.item_type = 'parking' limit 1;
  if v_pt is null then return; end if;
  select c.id as company_id, c.wl_sync_enabled, lpt.wl_category_slug, lpt.wl_product_slug,
         b.check_in_at, b.check_out_at, b.status
    into v_rec
    from public.booking b
    join public.location l on l.id = b.location_id
    join public.company c on c.id = l.company_id
    join public.company_parking_type cpt on cpt.parking_type_id = v_pt and cpt.company_id = c.id
    join public.location_parking_type lpt on lpt.location_id = l.id and lpt.company_parking_type_id = cpt.id
   where b.id = p_booking_id limit 1;
  if not coalesce(v_rec.wl_sync_enabled, false) or v_rec.wl_category_slug is null or v_rec.wl_product_slug is null then return; end if;
  if v_rec.status not in ('pending', 'confirmed', 'checked_in') then return; end if;

  v_old := public.wl_external_id(p_booking_id);
  select d.payload into v_old_reserve
    from public.wl_delivery d
   where d.event_id = v_old || ':reserve';

  -- Libera os mesmos dias que o reserve do id antigo contou no WL.
  if v_old_reserve is not null then
    insert into public.wl_delivery (company_id, event_id, operation, payload)
    values (v_rec.company_id, v_old || ':release', 'release',
      jsonb_build_object('external_id', v_old, 'operation', 'release',
        'category_slug', v_old_reserve ->> 'category_slug', 'product_slug', v_old_reserve ->> 'product_slug',
        'quantity', coalesce((v_old_reserve ->> 'quantity')::int, 1),
        'start_date', v_old_reserve ->> 'start_date', 'end_date', v_old_reserve ->> 'end_date'))
    on conflict (event_id) do nothing;
  end if;

  update public.booking set wl_external_version = wl_external_version + 1 where id = p_booking_id;
  v_new := public.wl_external_id(p_booking_id);
  insert into public.wl_delivery (company_id, event_id, operation, payload)
  values (v_rec.company_id, v_new || ':reserve', 'reserve',
    jsonb_build_object('external_id', v_new, 'operation', 'reserve',
      'category_slug', v_rec.wl_category_slug, 'product_slug', v_rec.wl_product_slug, 'quantity', 1,
      'start_date', public.wl_local_date(v_rec.check_in_at), 'end_date', public.wl_local_date(v_rec.check_out_at)))
  on conflict (event_id) do nothing;
end $function$;

revoke all on function public.wl_enqueue_dates_changed(uuid) from public, anon, authenticated;
grant execute on function public.wl_enqueue_dates_changed(uuid) to service_role;

-- Conserta os releases que já falharam por falta de data: pega as datas do reserve do mesmo id.
update public.wl_delivery d
   set payload = d.payload || jsonb_build_object('start_date', r.payload ->> 'start_date', 'end_date', r.payload ->> 'end_date'),
       status = 'pending', attempts = 0, next_attempt_at = now(), last_error = null, last_status = null
  from public.wl_delivery r
 where d.operation = 'release'
   and d.status = 'failed'
   and not (d.payload ? 'start_date')
   and r.event_id = (d.payload ->> 'external_id') || ':reserve'
   and r.payload ? 'start_date';
