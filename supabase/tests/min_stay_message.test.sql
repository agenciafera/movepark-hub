-- A recusa de estadia mínima diz o mínimo (01/10/2026).
--
-- Antes: "Estadia mínima não atingida para essa vaga.", sem o número. O agente
-- gastava outra cotação para descobrir o piso e propor um período que coubesse.

begin;
select plan(6);

select is(public.min_stay_label('days', 3), '3 diárias', 'diárias no plural');
select is(public.min_stay_label('days', 1), '1 diária', 'diária no singular');
select is(public.min_stay_label('hours', 12), '12 horas', 'horas');
select is(public.min_stay_label('months', 1), '1 mês', 'mês');

-- Uma vaga real com mínimo, numa unidade hub, sem mexer no dado: o mínimo é
-- trocado dentro desta transação, que é desfeita no fim.
select set_config('test.lpt', (
  select lpt.id::text from public.location_parking_type lpt
    join public.location l on l.id = lpt.location_id
   where l.checkout_mode = 'hub' and l.deleted_at is null and lpt.is_active
   order by lpt.created_at limit 1), true);
update public.location_parking_type
   set has_minimum_stay = true, minimum_stay_value = 3, minimum_stay_unit = 'days'
 where id = current_setting('test.lpt')::uuid;

insert into public.api_key (id, company_id, name, key_prefix, key_hash, environment, scopes)
values ('00000000-0000-4000-8000-0000000000c1', null, 'pgtap-minstay', 'mp_test_pgtapms1',
        repeat('e', 64), 'test', array['identity:assert']);

select throws_ok(
  format($$ select public.quote_booking_for_agent('00000000-0000-4000-8000-0000000000c1', %L::uuid,
            date_trunc('day', now()) + interval '20 days 10 hours',
            date_trunc('day', now()) + interval '21 days 10 hours') $$, current_setting('test.lpt')),
  'P0001', 'Estadia mínima não atingida para essa vaga: mínimo de 3 diárias.',
  'a recusa traz o mínimo'
);

select is_empty(
  $$ select grantee from information_schema.role_routine_grants
      where routine_name = 'min_stay_label' and grantee in ('anon', 'authenticated', 'PUBLIC') $$,
  'min_stay_label só para o servidor'
);

select * from finish();
rollback;
