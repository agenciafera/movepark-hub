-- pgTAP: motor de preço (simulate_price). Valores golden de docs/simulacao-precos.md.
-- Rodar com: supabase test db  (requer stack local com schema completo — ver README.md).
-- Espelha test/pricing/cases.ts (que roda contra o banco vivo via integração).

begin;
select plan(20);

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
select is(pg_temp.p('bandeirapark','aeroporto-guarulhos','covered',6), 143.40, 'uniform bandeira 6d');
select is(pg_temp.p('bandeirapark','aeroporto-guarulhos','covered',17), 355.30, 'uniform flip 17d');

-- surcharge (BUG-001: overflow 31+d herda do tipo-base)
select is(pg_temp.strat('aerovalet','aeroporto-guarulhos','valet',35), 'surcharge', 'valet usa surcharge');
select is(pg_temp.p('aerovalet','aeroporto-guarulhos','valet',1), 149.00, 'surcharge 1d');
select is(pg_temp.p('aerovalet','aeroporto-guarulhos','valet',35), 924.00, 'surcharge 35d (regressão BUG-001)');

-- fixed_bracket
select is(pg_temp.p('bandeirapark','aeroporto-guarulhos','valet',1), 149.00, 'fixed_bracket 1d');
select is(pg_temp.p('bandeirapark','aeroporto-guarulhos','valet',6), 594.00, 'fixed_bracket 6d');
select is(pg_temp.p('bandeirapark','aeroporto-guarulhos','valet',18), 792.00, 'fixed_bracket 18d');
select is(pg_temp.p('bandeirapark','aeroporto-guarulhos','valet',35), 924.00, 'fixed_bracket overflow 35d');

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

select * from finish();
rollback;
