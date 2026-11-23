-- pgTAP: Vaga Max (vans e utilitários), primeiro caso na Pare Seguro GRU.
-- Migration: 20261205200000_vaga_max_pare_seguro.sql. Spec: docs/specs/pricing-engine.md.
--
-- A tabela combinada com o parceiro em 20/11/2026 é uma diária inteira de R$ 70,00 em qualquer
-- duração, sem pacote e sem riscado. O que este arquivo tranca:
--   1. o catálogo tem o tipo `large_vehicle` com o nome e a descrição da ficha (ADR-009: "vans e
--      utilitários" e nada além);
--   2. a regra que a migration grava (fixed_bracket, faixa única aberta a partir do dia 1) cota
--      os valores da atividade no motor, numa unidade de teste;
--   3. no banco que tem a Pare Seguro (o vivo), a vaga real cota os mesmos valores, com 40 vagas e
--      mínimo de 2 diárias. No replay do CI a empresa não existe e esses casos viram `skip`.

begin;
select plan(8);

-- ── 1. Catálogo ─────────────────────────────────────────────────────────────

select is(
  (select name from public.parking_type where code = 'large_vehicle'),
  'Vaga Max',
  'o catálogo tem o tipo large_vehicle com o nome Vaga Max');

select is(
  (select description from public.parking_type where code = 'large_vehicle'),
  'Vaga descoberta para vans e utilitários, em pátio aberto.',
  'a descrição fala só de vans e utilitários, sem medida nem caminhão');

-- ── 2. A regra da migration no motor (unidade de teste) ─────────────────────

do $$
declare
  v_company uuid; v_loc uuid; v_cpt uuid; v_lpt uuid; v_rule uuid;
begin
  -- Empresa e unidade nascem vendáveis: `get_pricing_data` cobra empresa com `status` e
  -- `onboarding_status` ativos e unidade ativa e listada. A foto vem antes do `is_listed` por
  -- causa do piso de `20260818000000_photo_required_to_list`.
  insert into public.company(name, slug, status, onboarding_status)
    values ('Max Parceiro', 'max-parceiro', 'active', 'active') returning id into v_company;
  insert into public.location(company_id, name, slug, status, photos)
    values (v_company, 'Max Unidade', 'max-unidade', 'active',
            '["/Estacionamentos/seed/foto-de-teste.webp"]'::jsonb) returning id into v_loc;
  update public.location set is_listed = true where id = v_loc;
  insert into public.company_parking_type(company_id, parking_type_id, base_price, default_capacity)
    select v_company, id, 70, 40 from public.parking_type where code = 'large_vehicle'
    returning id into v_cpt;
  insert into public.location_parking_type(location_id, company_parking_type_id, capacity, is_active,
                                           has_minimum_stay, minimum_stay_value, minimum_stay_unit)
    values (v_loc, v_cpt, 40, true, true, 2, 'days') returning id into v_lpt;
  insert into public.pricing_rule(location_parking_type_id, strategy, fractional_day_policy, old_price_strategy)
    values (v_lpt, 'fixed_bracket', 'any_extra', 'none') returning id into v_rule;
  insert into public.pricing_tier(pricing_rule_id, from_day, to_day, unit_price, total_price, is_old_price)
    values (v_rule, 1, null, 70, null, false);
end $$;

select is(
  (select array_agg(
     (public.simulate_price('max-parceiro', 'max-unidade', 'large_vehicle', d)->>'price')::numeric
     order by d)
     from unnest(array[2, 3, 7, 15, 30, 31]) d),
  array[140, 210, 490, 1050, 2100, 2170]::numeric[],
  'R$ 70 a diária: 2, 3, 7, 15, 30 e 31 diárias saem 140, 210, 490, 1.050, 2.100 e 2.170');

select is(
  public.simulate_price('max-parceiro', 'max-unidade', 'large_vehicle', 7)->>'old_price',
  null,
  'sem preço de balcão declarado, não há riscado');

select is(
  public.simulate_price('max-parceiro', 'max-unidade', 'large_vehicle', 7)->>'parking_type',
  'Vaga Max',
  'o motor devolve o nome de exibição do catálogo');

-- ── 3. A vaga real da Pare Seguro (só no banco que tem a empresa) ───────────

select case
  when exists (select 1 from public.company where slug = 'pare-seguro') then
    is(
      (select array_agg(
         (public.simulate_price('pare-seguro', 'aeroporto-guarulhos', 'large_vehicle', d)->>'price')::numeric
         order by d)
         from unnest(array[2, 3, 7, 15, 30, 31]) d),
      array[140, 210, 490, 1050, 2100, 2170]::numeric[],
      'Pare Seguro GRU: a Vaga Max cota a tabela combinada com o parceiro')
  else skip('Pare Seguro não existe neste banco (replay sem dado de produção)', 1)
end;

select case
  when exists (select 1 from public.company where slug = 'pare-seguro') then
    is(
      (select row(lpt.capacity, lpt.is_active, lpt.has_minimum_stay,
                  lpt.minimum_stay_value, lpt.minimum_stay_unit::text)::text
         from public.location_parking_type lpt
         join public.location l on l.id = lpt.location_id
         join public.company c on c.id = l.company_id
         join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
         join public.parking_type pt on pt.id = cpt.parking_type_id
        where c.slug = 'pare-seguro' and l.slug = 'aeroporto-guarulhos' and pt.code = 'large_vehicle'),
      row(40, true, true, 2, 'days')::text,
      'Pare Seguro GRU: 40 vagas, ativa, mínimo de 2 diárias')
  else skip('Pare Seguro não existe neste banco (replay sem dado de produção)', 1)
end;

-- A tabela de dezembro é agendada só para as vagas de carro. Se um agendamento apontasse para a
-- Vaga Max, o R$ 70 combinado mudaria em 01/12 sem ninguém pedir.
select case
  when exists (select 1 from public.company where slug = 'pare-seguro') then
    is(
      (select count(*)::int
         from public.pricing_schedule s
         join public.location_parking_type lpt on lpt.id = s.location_parking_type_id
         join public.company_parking_type cpt on cpt.id = lpt.company_parking_type_id
         join public.parking_type pt on pt.id = cpt.parking_type_id
        where pt.code = 'large_vehicle' and s.status = 'scheduled'),
      0,
      'nenhuma troca de tabela agendada para a Vaga Max')
  else skip('Pare Seguro não existe neste banco (replay sem dado de produção)', 1)
end;

select * from finish();
rollback;
