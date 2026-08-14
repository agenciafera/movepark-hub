-- pgTAP: índice público de preços por destino (destination_price_index).
-- Spec: docs/specs/indice-precos.md · Migration: 20260814154329_destination_price_index.sql
--
-- O que este arquivo tranca: a função é pública (anon executa) e alimenta as páginas /precos
-- no build SSG. Se o filtro de vitrine regredir (unidade não listada aparecendo, destino não
-- publicado aparecendo), o site passa a publicar preço de quem não está no ar. E se a matriz
-- deixar de ter uma entrada por duração pedida, o front quebra a tabela em silêncio.

begin;
select plan(14);

-- ── Existência e superfície ──────────────────────────────────────────────────

select has_function('public', 'destination_price_index', array['integer[]', 'text'],
  'destination_price_index(int[], text) existe');

select ok(has_function_privilege('anon', 'public.destination_price_index(integer[], text)', 'execute'),
  'anon executa destination_price_index (é a vitrine)');

select ok(has_function_privilege('authenticated', 'public.destination_price_index(integer[], text)', 'execute'),
  'authenticated executa destination_price_index');

select throws_ok(
  $$ select public.destination_price_index(array[1,2,3,4,5,6,7,8,9], null) $$,
  'p_days inválido: informe de 1 a 8 durações entre 1 e 60 diárias',
  'mais de 8 durações é recusado (teto anti-abuso da função pública)');

-- ── Fixture: destino publicado + 1 unidade listada com 2 vagas precificadas ──

do $$
declare
  v_dest uuid; v_dest_off uuid; v_company uuid; v_loc uuid; v_loc_off uuid;
  v_pt_uni uuid; v_pt_piso uuid; v_cpt_uni uuid; v_cpt_piso uuid;
  v_lpt_uni uuid; v_lpt_piso uuid; v_rule uuid;
begin
  insert into public.destination (code, name, short_name, slug, type, city, state, country,
                                  latitude, longitude, is_published, sort_order)
    values ('PGT', 'Aeroporto PgTAP', 'PgTAP', 'pgtap-indice-destino', 'airport',
            'Testópolis', 'TS', 'BR', -23.4356, -46.4731, true, 1)
    returning id into v_dest;

  -- Destino NÃO publicado: não pode aparecer nem com unidade listada apontando pra ele.
  insert into public.destination (code, name, short_name, slug, type, city, state, country,
                                  latitude, longitude, is_published, sort_order)
    values ('PGX', 'Aeroporto PgTAP Oculto', 'PgTAP Oculto', 'pgtap-indice-oculto', 'airport',
            'Testópolis', 'TS', 'BR', -23.5, -46.5, false, 2)
    returning id into v_dest_off;

  insert into public.company (name, slug, onboarding_status)
    values ('PgTAP Parking', 'pgtap-indice-parking', 'active')
    returning id into v_company;

  -- Com foto + is_listed direto: o trigger de gate (photo_required_to_list) respeita
  -- o valor quando a foto existe e não vigia a coluna is_listed em si.
  insert into public.location (company_id, destination_id, name, slug, latitude, longitude,
                               photos, is_listed)
    values (v_company, v_dest, 'PgTAP Unidade', 'pgtap-indice-unidade', -23.4400, -46.4800,
            '["https://exemplo.test/foto.jpg"]'::jsonb, true)
    returning id into v_loc;

  -- Unidade NÃO listada no mesmo destino: não pode aparecer.
  insert into public.location (company_id, destination_id, name, slug, latitude, longitude,
                               photos, is_listed)
    values (v_company, v_dest, 'PgTAP Escondida', 'pgtap-indice-escondida', -23.4410, -46.4810,
            '["https://exemplo.test/foto.jpg"]'::jsonb, false)
    returning id into v_loc_off;

  insert into public.parking_type (code, name) values ('pgtap_uniform', 'PgTAP Uniforme')
    returning id into v_pt_uni;
  insert into public.parking_type (code, name) values ('pgtap_piso', 'PgTAP Piso')
    returning id into v_pt_piso;

  insert into public.company_parking_type (company_id, parking_type_id, base_price, default_capacity)
    values (v_company, v_pt_uni, 30, 10) returning id into v_cpt_uni;
  insert into public.company_parking_type (company_id, parking_type_id, base_price, default_capacity)
    values (v_company, v_pt_piso, 40, 10) returning id into v_cpt_piso;

  insert into public.location_parking_type (location_id, company_parking_type_id, capacity, is_active)
    values (v_loc, v_cpt_uni, 10, true) returning id into v_lpt_uni;
  insert into public.location_parking_type (location_id, company_parking_type_id, capacity, is_active,
                                            has_minimum_stay, minimum_stay_value, minimum_stay_unit)
    values (v_loc, v_cpt_piso, 10, true, true, 3, 'days') returning id into v_lpt_piso;

  -- A escondida também tem preço: o que a exclui é o is_listed, não a falta de regra.
  insert into public.location_parking_type (location_id, company_parking_type_id, capacity, is_active)
    values (v_loc_off, v_cpt_uni, 10, true);

  -- Vaga 1: R$ 30/dia em qualquer duração, balcão 20% acima (multiplier).
  insert into public.pricing_rule (location_parking_type_id, strategy, old_price_strategy, old_price_multiplier)
    values (v_lpt_uni, 'uniform_by_duration', 'multiplier', 1.2) returning id into v_rule;
  insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price)
    values (v_rule, 1, null, 30);

  -- Vaga 2: tabela que começa no dia 3 (piso de estadia mínima).
  insert into public.pricing_rule (location_parking_type_id, strategy)
    values (v_lpt_piso, 'uniform_by_duration') returning id into v_rule;
  insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price)
    values (v_rule, 3, null, 25);

  insert into public.pricing_rule (location_parking_type_id, strategy)
    values ((select id from public.location_parking_type where location_id = v_loc_off limit 1),
            'uniform_by_duration') returning id into v_rule;
  insert into public.pricing_tier (pricing_rule_id, from_day, to_day, unit_price)
    values (v_rule, 1, null, 10);
end $$;

-- Helpers de leitura sobre o destino da fixture.
create or replace function pg_temp.idx() returns jsonb language sql as $$
  select public.destination_price_index(null, 'pgtap-indice-destino');
$$;

create or replace function pg_temp.unit(p_code text) returns jsonb language sql as $$
  select u
  from jsonb_array_elements(pg_temp.idx() -> 'destinations' -> 0 -> 'units') u
  where u ->> 'parking_type_code' = p_code;
$$;

-- ── Forma e conteúdo ─────────────────────────────────────────────────────────

select is(pg_temp.idx() -> 'days', '[1, 7, 15, 30]'::jsonb,
  'p_days null cai no default 1/7/15/30');

select is(pg_temp.idx() -> 'destinations' -> 0 ->> 'slug', 'pgtap-indice-destino',
  'o filtro p_destination devolve só o destino pedido');

select is(jsonb_array_length(pg_temp.unit('pgtap_uniform') -> 'prices'), 4,
  'a matriz tem uma entrada por duração pedida');

select is((pg_temp.unit('pgtap_uniform') -> 'prices' -> 1 ->> 'total')::numeric, 210.00,
  '7 diárias a R$ 30/dia custam R$ 210 (motor real, não cópia)');

select is((pg_temp.unit('pgtap_uniform') -> 'prices' -> 1 ->> 'old_total')::numeric, 252.00,
  'o balcão sai junto: R$ 252 com multiplier 1.2');

select is(pg_temp.unit('pgtap_piso') -> 'prices' -> 0 -> 'total', 'null'::jsonb,
  'abaixo do piso de estadia mínima não existe preço (nada de inventar diária)');

select is((pg_temp.unit('pgtap_piso') ->> 'min_stay_days')::int, 3,
  'a estadia mínima sai declarada, para a página explicar o vazio');

select is((
  select count(*)::int
  from jsonb_array_elements(pg_temp.idx() -> 'destinations' -> 0 -> 'units') u
  where u ->> 'location_slug' = 'pgtap-indice-escondida'), 0,
  'unidade não listada fica fora, mesmo com preço configurado');

select is((
  select count(*)::int
  from jsonb_array_elements(public.destination_price_index() -> 'destinations') d
  where d ->> 'slug' = 'pgtap-indice-oculto'), 0,
  'destino não publicado fica fora da chamada geral');

-- ── anon: a mesma leitura passa pela RLS de catálogo ─────────────────────────

set local role anon;
select is(
  (select d ->> 'slug'
     from jsonb_array_elements(public.destination_price_index(null, 'pgtap-indice-destino') -> 'destinations') d
     limit 1),
  'pgtap-indice-destino',
  'anon vê o destino da fixture pela RLS de catálogo (empresa ativa + unidade listada)');
reset role;

select * from finish();
rollback;
