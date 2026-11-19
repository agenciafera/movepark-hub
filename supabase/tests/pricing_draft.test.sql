-- pgTAP: simulate_pricing_draft (E1.4). Calcula o preço de uma regra que AINDA NÃO foi salva,
-- pelo mesmo motor (_apply_pricing) da reserva real. Sem isso, o editor mostrava ao parceiro o
-- preço antigo enquanto ele digitava o novo.
-- Rodar com: supabase test db

begin;
select plan(14);

-- preço de um rascunho num dado nº de dias
create or replace function pg_temp.d(rule jsonb, tiers jsonb, days int)
returns numeric language sql as $$
  select (elem->>'price')::numeric
  from jsonb_array_elements(public.simulate_pricing_draft(rule, tiers, array[days])) as elem;
$$;

-- Tabela real do Virapark: 1d = R$ 40 fixo, 2-6d = R$ 29,90/dia, 7-14d = R$ 17,90/dia,
-- 15+d = R$ 19,90/dia. Mistura total fixo e diária dentro da mesma estratégia.
create or replace function pg_temp.virapark() returns jsonb language sql as $$
  select '[{"from_day":1,"to_day":1,"total_price":40},
           {"from_day":2,"to_day":6,"unit_price":29.9},
           {"from_day":7,"to_day":14,"unit_price":17.9},
           {"from_day":15,"to_day":null,"unit_price":19.9}]'::jsonb;
$$;

select is(pg_temp.d('{"strategy":"fixed_bracket"}', pg_temp.virapark(), 1), 40.0,
  'fixed_bracket: faixa com total fixo não multiplica por dia');
select is(pg_temp.d('{"strategy":"fixed_bracket"}', pg_temp.virapark(), 2), 59.8,
  'fixed_bracket: faixa fechada com preço/dia multiplica pelos dias');
select is(pg_temp.d('{"strategy":"fixed_bracket"}', pg_temp.virapark(), 6), 179.4,
  'fixed_bracket: 6 dias');
select is(pg_temp.d('{"strategy":"fixed_bracket"}', pg_temp.virapark(), 7), 125.3,
  'fixed_bracket: 7 dias (mais barato que 6, a inversão que o painel avisa)');
select is(pg_temp.d('{"strategy":"fixed_bracket"}', pg_temp.virapark(), 30), 597.0,
  'fixed_bracket: faixa aberta multiplica pelos dias');

-- Pacote + diária extra (Pare Seguro, 19/11/2026): faixa com total E diária cobra o pacote mais a
-- diária por dia dentro da faixa. Antes a diária era ignorada e, sem faixa 31+, o preço era nulo
-- (o botão de reservar não ativava acima de 30 dias).
create or replace function pg_temp.pare_seguro(com_extra boolean) returns jsonb language sql as $$
  select '[{"from_day":1,"to_day":14,"unit_price":18.9},
           {"from_day":15,"to_day":30,"total_price":290}]'::jsonb
         || case when com_extra
              then '[{"from_day":31,"to_day":null,"total_price":290,"unit_price":18.9}]'::jsonb
              else '[]'::jsonb end;
$$;

select is(pg_temp.d('{"strategy":"fixed_bracket"}', pg_temp.pare_seguro(false), 31), null::numeric,
  'fixed_bracket: sem faixa que cubra o dia, não há preço');
select is(pg_temp.d('{"strategy":"fixed_bracket"}', pg_temp.pare_seguro(true), 30), 290.0,
  'pacote + diária: dia 30 segue no pacote fechado');
select is(pg_temp.d('{"strategy":"fixed_bracket"}', pg_temp.pare_seguro(true), 31), 308.9,
  'pacote + diária: 31 dias = R$ 290 + 1 diária de R$ 18,90');
select is(pg_temp.d('{"strategy":"fixed_bracket"}', pg_temp.pare_seguro(true), 45), 573.5,
  'pacote + diária: 45 dias = R$ 290 + 15 diárias');
select is(pg_temp.d('{"strategy":"fixed_bracket"}', pg_temp.pare_seguro(true), 14), 264.6,
  'pacote + diária: faixa só de diária não muda');

-- uniform_by_duration: a faixa da duração total vale para todos os dias
select is(
  pg_temp.d('{"strategy":"uniform_by_duration"}',
            '[{"from_day":1,"to_day":3,"unit_price":50},{"from_day":4,"to_day":null,"unit_price":30}]'::jsonb,
            5),
  150.0, 'uniform_by_duration: 5 dias x R$ 30');

-- tiered_progressive: soma as camadas
select is(
  pg_temp.d('{"strategy":"tiered_progressive"}',
            '[{"from_day":1,"to_day":2,"unit_price":50},{"from_day":3,"to_day":null,"unit_price":20}]'::jsonb,
            4),
  140.0, 'tiered_progressive: 2x50 + 2x20');

-- Estratégia sem faixas usa os campos da própria regra
select is(
  pg_temp.d('{"strategy":"hourly_capped","hourly_daily_rate":45}', '[]'::jsonb, 3),
  135.0, 'hourly_capped: 3 dias x teto de R$ 45');

-- Rascunho sem estratégia não inventa preço
select is(
  public.simulate_pricing_draft('{}'::jsonb, '[]'::jsonb, array[1]) ->> 'error',
  'Estratégia não informada', 'rascunho sem estratégia devolve erro');

select * from finish();
rollback;
