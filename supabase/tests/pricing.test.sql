-- pgTAP: motor de preço (simulate_price). Valores golden de docs/simulacao-precos.md.
-- Rodar com: supabase test db  (requer stack local com schema completo, ver README.md).
--
-- ESTE é o lar da cobertura golden por estratégia, e não o `test/pricing/cases.ts`.
--
-- Os dois arquivos eram espelho um do outro até 10/08/2026, quando Aeropark (ex-Bandeirapark) e
-- Abbapark viraram unidades externas. A tabela de preço de uma unidade externa é espelhada do
-- parceiro (E0.13) e muda quando ele muda o preço dele, então o caso golden que a usa como
-- entrada deixa de descrever aquela linha. Os 13 casos afetados saíram do arquivo do banco vivo.
--
-- Aqui eles continuam valendo porque o stack local é construído do `supabase/seed.sql`, que é um
-- retrato congelado das tabelas legadas. `fixed_bracket` e `tiered_progressive` só existem neste
-- arquivo hoje: ao mexer nele, não remova essa cobertura sem colocá-la em outro lugar.

begin;
select plan(21);

-- helper inline: preço de um caso
create or replace function pg_temp.p(c text, l text, t text, d int)
returns numeric language sql as $$
  select (public.simulate_price(c, l, t, d)->>'price')::numeric;
$$;
create or replace function pg_temp.strat(c text, l text, t text, d int)
returns text language sql as $$
  select public.simulate_price(c, l, t, d)->>'strategy';
$$;

-- uniform_by_duration
select is(pg_temp.p('aerovalet','aeroporto-congonhas','covered',1), 31.90, 'uniform 1d');
select is(pg_temp.p('aerovalet','aeroporto-congonhas','covered',6), 191.40, 'uniform flip 6d');
select is(pg_temp.p('aerovalet','aeroporto-congonhas','covered',15), 373.50, 'uniform 15d');
select is(pg_temp.p('aeropark','aeroporto-guarulhos','covered',6), 143.40, 'uniform aeropark 6d');
select is(pg_temp.p('aeropark','aeroporto-guarulhos','covered',17), 355.30, 'uniform flip 17d');

-- surcharge (BUG-001: overflow 31+d herda do tipo-base)
select is(pg_temp.strat('aerovalet','aeroporto-guarulhos','valet',35), 'surcharge', 'valet usa surcharge');
select is(pg_temp.p('aerovalet','aeroporto-guarulhos','valet',1), 149.00, 'surcharge 1d');
select is(pg_temp.p('aerovalet','aeroporto-guarulhos','valet',35), 924.00, 'surcharge 35d (regressão BUG-001)');

-- fixed_bracket
select is(pg_temp.p('aeropark','aeroporto-guarulhos','valet',1), 149.00, 'fixed_bracket 1d');
select is(pg_temp.p('aeropark','aeroporto-guarulhos','valet',6), 594.00, 'fixed_bracket 6d');
select is(pg_temp.p('aeropark','aeroporto-guarulhos','valet',18), 792.00, 'fixed_bracket 18d');
select is(pg_temp.p('aeropark','aeroporto-guarulhos','valet',35), 924.00, 'fixed_bracket overflow 35d');

-- tiered_progressive (soma por camada)
select is(pg_temp.p('abbapark','aeroporto-afonso-pena','covered',1), 19.90, 'tiered 1d');
select is(pg_temp.p('abbapark','aeroporto-afonso-pena','covered',7), 141.30, 'tiered 7d (6×19,90+1×21,90)');

-- incremental_formula
select is(pg_temp.p('airpark','faro','covered',1), 25.00, 'incremental 1d');
select is(pg_temp.p('airpark','faro','covered',5), 55.00, 'incremental 5d (10+5×9)');

-- monthly_remainder
select is(pg_temp.p('ferapark','unidade-aeroporto','covered',30), 310.00, 'monthly 30d');
select is(pg_temp.p('ferapark','unidade-aeroporto','covered',35), 419.95, 'monthly 35d (310+5×21,99)');

-- hourly_capped (base diária)
select is(pg_temp.p('moveparking','nova-iguacu','uncovered',1), 20.00, 'hourly 1 diária');

-- erro estruturado
select ok((public.simulate_price('x','y','covered',1)->>'error') is not null, 'tipo inexistente retorna error');

-- Guard das SETE estratégias. Migrou do `simulate-price.int.test.ts` junto com a cobertura:
-- lá o guard passou a valer só para as estratégias que o banco vivo ainda precifica.
select is(
  (select array_agg(distinct s order by s)
     from unnest(array[
       pg_temp.strat('aerovalet','aeroporto-congonhas','covered',1),
       pg_temp.strat('aerovalet','aeroporto-guarulhos','valet',35),
       pg_temp.strat('aeropark','aeroporto-guarulhos','valet',1),
       pg_temp.strat('abbapark','aeroporto-afonso-pena','covered',1),
       pg_temp.strat('airpark','faro','covered',1),
       pg_temp.strat('ferapark','unidade-aeroporto','covered',30),
       pg_temp.strat('moveparking','nova-iguacu','uncovered',1)
     ]) as s),
  array['fixed_bracket','hourly_capped','incremental_formula','monthly_remainder',
        'surcharge','tiered_progressive','uniform_by_duration'],
  'as sete estratégias do motor continuam exercitadas');

select * from finish();
rollback;
