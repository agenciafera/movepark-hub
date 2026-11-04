-- pgTAP: agendamento de tabela de preço (docs/specs/agendamento-de-preco.md).
-- Cobre: gate de empresa e escopo, recusas (data passada, dia repetido, tabela que não calcula,
-- vaga espelhada do white-label), aplicação só depois da hora, riscado preservado quando o
-- agendamento não traz riscado, estadia mínima, snapshot em `replaced`, cancelamento e falha
-- isolada. Transação com rollback.

begin;
select plan(26);

do $$
declare
  op_a uuid := gen_random_uuid(); op_b uuid := gen_random_uuid();
  cid_a uuid; cid_b uuid; v_pt uuid; v_cpt uuid; v_lpt uuid; v_lpt2 uuid; v_cpt2 uuid; v_pt2 uuid;
  loc_a uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (op_a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ps-a@ex.com',now(),now()),
    (op_b,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','ps-b@ex.com',now(),now());
  insert into public.profiles(id, role) values
    (op_a,'company_operator'),(op_b,'company_operator') on conflict (id) do nothing;
  cid_a := public.submit_partner_lead('Agenda Empresa A','PS A','ps-a@ex.com','+5511999995001');
  cid_b := public.submit_partner_lead('Agenda Empresa B','PS B','ps-b@ex.com','+5511999995002');
  update public.company set status = 'active', onboarding_status = 'active' where id = cid_a;
  insert into public.profile_company(profile_id, company_id) values (op_a, cid_a), (op_b, cid_b);

  select id into v_pt from public.parking_type order by id limit 1;
  select id into v_pt2 from public.parking_type where id <> v_pt order by id limit 1;
  insert into public.company_parking_type(company_id, parking_type_id, base_price, default_capacity, is_active)
    values (cid_a, v_pt, 18.90, 5, true) returning id into v_cpt;
  insert into public.company_parking_type(company_id, parking_type_id, base_price, default_capacity, is_active)
    values (cid_a, v_pt2, 28.90, 5, true) returning id into v_cpt2;
  insert into public.location(id, company_id, name, slug, checkout_mode, timezone)
    values (loc_a, cid_a, 'Agenda Loc A', 'agenda-loc-a', 'hub', 'America/Sao_Paulo');
  insert into public.location_parking_type(location_id, company_parking_type_id, capacity, is_active,
                                           has_minimum_stay, minimum_stay_value, minimum_stay_unit)
    values (loc_a, v_cpt, 5, true, true, 2, 'days') returning id into v_lpt;
  insert into public.location_parking_type(location_id, company_parking_type_id, capacity, is_active)
    values (loc_a, v_cpt2, 5, true) returning id into v_lpt2;

  perform set_config('test.op_a', op_a::text, false);
  perform set_config('test.op_b', op_b::text, false);
  perform set_config('test.cid_a', cid_a::text, false);
  perform set_config('test.lpt', v_lpt::text, false);
  perform set_config('test.lpt2', v_lpt2::text, false);
  perform set_config('test.cpt', v_cpt::text, false);
  perform set_config('test.dia', (current_date + 10)::text, false);
end $$;

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true); end $$;

-- Tabela de hoje: 18,90/dia e pacote de 290, riscado 21,00/dia e 320 (own_table).
set local role authenticated;
select pg_temp.as_user(current_setting('test.op_a'));
select lives_ok(
  format($$ select public.operator_set_pricing(%L::uuid, 18.90,
            '{"strategy":"fixed_bracket","old_price_strategy":"own_table"}'::jsonb,
            '[{"from_day":1,"to_day":14,"unit_price":17.01},{"from_day":15,"to_day":30,"total_price":261}]'::jsonb,
            '[{"from_day":1,"to_day":14,"unit_price":18.90},{"from_day":15,"to_day":30,"total_price":290}]'::jsonb) $$,
         current_setting('test.lpt')),
  'operator_set_pricing grava as faixas do riscado (p_old_tiers)');
select lives_ok(
  format($$ select public.operator_set_pricing(%L::uuid, null,
            '{"strategy":"fixed_bracket","old_price_strategy":"own_table"}'::jsonb,
            '[{"from_day":1,"to_day":14,"unit_price":17.01},{"from_day":15,"to_day":30,"total_price":261}]'::jsonb) $$,
         current_setting('test.lpt')),
  'operator_set_pricing sem p_old_tiers continua funcionando');
reset role;

select is(
  (select count(*)::int from public.pricing_tier t join public.pricing_rule r on r.id = t.pricing_rule_id
    where r.location_parking_type_id = current_setting('test.lpt')::uuid and t.is_old_price),
  2, 'salvar sem p_old_tiers preserva o riscado');

-- ── Criar ───────────────────────────────────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.op_a'));
select lives_ok(
  format($$ select public.pricing_schedule_create(%L::uuid, %L::date, 22.41,
            '{"strategy":"fixed_bracket","old_price_strategy":"own_table"}'::jsonb,
            '[{"from_day":1,"to_day":14,"unit_price":22.41},{"from_day":15,"to_day":30,"total_price":333}]'::jsonb,
            null, 3) $$,
         current_setting('test.lpt'), current_setting('test.dia')),
  'operador A programa a próxima tabela');

select throws_ok(
  format($$ select public.pricing_schedule_create(%L::uuid, %L::date, null,
            '{"strategy":"fixed_bracket"}'::jsonb, '[{"from_day":1,"to_day":30,"unit_price":30}]'::jsonb) $$,
         current_setting('test.lpt'), current_setting('test.dia')),
  '23505', null, 'não aceita duas tabelas programadas no mesmo dia');

select throws_ok(
  format($$ select public.pricing_schedule_create(%L::uuid, current_date, null,
            '{"strategy":"fixed_bracket"}'::jsonb, '[{"from_day":1,"to_day":30,"unit_price":30}]'::jsonb) $$,
         current_setting('test.lpt')),
  '22023', null, 'recusa data de hoje (para hoje, salva sem agendar)');

select throws_ok(
  format($$ select public.pricing_schedule_create(%L::uuid, %L::date, null,
            '{"strategy":"fixed_bracket"}'::jsonb, '[{"from_day":1,"to_day":30,"unit_price":0}]'::jsonb) $$,
         current_setting('test.lpt'), (current_setting('test.dia')::date + 1)::text),
  '22023', null, 'recusa tabela que não gera preço');
reset role;

set local role authenticated;
select pg_temp.as_user(current_setting('test.op_b'));
select throws_ok(
  format($$ select public.pricing_schedule_create(%L::uuid, %L::date, null,
            '{"strategy":"fixed_bracket"}'::jsonb, '[{"from_day":1,"to_day":30,"unit_price":30}]'::jsonb) $$,
         current_setting('test.lpt'), (current_setting('test.dia')::date + 2)::text),
  '42501', null, 'operador B não programa preço de unidade alheia');
select is(
  (select count(*)::int from public.pricing_schedule where location_parking_type_id = current_setting('test.lpt')::uuid),
  0, 'operador B não enxerga os agendamentos da empresa A (RLS)');
reset role;

set local role authenticated;
select pg_temp.as_user(current_setting('test.op_a'));
select is(
  (select count(*)::int from public.pricing_schedule where location_parking_type_id = current_setting('test.lpt')::uuid),
  1, 'operador A enxerga o próprio agendamento');
reset role;

select is(
  (select effective_at from public.pricing_schedule
    where location_parking_type_id = current_setting('test.lpt')::uuid and status = 'scheduled'),
  (current_setting('test.dia')::date::timestamp at time zone 'America/Sao_Paulo'),
  'a troca é às 0h do dia no fuso da unidade');

-- ── Aplicar ─────────────────────────────────────────────────────────────────────────────────────
select is(public.pricing_schedule_apply_due(), 0, 'antes da hora, nada é aplicado');
select is(
  (select unit_price from public.pricing_tier t join public.pricing_rule r on r.id = t.pricing_rule_id
    where r.location_parking_type_id = current_setting('test.lpt')::uuid and not t.is_old_price and t.from_day = 1),
  17.01::numeric, 'antes da hora, o preço segue o de hoje');

update public.pricing_schedule set effective_at = now() - interval '1 minute'
 where location_parking_type_id = current_setting('test.lpt')::uuid and status = 'scheduled';

select is(public.pricing_schedule_apply_due(), 1, 'na hora, aplica o agendamento');
select is(
  (select status from public.pricing_schedule where location_parking_type_id = current_setting('test.lpt')::uuid),
  'applied', 'agendamento fica como aplicado');
select is(
  (select unit_price from public.pricing_tier t join public.pricing_rule r on r.id = t.pricing_rule_id
    where r.location_parking_type_id = current_setting('test.lpt')::uuid and not t.is_old_price and t.from_day = 1),
  22.41::numeric, 'a diária nova entrou');
select is(
  (select count(*)::int from public.pricing_tier t join public.pricing_rule r on r.id = t.pricing_rule_id
    where r.location_parking_type_id = current_setting('test.lpt')::uuid and t.is_old_price),
  2, 'agendamento sem riscado preserva o riscado');
select is(
  (select base_price from public.company_parking_type where id = current_setting('test.cpt')::uuid),
  22.41::numeric, 'o preço base mudou');
select is(
  (select minimum_stay_value from public.location_parking_type where id = current_setting('test.lpt')::uuid),
  3, 'a estadia mínima mudou');
select is(
  (select (replaced->>'base_price')::numeric from public.pricing_schedule
    where location_parking_type_id = current_setting('test.lpt')::uuid),
  18.90::numeric, 'a tabela que saiu ficou gravada em replaced');

-- Agendamento com riscado troca o riscado
update public.pricing_schedule set status = 'canceled' where location_parking_type_id = current_setting('test.lpt')::uuid and status = 'scheduled';
set local role authenticated;
select pg_temp.as_user(current_setting('test.op_a'));
select public.pricing_schedule_create(current_setting('test.lpt')::uuid, (current_setting('test.dia')::date + 5),
  null, '{"strategy":"fixed_bracket","old_price_strategy":"own_table"}'::jsonb,
  '[{"from_day":1,"to_day":30,"unit_price":30}]'::jsonb,
  '[{"from_day":1,"to_day":30,"unit_price":33}]'::jsonb, null);
reset role;
update public.pricing_schedule set effective_at = now() - interval '1 minute'
 where location_parking_type_id = current_setting('test.lpt')::uuid and status = 'scheduled';
select public.pricing_schedule_apply_due();
select is(
  (select array_agg(unit_price order by unit_price) from public.pricing_tier t join public.pricing_rule r on r.id = t.pricing_rule_id
    where r.location_parking_type_id = current_setting('test.lpt')::uuid and t.is_old_price),
  array[33.00]::numeric[], 'agendamento com riscado troca o riscado');

-- ── Cancelar ────────────────────────────────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.as_user(current_setting('test.op_a'));
select public.pricing_schedule_create(current_setting('test.lpt')::uuid, (current_setting('test.dia')::date + 20),
  null, '{"strategy":"fixed_bracket"}'::jsonb, '[{"from_day":1,"to_day":30,"unit_price":40}]'::jsonb);
select lives_ok(
  format($$ select public.pricing_schedule_cancel((select id from public.pricing_schedule
            where location_parking_type_id = %L::uuid and status = 'scheduled')) $$, current_setting('test.lpt')),
  'operador A cancela o agendamento pendente');
select throws_ok(
  format($$ select public.pricing_schedule_cancel((select id from public.pricing_schedule
            where location_parking_type_id = %L::uuid and status = 'applied' limit 1)) $$, current_setting('test.lpt')),
  '22023', null, 'não cancela tabela que já entrou em vigor');
reset role;

-- ── Vaga espelhada do white-label ───────────────────────────────────────────────────────────────
-- Agenda a vaga 2 enquanto ela é do Hub, e só então ela passa a ser espelhada.
set local role authenticated;
select pg_temp.as_user(current_setting('test.op_a'));
select public.pricing_schedule_create(current_setting('test.lpt2')::uuid, current_setting('test.dia')::date,
  null, '{"strategy":"fixed_bracket"}'::jsonb, '[{"from_day":1,"to_day":30,"unit_price":40}]'::jsonb);
reset role;
update public.company set wl_domain = 'agenda-a.example.com' where id = current_setting('test.cid_a')::uuid;
update public.location_parking_type set wl_category_slug = 'cat', wl_product_slug = 'prod'
 where id = current_setting('test.lpt2')::uuid;

set local role authenticated;
select pg_temp.as_user(current_setting('test.op_a'));
select throws_ok(
  format($$ select public.pricing_schedule_create(%L::uuid, %L::date, null,
            '{"strategy":"fixed_bracket"}'::jsonb, '[{"from_day":1,"to_day":30,"unit_price":30}]'::jsonb) $$,
         current_setting('test.lpt2'), (current_setting('test.dia')::date + 1)::text),
  '22023', null, 'recusa agendar vaga que copia o preço do white-label');
reset role;

update public.pricing_schedule set effective_at = now() - interval '1 minute'
 where location_parking_type_id = current_setting('test.lpt2')::uuid and status = 'scheduled';
select public.pricing_schedule_apply_due();
select is(
  (select status from public.pricing_schedule where location_parking_type_id = current_setting('test.lpt2')::uuid),
  'failed', 'vaga que virou espelhada depois do agendamento: a aplicação falha e fica marcada');

-- ── Privilégios ─────────────────────────────────────────────────────────────────────────────────
select ok(
  not has_function_privilege('anon', 'public.pricing_schedule_create(uuid,date,numeric,jsonb,jsonb,jsonb,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.pricing_schedule_apply_due()', 'execute')
  and not has_function_privilege('authenticated', 'public._pricing_write(uuid,numeric,jsonb,jsonb,jsonb)', 'execute'),
  'anon não agenda; ninguém de fora roda a aplicação nem a escrita interna');

select * from finish();
rollback;
