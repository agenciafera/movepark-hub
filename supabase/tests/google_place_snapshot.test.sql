begin;
select plan(17);

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

-- ── Purge: cumpre o cache de 30 dias sem perder a moderacao ──────────────────
-- A armadilha que este bloco trava: `is_hidden` mora na linha que o purge apagava. Com o
-- refresh parado um mes (o estado de hoje, a Edge nem foi publicada) a sequencia era:
-- admin esconde o lote, o purge apaga a linha vencida, o refresh volta e insere uma linha
-- nova com `is_hidden` no default false. O bloco reaparecia calado.
insert into public.google_place_snapshot
  (place_id, rating, user_rating_count, maps_uri, reviews, is_hidden, fetched_at)
values
  ('ChIJ_oculto_vencido', 4.2, 88, 'https://maps.google.com/?cid=9',
   '[{"rating":5}]'::jsonb, true, now() - interval '31 days');

-- Tres linhas vencidas nesta altura: ChIJ_vencido e ChIJ_admin (visiveis, apagadas) e
-- ChIJ_oculto_vencido (escondida, esvaziada). ChIJ_fresco levou fetched_at = now() no
-- upsert acima e fica de fora.
select is(
  public.purge_google_place_snapshots(),
  3,
  'purge trata as 3 linhas vencidas: 2 visiveis apagadas e 1 escondida esvaziada'
);
select is(
  (select count(*)::int from public.google_place_snapshot where place_id = 'ChIJ_vencido'),
  0,
  'o vencido sumiu da tabela'
);

-- Vencida e escondida: a linha e o flag ficam, o conteudo do Google sai.
select is(
  (select is_hidden from public.google_place_snapshot where place_id = 'ChIJ_oculto_vencido'),
  true,
  'a linha escondida sobrevive ao purge com o is_hidden intacto'
);
select ok(
  (select rating is null
      and user_rating_count = 0
      and maps_uri is null
      and reviews = '[]'::jsonb
     from public.google_place_snapshot
    where place_id = 'ChIJ_oculto_vencido'),
  'nenhum conteudo do Google sobrevive aos 30 dias na linha escondida'
);
-- Idempotente: linha ja esvaziada nao volta a contar, senao o purge diario acusaria
-- trabalho todo dia e o set_updated_at dispararia a toa.
select is(
  public.purge_google_place_snapshots(),
  0,
  'segunda passada nao trata nada: nao ha mais conteudo vencido'
);

select * from finish();
rollback;
