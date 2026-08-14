begin;
select plan(14);

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

-- ── hub_admin: cobertura positiva ────────────────────────────────────────────
-- Ate aqui so provamos que anon e negado. Isso nao prova que hub_admin CONSEGUE
-- escrever: um typo em is_hub_admin(), uma policy de escrita esquecida ou uma
-- referencia quebrada passariam pelas 10 asercoes acima do mesmo jeito. Sessao
-- simulada no mesmo padrao de prospect_location.test.sql e prospect_location_admin.test.sql:
-- perfil com role hub_admin, e o sub do JWT apontando pra ele via pg_temp.as_user.
create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
end $$;

do $$
declare uadm uuid := gen_random_uuid();
begin
  insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at) values
    (uadm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','gps-adm@ex.com',now(),now());
  insert into public.profiles(id, role) values (uadm,'hub_admin')
    on conflict (id) do update set role = excluded.role;
  perform set_config('test.uadm', uadm::text, false);
end $$;

set local role authenticated;
select pg_temp.as_user(current_setting('test.uadm'));

-- Insere ja escondido e ja vencido de proposito: se o INSERT passar mesmo assim, a
-- policy de escrita nao esta amarrada por engano ao TTL nem ao is_hidden da leitura.
select lives_ok(
  $$ insert into public.google_place_snapshot (place_id, rating, is_hidden, fetched_at)
     values ('ChIJ_admin', 4.0, true, now() - interval '31 days') $$,
  'hub_admin insere snapshot (prova positiva de INSERT, nao so a negativa de anon)'
);

select lives_ok(
  $$ update public.google_place_snapshot set is_hidden = false where place_id = 'ChIJ_admin' $$,
  'hub_admin atualiza snapshot (flip de is_hidden)'
);
select is(
  (select is_hidden from public.google_place_snapshot where place_id = 'ChIJ_admin'),
  false,
  'a atualizacao persistiu de fato: is_hidden virou false'
);

-- O snapshot segue vencido (31 dias). A policy publica de select nao devolveria esta
-- linha para anon, mas para hub_admin ela aparece porque a policy FOR ALL (using
-- is_hub_admin()) se combina em OR com a policy publica de select. Isto documenta e
-- trava o comportamento atual: se um dia a intencao virar "hub_admin tambem respeita
-- o TTL na leitura", este teste precisa mudar de proposito, nao quebrar sem aviso.
select is(
  (select count(*)::int from public.google_place_snapshot where place_id = 'ChIJ_admin'),
  1,
  'hub_admin ve o snapshot vencido que a policy publica esconderia de anon'
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
