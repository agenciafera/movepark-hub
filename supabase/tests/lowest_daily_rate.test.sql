-- pgTAP: menor diária do lote (lowest_daily_rate), o preço "a partir de" do card.
-- Roda em transação com rollback.
--
-- A fixture REESCREVE a tabela de preço de um lote do seed em vez de fixar um valor do
-- catálogo: preço de parceiro muda (as unidades externas são espelhadas todo dia), e golden
-- preso a linha viva apodrece sem ninguém ver.

begin;
select plan(11);

-- ── fixture: um lote ativo do seed, com tabela conhecida ───────────────────
do $$
declare v_lpt uuid; v_rule uuid;
begin
  select lpt.id into v_lpt
  from public.location_parking_type lpt
  join public.location l on l.id = lpt.location_id and l.deleted_at is null
  join public.company c on c.id = l.company_id
  join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
  join public.pricing_rule pr on pr.location_parking_type_id = lpt.id
  where lpt.is_active and cpt.is_active
  limit 1;

  update public.location l set status = 'active'
   from public.location_parking_type lpt
   where lpt.id = v_lpt and l.id = lpt.location_id;
  update public.company c set status = 'active', deleted_at = null
   from public.location_parking_type lpt
   join public.location l on l.id = lpt.location_id
   where lpt.id = v_lpt and c.id = l.company_id;
  update public.location_parking_type
     set has_minimum_stay = false, minimum_stay_value = null, minimum_stay_unit = null
   where id = v_lpt;

  -- Uma regra só, para o teste não depender de qual delas a engine escolheria.
  delete from public.pricing_tier t using public.pricing_rule pr
    where t.pricing_rule_id = pr.id and pr.location_parking_type_id = v_lpt;
  delete from public.pricing_rule where location_parking_type_id = v_lpt;

  insert into public.pricing_rule (location_parking_type_id, strategy, old_price_strategy)
  values (v_lpt, 'uniform_by_duration', 'none')
  returning id into v_rule;

  -- A tabela do Virapark: a diária cai de R$ 40,00 para R$ 24,90 em 7 diárias.
  insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price) values
    (v_rule, 1, 1, 40.00),
    (v_rule, 2, 6, 28.90),
    (v_rule, 7, null, 24.90);

  perform set_config('t.lpt', v_lpt::text, false);
  perform set_config('t.rule', v_rule::text, false);
end $$;

create or replace function pg_temp.menor(col text)
returns text language plpgsql as $$
declare v text;
begin
  execute format(
    'select %I::text from public.lowest_daily_rate(array[%L]::uuid[])', col, current_setting('t.lpt')
  ) into v;
  return v;
end $$;

-- ── 1) o card mostra a MENOR diária, não a da estadia mais curta ───────────
select is(pg_temp.menor('daily'), '24.90', 'a menor diária é a da faixa de 7+, não os R$ 40,00 de 1 diária');
select is(pg_temp.menor('days'), '7', 'devolve a estadia em que essa diária vale');
-- Comparado como número: o total vem do jsonb de `simulate_price`, que não garante duas casas
-- no texto ('174.3'), e o que o teste protege é o valor, não a máscara.
select is(pg_temp.menor('total')::numeric, 174.30::numeric, 'o total é o da estadia de 7 dias');
select is(pg_temp.menor('min_stay_days'), null, 'lote que vende 1 diária não anuncia mínimo');

-- ── 2) empate na diária resolve pela MENOR duração ─────────────────────────
-- Tabela plana: a promessa honesta é a que exige menos dias do cliente.
delete from public.pricing_tier where pricing_rule_id = current_setting('t.rule')::uuid;
insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price)
values (current_setting('t.rule')::uuid, 1, null, 30.00);

select is(pg_temp.menor('daily'), '30.00', 'tabela plana: a diária é a mesma em qualquer duração');
select is(pg_temp.menor('days'), '1', 'no empate vence a duração mais curta');

-- ── 3) estadia mínima entra como duração candidata ────────────────────────
-- Sem isso, um lote que exige 3 diárias seria anunciado em 7 (a duração de referência
-- seguinte), pedindo ao cliente mais dias do que o estacionamento exige.
update public.location_parking_type
   set has_minimum_stay = true, minimum_stay_value = 3, minimum_stay_unit = 'days'
 where id = current_setting('t.lpt')::uuid;

select is(pg_temp.menor('days'), '3', 'a menor estadia vendável é simulada junto das de referência');
select is(pg_temp.menor('min_stay_days'), '3', 'a exigência volta para o card');

-- ── 4) balcão só quando existe ────────────────────────────────────────────
update public.pricing_rule
   set old_price_strategy = 'multiplier', old_price_multiplier = 1.2
 where id = current_setting('t.rule')::uuid;

select cmp_ok(
  pg_temp.menor('old_total')::numeric, '>', pg_temp.menor('total')::numeric,
  'o balcão volta maior que o preço, senão não há o que riscar no card');

-- ── 5) lote fora do ar não é precificado ──────────────────────────────────
update public.location_parking_type set is_active = false where id = current_setting('t.lpt')::uuid;

select is(
  (select count(*) from public.lowest_daily_rate(array[current_setting('t.lpt')::uuid]))::int,
  0, 'lote inativo não volta, mesmo com o id em mãos');

-- ── 6) lista vazia não estoura ────────────────────────────────────────────
select is(
  (select count(*) from public.lowest_daily_rate(array[]::uuid[]))::int,
  0, 'sem ids, sem linhas e sem erro');

rollback;
