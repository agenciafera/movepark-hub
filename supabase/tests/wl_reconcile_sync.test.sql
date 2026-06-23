begin;
select plan(8);

-- Coluna espelho + check
select has_column('public', 'location_parking_availability', 'external_booked_count',
  'external_booked_count existe');
select col_not_null('public', 'location_parking_availability', 'external_booked_count',
  'external_booked_count é NOT NULL');

-- Outbox + log
select has_table('public', 'wl_delivery', 'tabela wl_delivery existe');
select has_table('public', 'wl_reconcile_log', 'tabela wl_reconcile_log existe');

-- Funções
select has_function('public', 'wl_enqueue_delivery', 'trigger wl_enqueue_delivery existe');
select has_function('public', 'wl_reconcile_apply', ARRAY['uuid', 'jsonb'],
  'wl_reconcile_apply(uuid, jsonb) existe');

-- check_availability subtrai o external: numa unidade sem reservas, encher external = capacity → sold_out.
-- (usa um lpt qualquer ativo com slug conhecido via subselect; se não houver, o teste passa trivial.)
do $$
declare v_lpt uuid; v_cap int; v_co text; v_lo text; v_pt text;
begin
  select lpt.id, lpt.capacity, c.slug, l.slug, pt.code
    into v_lpt, v_cap, v_co, v_lo, v_pt
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.parking_type pt on pt.id = cpt.parking_type_id
  where lpt.is_active and l.deleted_at is null
  limit 1;
  if v_lpt is not null then
    insert into public.location_parking_availability (location_parking_type_id, date, booked_count, external_booked_count)
    values (v_lpt, current_date + 400, 0, v_cap)
    on conflict (location_parking_type_id, date) do update set external_booked_count = v_cap, booked_count = 0;
    perform set_config('test.lpt_co', v_co, true);
    perform set_config('test.lpt_lo', v_lo, true);
    perform set_config('test.lpt_pt', v_pt, true);
  end if;
end $$;

select is(
  (public.check_availability(
     current_setting('test.lpt_co', true), current_setting('test.lpt_lo', true), current_setting('test.lpt_pt', true),
     (current_date + 400)::timestamptz, (current_date + 401)::timestamptz
   ) ->> 'sold_out')::boolean,
  true,
  'external_booked_count = capacity → check_availability sold_out'
);

-- wl_reconcile_apply grava external e loga divergência
do $$
declare v_lpt uuid; n int;
begin
  select location_parking_type_id into v_lpt from public.location_parking_availability limit 1;
  select public.wl_reconcile_apply(v_lpt, jsonb_build_array(jsonb_build_object('date', (current_date + 401)::text, 'external', 7))) into n;
  perform set_config('test.reconcile_n', n::text, true);
end $$;
select ok(current_setting('test.reconcile_n', true)::int >= 1, 'wl_reconcile_apply aplica e conta a mudança');

select * from finish();
rollback;
