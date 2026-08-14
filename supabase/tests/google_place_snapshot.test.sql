begin;
select plan(10);

-- A tabela existe com a chave certa
select has_table('public', 'google_place_snapshot', 'tabela google_place_snapshot existe');
select col_is_pk('public', 'google_place_snapshot', 'place_id', 'place_id e a PK');

-- Seed: um snapshot fresco e um vencido
insert into public.google_place_snapshot (place_id, rating, user_rating_count, fetched_at)
values ('ChIJ_fresco', 4.6, 312, now() - interval '3 days'),
       ('ChIJ_vencido', 4.9, 100, now() - interval '31 days');

-- Anonimo enxerga so o fresco (TTL mora na policy)
set local role anon;
select is(
  (select count(*)::int from public.google_place_snapshot),
  1,
  'anon ve so o snapshot com menos de 30 dias'
);
select is(
  (select place_id from public.google_place_snapshot),
  'ChIJ_fresco',
  'o snapshot visivel e o fresco'
);

-- Anonimo nao escreve
select throws_ok(
  $$ insert into public.google_place_snapshot (place_id) values ('ChIJ_invasor') $$,
  '42501',
  null,
  'anon nao insere snapshot'
);
select throws_ok(
  $$ update public.google_place_snapshot set rating = 1.0 where place_id = 'ChIJ_fresco' $$,
  '42501',
  null,
  'anon nao atualiza snapshot'
);
reset role;

-- O liga e desliga do hub_admin: is_hidden esconde o bloco inteiro daquela unidade
update public.google_place_snapshot set is_hidden = true where place_id = 'ChIJ_fresco';
set local role anon;
select is(
  (select count(*)::int from public.google_place_snapshot),
  0,
  'is_hidden esconde o snapshot do leitor publico'
);
reset role;
update public.google_place_snapshot set is_hidden = false where place_id = 'ChIJ_fresco';

-- Upsert substitui o conjunto inteiro de reviews, nao acumula
insert into public.google_place_snapshot (place_id, reviews, fetched_at)
values ('ChIJ_fresco', '[{"rating":5}]'::jsonb, now())
on conflict (place_id) do update
  set reviews = excluded.reviews, fetched_at = excluded.fetched_at;
select is(
  (select jsonb_array_length(reviews) from public.google_place_snapshot where place_id = 'ChIJ_fresco'),
  1,
  'upsert substitui o array de reviews'
);

-- Purge apaga de fato o vencido
select is(public.purge_google_place_snapshots(), 1, 'purge apaga 1 snapshot vencido');
select is(
  (select count(*)::int from public.google_place_snapshot where place_id = 'ChIJ_vencido'),
  0,
  'o vencido sumiu da tabela'
);

select * from finish();
rollback;
