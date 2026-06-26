begin;
select plan(5);

-- Função existe e é SECURITY DEFINER (precisa contar booking apesar da RLS)
select has_function('public', 'popular_locations', ARRAY['integer'], 'popular_locations(integer) existe');
select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'popular_locations'),
  true, 'popular_locations é SECURITY DEFINER'
);

-- anon pode executar (consumo público da home)
select ok(
  has_function_privilege('anon', 'public.popular_locations(integer)', 'EXECUTE'),
  'anon tem EXECUTE em popular_locations'
);

-- Zero-safe: mesmo sem nenhuma reserva, devolve lotes ativos (até o limite).
select ok(
  (select count(*) from public.popular_locations(6)) =
  least(6, (select count(*) from public.location where status = 'active' and deleted_at is null)),
  'devolve min(limit, nº de locations ativas) mesmo com 0 reservas'
);

-- Respeita o limite.
select ok(
  (select count(*) from public.popular_locations(3)) <= 3,
  'respeita p_limit'
);

select * from finish();
rollback;
