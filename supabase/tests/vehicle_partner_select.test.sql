-- pgTAP: o parceiro lê o veículo das reservas da empresa dele, e só desses (14/10/2026).
-- Transação com rollback, sobre o banco vivo.

begin;
select plan(4);

do $$
declare v_bk record; v_op uuid; v_other uuid;
begin
  select b.id, b.vehicle_id, l.company_id into v_bk
    from public.booking b join public.location l on l.id = b.location_id
   where b.vehicle_id is not null and b.deleted_at is null
     and exists (select 1 from public.profile_company pc join public.profiles p on p.id = pc.profile_id
                  where pc.company_id = l.company_id and p.role = 'company_operator')
   order by b.created_at desc limit 1;
  select pc.profile_id into v_op from public.profile_company pc join public.profiles p on p.id = pc.profile_id
   where pc.company_id = v_bk.company_id and p.role = 'company_operator' limit 1;
  -- um veículo que nenhuma reserva da empresa usa
  select v.id into v_other from public.vehicle v
   where not exists (select 1 from public.booking b join public.location l on l.id = b.location_id
                      where b.vehicle_id = v.id and l.company_id = v_bk.company_id)
     and v.profile_id is distinct from v_op
   limit 1;
  perform set_config('t.veh', v_bk.vehicle_id::text, false);
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
