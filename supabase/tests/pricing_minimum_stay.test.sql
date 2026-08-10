-- pgTAP: E0.13 · estadia mínima do parceiro no motor de preço.
-- Spec: docs/specs/espelhamento-preco-wl.md
--
-- O defeito que este arquivo tranca: numa tabela que começa no dia 3, pedir 1 diária caía na
-- faixa aberta (`to_day is null` casava sem olhar o `from_day`) e devolvia a diária mais barata
-- da curva. No Abbapark isso dava R$ 23,90 para uma diária que o parceiro recusa, contra
-- R$ 77,70 das 3 diárias mínimas. Barato e errado é pior que caro e errado: a unidade subiria
-- como a mais barata na ordenação da busca e a recusa só apareceria no site do parceiro.

begin;
select plan(13);

-- ── 1. O motor não cota abaixo da primeira faixa ────────────────────────────

create or replace function pg_temp.calc(tiers jsonb, d int)
returns numeric language sql as $$
  select public._apply_pricing('uniform_by_duration', tiers, null, null, null, d,
                               null, null, null, null, null, null, null);
$$;

-- Tabela com piso no dia 3, faixa fechada 3-4 e faixa aberta a partir do 5.
create or replace function pg_temp.com_piso() returns jsonb language sql immutable as $$
  select '[{"from_day":3,"to_day":4,"unit_price":25.90},
           {"from_day":5,"to_day":null,"unit_price":23.90}]'::jsonb;
$$;

select is(pg_temp.calc(pg_temp.com_piso(), 1), null, '1 diária abaixo do piso não tem preço');
select is(pg_temp.calc(pg_temp.com_piso(), 2), null, '2 diárias abaixo do piso não tem preço');
select is(pg_temp.calc(pg_temp.com_piso(), 3), 77.70, '3 diárias, o piso, cotam pela faixa 3-4');
select is(pg_temp.calc(pg_temp.com_piso(), 4), 103.60, '4 diárias seguem na faixa 3-4');
select is(pg_temp.calc(pg_temp.com_piso(), 5), 119.50, '5 diárias entram na faixa aberta');
select is(pg_temp.calc(pg_temp.com_piso(), 40), 956.00, 'a faixa aberta segue valendo acima dela');

-- A tabela normal, que começa no dia 1, não muda em nada.
select is(
  pg_temp.calc('[{"from_day":1,"to_day":null,"unit_price":30}]'::jsonb, 1),
  30.00, 'tabela que começa no dia 1 continua cotando 1 diária');

-- A sobrecarga de 6 argumentos tem o mesmo laço copiado, e o piso vale nela também.
select is(
  public._apply_pricing('uniform_by_duration', pg_temp.com_piso(), null, null, null, 1),
  null, 'o piso vale também na sobrecarga de 6 argumentos');

-- Nenhuma regra em produção começa acima do dia 1, então a correção não mexe no que está no ar.
select is(
  (select count(*)::int from public.pricing_rule r
    where exists (select 1 from public.pricing_tier t
                   where t.pricing_rule_id = r.id and t.is_old_price = false)
      and not exists (select 1 from public.pricing_tier t
                       where t.pricing_rule_id = r.id and t.is_old_price = false and t.from_day <= 1)),
  0, 'nenhuma regra pré-existente tem a primeira faixa acima do dia 1');

-- ── 2. O espelho carimba o piso na vaga ─────────────────────────────────────

do $$
declare
  v_company uuid; v_loc uuid; v_pt uuid; v_cpt uuid; v_lpt uuid;
begin
  insert into public.company(name, slug) values ('Piso Parceiro','piso-parceiro') returning id into v_company;
  insert into public.location(company_id, name, slug) values (v_company, 'Piso Unidade','piso-unidade') returning id into v_loc;
  insert into public.parking_type(code, name) values ('piso_coberta','Piso Coberta') returning id into v_pt;
  insert into public.company_parking_type(company_id, parking_type_id, base_price, default_capacity)
    values (v_company, v_pt, 40, 10) returning id into v_cpt;
  insert into public.location_parking_type(location_id, company_parking_type_id, capacity, is_active)
    values (v_loc, v_cpt, 10, true) returning id into v_lpt;
  perform set_config('test.lpt', v_lpt::text, false);
end $$;

select lives_ok($$
  select public.wl_mirror_apply_pricing(
    current_setting('test.lpt')::uuid,
    '{"strategy":"uniform_by_duration","fractional_day_policy":"hour_tolerance","fractional_day_tolerance":1,"old_price_strategy":"none"}'::jsonb,
    '[{"from_day":3,"to_day":null,"unit_price":25.90,"is_old_price":false}]'::jsonb,
    40, '[]'::jsonb, 3)
$$, 'o espelho aceita o piso como argumento');

select is(
  (select row(has_minimum_stay, minimum_stay_value, minimum_stay_unit::text)::text
     from public.location_parking_type where id = current_setting('test.lpt')::uuid),
  row(true, 3, 'days')::text,
  'o piso do parceiro fica gravado na vaga, não só implícito na primeira faixa');

-- Parceiro que deixa de exigir mínimo: o carimbo tem que sair junto, senão a vitrine seguiria
-- recusando uma estadia que voltou a ser vendida.
select lives_ok($$
  select public.wl_mirror_apply_pricing(
    current_setting('test.lpt')::uuid,
    '{"strategy":"uniform_by_duration","old_price_strategy":"none"}'::jsonb,
    '[{"from_day":1,"to_day":null,"unit_price":25.90,"is_old_price":false}]'::jsonb,
    40, '[]'::jsonb, 1)
$$, 'espelhar sem piso roda');

select is(
  (select row(has_minimum_stay, minimum_stay_value, minimum_stay_unit)::text
     from public.location_parking_type where id = current_setting('test.lpt')::uuid),
  row(false, null::int, null::public.minimum_stay_unit)::text,
  'parceiro que deixou de exigir mínimo tem o carimbo limpo');

select * from finish();
rollback;
