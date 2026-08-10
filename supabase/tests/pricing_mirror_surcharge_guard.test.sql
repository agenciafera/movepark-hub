-- pgTAP: o espelho de preço recusa reescrever tabela que outra unidade empresta.
-- Migration: 20260929000000_mirror_refuses_surcharge_source.sql
-- Spec: docs/specs/checkout-externo-por-local.md, seção "A tabela emprestada"
--
-- O acidente real: o valet do Aerovalet em Guarulhos usava `surcharge` com multiplicador 1.0
-- sobre a tabela do valet do Aeropark. Quando o Aeropark virou externo, o espelho reescreveu
-- aquela tabela com a do parceiro e o Aerovalet foi junto, de R$ 792 para R$ 1.782 em 18 diárias.
-- O Aerovalet é unidade `hub`: ele vende pelo checkout da Movepark e teria que honrar o preço.

begin;
select plan(4);

do $$
declare
  v_co uuid; v_loc uuid; v_pt_a uuid; v_pt_b uuid;
  v_cpt_a uuid; v_cpt_b uuid; v_fonte uuid; v_tomador uuid;
begin
  insert into public.company(name, slug) values ('Guard Surcharge','guard-surcharge') returning id into v_co;
  insert into public.location(company_id, name, slug) values (v_co,'Guard Unidade','guard-unidade') returning id into v_loc;

  insert into public.parking_type(code, name) values ('guard_fonte','Guard Fonte') returning id into v_pt_a;
  insert into public.parking_type(code, name) values ('guard_tomador','Guard Tomador') returning id into v_pt_b;

  insert into public.company_parking_type(company_id, parking_type_id, base_price, default_capacity)
    values (v_co, v_pt_a, 40, 10) returning id into v_cpt_a;
  insert into public.company_parking_type(company_id, parking_type_id, base_price, default_capacity)
    values (v_co, v_pt_b, 40, 10) returning id into v_cpt_b;

  insert into public.location_parking_type(location_id, company_parking_type_id, capacity, is_active)
    values (v_loc, v_cpt_a, 10, true) returning id into v_fonte;
  insert into public.location_parking_type(location_id, company_parking_type_id, capacity, is_active)
    values (v_loc, v_cpt_b, 10, true) returning id into v_tomador;

  -- O tomador empresta a tabela da fonte, igual ao valet do Aerovalet fazia.
  insert into public.pricing_rule(location_parking_type_id, strategy, surcharge_source_id, surcharge_multiplier)
    values (v_tomador, 'surcharge', v_fonte, 1.0);

  perform set_config('t.fonte', v_fonte::text, false);
  perform set_config('t.tomador', v_tomador::text, false);
end $$;

-- A fonte é emprestada: o espelho recusa, e diz QUEM empresta (senão o erro no log não ajuda
-- ninguém a agir).
select throws_ok($$
  select public.wl_mirror_apply_pricing(
    current_setting('t.fonte')::uuid,
    '{"strategy":"uniform_by_duration"}'::jsonb,
    '[{"from_day":1,"to_day":null,"unit_price":99.90,"is_old_price":false}]'::jsonb)
$$, 'P0001', null, 'espelhar a fonte de surcharge é recusado');

select ok(
  (select count(*)::int from public.pricing_rule
    where location_parking_type_id = current_setting('t.fonte')::uuid) = 0,
  'a recusa não deixa regra pela metade na fonte');

-- Quem empresta pode ser espelhado à vontade: ninguém depende da tabela dele.
select lives_ok($$
  select public.wl_mirror_apply_pricing(
    current_setting('t.tomador')::uuid,
    '{"strategy":"uniform_by_duration"}'::jsonb,
    '[{"from_day":1,"to_day":null,"unit_price":99.90,"is_old_price":false}]'::jsonb)
$$, 'espelhar quem TOMA emprestado segue liberado');

-- Cortado o vínculo, a fonte volta a ser espelhável. É o caminho de saída documentado no erro:
-- dê tabela própria a quem empresta, depois espelhe.
select lives_ok($$
  update public.pricing_rule set strategy = 'fixed_bracket', surcharge_source_id = null
   where location_parking_type_id = current_setting('t.tomador')::uuid;
  select public.wl_mirror_apply_pricing(
    current_setting('t.fonte')::uuid,
    '{"strategy":"uniform_by_duration"}'::jsonb,
    '[{"from_day":1,"to_day":null,"unit_price":99.90,"is_old_price":false}]'::jsonb)
$$, 'sem o vínculo, a fonte é espelhada normalmente');

select * from finish();
rollback;
