-- pgTAP: o parceiro lê o veículo das reservas da empresa dele, e só desses (14/10/2026).
-- Transação com rollback; cria os próprios dados (roda no banco limpo do CI e no vivo).

begin;
select plan(4);

-- Fixture própria (19/10/2026): a versão anterior procurava reserva real com veículo e
-- operador, e no banco limpo do CI não há nenhuma, então os ids saíam vazios.
do $$
declare
  v_cli uuid := gen_random_uuid();
  v_out uuid := gen_random_uuid();
  v_op uuid := gen_random_uuid();
  v_loc uuid; v_cid uuid; v_veh uuid; v_other uuid;
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (v_cli, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'placa-cliente@ex.com', now(), now()),
    (v_out, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'placa-outro@ex.com', now(), now()),
    (v_op,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'placa-op@ex.com', now(), now());
  insert into public.profiles(id, role) values
    (v_cli, 'customer'), (v_out, 'customer'), (v_op, 'company_operator') on conflict (id) do nothing;

  select id, company_id into v_loc, v_cid from public.location where deleted_at is null order by created_at limit 1;
  insert into public.profile_company(profile_id, company_id, role) values (v_op, v_cid, 'operator')
    on conflict do nothing;

  insert into public.vehicle(profile_id, license_plate) values (v_cli, 'PLC1A23') returning id into v_veh;
  -- veículo de outro cliente, que nenhuma reserva da empresa usa
  insert into public.vehicle(profile_id, license_plate) values (v_out, 'OUT9Z99') returning id into v_other;

  insert into public.booking(code, profile_id, location_id, vehicle_id, check_in_at, check_out_at, status, total_amount)
  values ('QA-PLACA-1', v_cli, v_loc, v_veh, now() + interval '3 day', now() + interval '5 day', 'confirmed', 100);

  perform set_config('t.veh', v_veh::text, false);
  perform set_config('t.other', v_other::text, false);
  perform set_config('t.op', v_op::text, false);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.op'), 'role', 'authenticated')::text, true);

select is((select count(*)::int from public.vehicle where id = current_setting('t.veh')::uuid), 1,
  'o parceiro lê o veículo de uma reserva da empresa dele');
select is((select count(*)::int from public.vehicle where id = current_setting('t.other')::uuid), 0,
  'e não lê veículo que nenhuma reserva da empresa usa');
select lives_ok(format('update public.vehicle set color = %L where id = %L::uuid', 'x', current_setting('t.veh')),
  'update do parceiro não quebra, mas também não acha a linha');

reset role;
select is((select count(*)::int from public.vehicle where id = current_setting('t.veh')::uuid and color = 'x'), 0,
  'só leitura: a cor não mudou');
select * from finish();
rollback;
